import fs from 'fs/promises';
import path from 'path';
import fg from 'fast-glob';
import dotenv from 'dotenv';
import neo4j from 'neo4j-driver';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse = traverseModule.default || traverseModule;

dotenv.config();

const REPO_ROOT = process.env.REPO_ROOT || 'repo';
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || '';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));

const exts = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'];
const babelPlugins = {
  js: { plugins: ['jsx', 'classProperties', 'dynamicImport', 'importAssertions'] },
  ts: { plugins: ['typescript', 'jsx', 'classProperties', 'dynamicImport', 'importAssertions'] }
};

function getBabelOptions(filename) {
  const isTS = filename.endsWith('.ts') || filename.endsWith('.tsx');
  return {
    sourceType: 'module',
    allowImportExportEverywhere: false,
    ranges: false,
    tokens: false,
    plugins: isTS ? babelPlugins.ts.plugins : babelPlugins.js.plugins,
  };
}

function relPath(abs) {
  return path.relative(REPO_ROOT, abs).split(path.sep).join('/');
}

async function* iterFiles() {
  const patterns = exts.map(p => path.posix.join(REPO_ROOT.replace(/\\/g, '/'), p));
  const entries = await fg(patterns, { dot: false });
  for (const file of entries) yield file;
}

async function parseFile(absPath) {
  const code = await fs.readFile(absPath, 'utf8');
  const ast = parse(code, getBabelOptions(absPath));

  const fileRel = relPath(absPath);
  const fileInfo = { path: fileRel, name: path.basename(absPath) };

  const functions = [];
  const classes = [];
  const imports = [];
  const functionCalls = [];

  const functionStack = [];
  const pushCaller = name => functionStack.push(name);
  const popCaller = () => functionStack.pop();
  const currentCaller = () => functionStack.length ? functionStack[functionStack.length - 1] : null;

  traverse(ast, {
    // imports
    ImportDeclaration(path) {
      if (path.node.source && path.node.source.value) {
        imports.push(path.node.source.value);
      }
    },
    CallExpression(path) {
      const callee = path.node.callee;
      let called = null;
      if (callee.type === 'Identifier') {
        called = callee.name;
      } else if (callee.type === 'MemberExpression') {
        // take the property name
        if (callee.property && callee.property.type === 'Identifier') {
          called = callee.property.name;
        }
      }
      if (called) {
        functionCalls.push({ caller: currentCaller(), called });
      }
    },
    // functions
    FunctionDeclaration: {
      enter(path) {
        const name = path.node.id?.name || null;
        if (name) {
          functions.push({ name, file: fileRel });
        }
        pushCaller(name);
      },
      exit() { popCaller(); },
    },
    ArrowFunctionExpression: {
      enter(path) {
        // try to get variable name if assigned: const foo = () => {}
        let name = null;
        const parent = path.parentPath;
        if (parent.isVariableDeclarator() && parent.node.id.type === 'Identifier') {
          name = parent.node.id.name;
          functions.push({ name, file: fileRel });
        }
        pushCaller(name);
      },
      exit() { popCaller(); },
    },
    FunctionExpression: {
      enter(path) {
        let name = null;
        if (path.node.id?.name) name = path.node.id.name;
        else if (path.parentPath.isVariableDeclarator() && path.parent.id.type === 'Identifier') {
          name = path.parent.id.name;
        }
        if (name) functions.push({ name, file: fileRel });
        pushCaller(name);
      },
      exit() { popCaller(); },
    },
    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        const bases = [];
        if (path.node.superClass) {
          if (path.node.superClass.type === 'Identifier') bases.push(path.node.superClass.name);
          // more complex superClass forms can be handled if needed
        }
        classes.push({ name, bases, file: fileRel });
      }
    },
  });

  return { file: fileInfo, functions, classes, imports, functionCalls };
}

async function ingest(parsed, session) {
  // File
  await session.run(
    `MERGE (f:File {path: $path}) SET f.name = $name`,
    { path: parsed.file.path, name: parsed.file.name }
  );

  // Classes
  for (const cls of parsed.classes) {
    await session.run(
      `MERGE (c:Class {name: $name, file: $file})
       MERGE (f:File {path: $file})
       MERGE (c)-[:DEFINED_IN]->(f)`,
      { name: cls.name, file: cls.file }
    );
    for (const base of cls.bases || []) {
      await session.run(
        `MERGE (child:Class {name: $child, file: $file})
         MERGE (parent:Class {name: $parent, file: ''})
         MERGE (child)-[:EXTENDS]->(parent)`,
        { child: cls.name, parent: base, file: cls.file }
      );
    }
  }

  // Functions
  for (const fun of parsed.functions) {
    await session.run(
      `MERGE (fun:Function {name: $name, file: $file})
       MERGE (f:File {path: $file})
       MERGE (fun)-[:DEFINED_IN]->(f)`,
      { name: fun.name, file: fun.file }
    );
  }

  // Imports
  for (const imp of parsed.imports) {
    // attempt to resolve to a file within repo
    let toPath = null;
    const candidates = [imp, imp + '.js', imp + '.ts', imp + '.jsx', imp + '.tsx'];
    for (const cand of candidates) {
      const abs = path.join(REPO_ROOT, cand);
      try {
        await fs.access(abs);
        toPath = relPath(abs);
        break;
      } catch {}
    }
    if (toPath) {
      await session.run(
        `MERGE (f1:File {path: $from})
         MERGE (f2:File {path: $to})
         MERGE (f1)-[:IMPORTS]->(f2)`,
        { from: parsed.file.path, to: toPath }
      );
    }
  }

  // Calls and Used-in
  for (const fc of parsed.functionCalls) {
    if (fc.caller && fc.called) {
      await session.run(
        `MERGE (funA:Function {name: $caller, file: $file})
         MERGE (funB:Function {name: $called, file: $file})
         MERGE (funA)-[:CALLS]->(funB)`,
        { caller: fc.caller, called: fc.called, file: parsed.file.path }
      );
    }
    if (fc.called) {
      await session.run(
        `MERGE (fun:Function {name: $called, file: $file})
         MERGE (f:File {path: $file})
         MERGE (fun)-[:USED_IN]->(f)`,
        { called: fc.called, file: parsed.file.path }
      );
    }
  }
}

async function main() {
  const session = driver.session({ database: NEO4J_DATABASE });
  try {
    for await (const file of iterFiles()) {
      const parsed = await parseFile(file);
      await ingest(parsed, session);
      console.log(`Ingested ${parsed.file.path} (funcs=${parsed.functions.length}, classes=${parsed.classes.length}, imports=${parsed.imports.length}, calls=${parsed.functionCalls.length})`);
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
