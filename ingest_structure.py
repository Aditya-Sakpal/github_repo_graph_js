import os
import ast
import re
import argparse
from collections import defaultdict
from neo4j import GraphDatabase
from dotenv import load_dotenv

from tree_sitter_languages import get_parser

load_dotenv()

# ------------------- Config / Environment -------------------

NEO4J_URI = os.getenv("NEO4J_URI", "neo4j+s://<your-instance>.databases.neo4j.io")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")

REPO_ROOT = os.getenv("REPO_ROOT", "repo")  # path to your local cloned repo

# ------------------- Parser Setup -------------------

EXT_LANG_MAP = {
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    # extend as needed
}

LANGUAGE_PARSERS = {}  # map lang_key -> parser
SKIPPED_COUNTS = defaultdict(int)  # lang_key -> count of skipped files

# load parsers
for lang_key in set(EXT_LANG_MAP.values()):
    # Python uses the built-in AST parser, don't load a tree-sitter parser for it
    if lang_key == 'python':
        continue
    try:
        parser = get_parser(lang_key)
        if parser is not None:
            LANGUAGE_PARSERS[lang_key] = parser
            print(f"[setup] Loaded parser for: {lang_key}")
        else:
            LANGUAGE_PARSERS[lang_key] = None
            print(f"[setup] No parser available for: {lang_key}")
    except Exception as e:
        LANGUAGE_PARSERS[lang_key] = None
        print(f"[setup] Could not load parser for {lang_key}: {type(e).__name__}: {e}")

# ------------------- Parsers -------------------

def parse_python_file(filepath):
    """Parse with Python AST."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            source = f.read()
    except Exception as e:
        print(f"[python] Could not read {filepath}: {e}")
        return None

    try:
        tree = ast.parse(source, filename=filepath)
    except Exception as e:
        print(f"[python] Could not parse AST {filepath}: {e}")
        return None

    rel_path = os.path.relpath(filepath, REPO_ROOT).replace(os.sep, "/")
    file_info = {"path": rel_path, "name": os.path.basename(filepath)}

    functions = []
    classes = []
    imports = []
    function_calls = []
    endpoints = []

    func_defs = {}

    for node in ast.walk(tree):
        # imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                imports.append(f"{module}.{alias.name}" if module else alias.name)
        # classes
        elif isinstance(node, ast.ClassDef):
            base_names = []
            for base in node.bases:
                if isinstance(base, ast.Name):
                    base_names.append(base.id)
                elif isinstance(base, ast.Attribute):
                    parts = []
                    curr = base
                    while isinstance(curr, ast.Attribute):
                        parts.insert(0, curr.attr)
                        curr = curr.value
                    if isinstance(curr, ast.Name):
                        parts.insert(0, curr.id)
                    base_names.append(".".join(parts))
                else:
                    base_names.append(ast.dump(base))
            classes.append({"name": node.name, "bases": base_names, "file": rel_path})
        # functions
        elif isinstance(node, ast.FunctionDef):
            functions.append({"name": node.name, "file": rel_path})
            func_defs[node] = {"name": node.name, "file": rel_path}
            # endpoints: decorators
            for dec in node.decorator_list:
                if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
                    attr = dec.func
                    dec_name = attr.attr.lower()
                    if dec_name in ("get", "post", "put", "delete", "patch"):
                        endpoints.append({"name": node.name, "file": rel_path, "decorator": dec_name})

    # function calls
    for func_node, caller_info in func_defs.items():
        for sub in ast.walk(func_node):
            if isinstance(sub, ast.Call):
                called = None
                if isinstance(sub.func, ast.Name):
                    called = sub.func.id
                elif isinstance(sub.func, ast.Attribute):
                    parts = []
                    curr = sub.func
                    while isinstance(curr, ast.Attribute):
                        parts.insert(0, curr.attr)
                        curr = curr.value
                    if isinstance(curr, ast.Name):
                        parts.insert(0, curr.id)
                    called = ".".join(parts)
                if called:
                    function_calls.append({
                        "caller": caller_info["name"],
                        "caller_file": caller_info["file"],
                        "called": called,
                        "called_file": None
                    })

    return {
        "file": file_info,
        "functions": functions,
        "classes": classes,
        "imports": imports,
        "function_calls": function_calls,
        "endpoints": endpoints,
    }


def parse_with_treesitter(filepath, lang_key):
    """Parse using tree_sitter_languages parser."""
    parser = LANGUAGE_PARSERS.get(lang_key)
    if parser is None:
        SKIPPED_COUNTS[lang_key] += 1
        return None

    try:
        with open(filepath, 'rb') as f:
            source_bytes = f.read()
    except Exception as e:
        print(f"[ts] Failed to read {filepath}: {e}")
        return None

    try:
        tree = parser.parse(source_bytes)
    except Exception as e:
        print(f"[ts] Failed to parse {filepath}: {e}")
        return None

    root = tree.root_node
    rel_path = os.path.relpath(filepath, REPO_ROOT).replace(os.sep, "/")
    file_info = {"path": rel_path, "name": os.path.basename(filepath)}

    functions = []
    classes = []
    imports = []
    function_calls = []
    endpoints = []

    # Helper walk
    def walk(node):
        for child in node.children:
            yield child
            yield from walk(child)

    # Extract
    for node in walk(root):
        # imports
        if node.type in ("import_statement", "import_clause", "import_declaration"):
            try:
                text = source_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="ignore")
                imports.append(text.strip())
            except:
                pass
        # function declarations
        elif node.type in ("function_declaration", "method_definition", "arrow_function"):
            fname = None
            name_node = node.child_by_field_name("name")
            if name_node:
                try:
                    fname = source_bytes[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="ignore")
                except:
                    fname = None
            else:
                # fallback: identifier child
                for c in node.children:
                    if c.type == "identifier":
                        try:
                            fname = source_bytes[c.start_byte:c.end_byte].decode("utf-8", errors="ignore")
                        except:
                            fname = None
                        break
            if fname:
                functions.append({"name": fname, "file": rel_path})
        # class definitions
        elif node.type in ("class_declaration", "class_definition"):
            cname = "UnknownClass"
            name_node = node.child_by_field_name("name")
            if name_node:
                try:
                    cname = source_bytes[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="ignore")
                except:
                    cname = "UnknownClass"
            bases = []
            for c in node.children:
                if c.type in ("extends_clause", "heritage_clause", "superclass"):
                    for b in c.children:
                        if b.type == "identifier":
                            try:
                                nameb = source_bytes[b.start_byte:b.end_byte].decode("utf-8", errors="ignore")
                                bases.append(nameb)
                            except:
                                pass
            classes.append({"name": cname, "bases": bases, "file": rel_path})
        # function calls
        elif node.type in ("call_expression", "call", "member_expression"):
            called = None
            for c in node.children:
                if c.type == "identifier":
                    try:
                        called = source_bytes[c.start_byte:c.end_byte].decode("utf-8", errors="ignore")
                    except:
                        called = None
                    break
            if called:
                # find caller ancestor
                caller = None
                tmp = node
                while tmp:
                    if tmp.type in ("function_declaration", "method_definition", "arrow_function"):
                        name_node = tmp.child_by_field_name("name")
                        if name_node:
                            try:
                                caller = source_bytes[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="ignore")
                            except:
                                caller = None
                        break
                    tmp = tmp.parent
                if caller:
                    function_calls.append({
                        "caller": caller,
                        "caller_file": rel_path,
                        "called": called,
                        "called_file": None
                    })

    return {
        "file": file_info,
        "functions": functions,
        "classes": classes,
        "imports": imports,
        "function_calls": function_calls,
        "endpoints": endpoints,
    }


def parse_js_like_file(filepath, lang_key):
    """Lightweight regex-based parser for JS/TS when AST parsers are unavailable."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            src = f.read()
    except Exception as e:
        return None

    rel_path = os.path.relpath(filepath, REPO_ROOT).replace(os.sep, "/")
    file_info = {"path": rel_path, "name": os.path.basename(filepath)}

    functions_set = set()
    classes_set = set()
    imports_set = set()
    called_set = []  # preserve order, may contain duplicates

    # imports: ES modules and CommonJS require
    for m in re.finditer(r"^\s*import\s+(?:[^;]*?\s+from\s+)?['\"]([^'\"]+)['\"]", src, re.MULTILINE):
        imports_set.add(m.group(1))
    for m in re.finditer(r"require\(\s*['\"]([^'\"]+)['\"]\s*\)", src):
        imports_set.add(m.group(1))

    # function declarations
    for m in re.finditer(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", src):
        functions_set.add(m.group(1))
    # const foo = (...) => or function expression
    for m in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\b|\(?[A-Za-z_$,\s]*\)?\s*=>)", src):
        functions_set.add(m.group(1))

    # class declarations
    for m in re.finditer(r"\bclass\s+([A-Za-z_$][\w$]*)\b", src):
        classes_set.add(m.group(1))

    # function calls (best-effort): capture foo(...) and a.b.c(...)-> c
    keyword_blocklist = {
        'if','for','while','switch','return','function','class','new','catch','typeof','await','super','constructor','import','export','case','delete','in','of','do','else','try','finally','with','yield','void','instanceof'
    }
    call_pattern = re.compile(r"\b(?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*)\s*\(")
    for m in call_pattern.finditer(src):
        name = m.group(1)
        if name not in keyword_blocklist:
            called_set.append(name)

    functions = [{"name": n, "file": rel_path} for n in sorted(functions_set)]
    classes = [{"name": n, "bases": [], "file": rel_path} for n in sorted(classes_set)]
    imports = list(sorted(imports_set))

    return {
        "file": file_info,
        "functions": functions,
        "classes": classes,
        "imports": imports,
        "function_calls": [
            {"caller": None, "caller_file": rel_path, "called": n, "called_file": None}
            for n in called_set
        ],
        "endpoints": [],
    }


def parse_any_file(filepath):
    _, ext = os.path.splitext(filepath.lower())
    lang_key = EXT_LANG_MAP.get(ext)
    if not lang_key:
        return None
    if lang_key == "python":
        return parse_python_file(filepath)
    # Prefer tree-sitter when available
    if LANGUAGE_PARSERS.get(lang_key) is not None:
        ts_parsed = parse_with_treesitter(filepath, lang_key)
        if ts_parsed:
            return ts_parsed
    # Fallback to regex-based parser
    return parse_js_like_file(filepath, lang_key)


# ------------------- Neo4j Ingestion -------------------

class GraphIngestor:
    def __init__(self, uri, user, pwd, database):
        self.driver = GraphDatabase.driver(uri, auth=(user, pwd))
        self.database = database

    def close(self):
        self.driver.close()

    def ingest_file(self, file_info):
        with self.driver.session(database=self.database) as session:
            session.run(
                """
                MERGE (f:File {path: $path})
                SET f.name = $name
                """,
                path=file_info["path"],
                name=file_info["name"]
            )

    def ingest_class(self, class_info):
        with self.driver.session(database=self.database) as session:
            session.run(
                """
                MERGE (c:Class {name: $name, file: $file})
                MERGE (f:File {path: $file})
                MERGE (c)-[:DEFINED_IN]->(f)
                """,
                name=class_info["name"],
                file=class_info["file"]
            )

    def ingest_function(self, func_info):
        with self.driver.session(database=self.database) as session:
            session.run(
                """
                MERGE (fun:Function {name: $name, file: $file})
                MERGE (f:File {path: $file})
                MERGE (fun)-[:DEFINED_IN]->(f)
                """,
                name=func_info["name"],
                file=func_info["file"]
            )

    def ingest_import(self, from_file, to_file_path):
        if not to_file_path:
            return
        with self.driver.session(database=self.database) as session:
            session.run(
                """
                MERGE (f1:File {path: $from_path})
                MERGE (f2:File {path: $to_path})
                MERGE (f1)-[:IMPORTS]->(f2)
                """,
                from_path=from_file,
                to_path=to_file_path
            )

    def ingest_function_call(self, caller, caller_file, called, called_file=None):
        with self.driver.session(database=self.database) as session:
            session.run(
                """
                MERGE (funA:Function {name: $caller, file: $caller_file})
                MERGE (funB:Function {name: $called, file: $called_file})
                MERGE (funA)-[:CALLS]->(funB)
                """,
                caller=caller,
                caller_file=caller_file,
                called=called,
                called_file=called_file or ""
            )

    def ingest_function_used_in(self, called, called_file, used_in_file):
        with self.driver.session(database=self.database) as session:
            session.run(
                """
                MERGE (fun:Function {name: $called, file: $called_file})
                MERGE (f:File {path: $used_in_file})
                MERGE (fun)-[:USED_IN]->(f)
                """,
                called=called,
                called_file=called_file or "",
                used_in_file=used_in_file,
            )

    def ingest_endpoint(self, endpoint_info):
        with self.driver.session(database=self.database) as session:
            session.run(
                """
                MERGE (e:Endpoint {name: $name, file: $file, decorator: $decorator})
                MERGE (fun:Function {name: $name, file: $file})
                MERGE (e)-[:HANDLED_BY]->(fun)
                """,
                name=endpoint_info["name"],
                file=endpoint_info["file"],
                decorator=endpoint_info["decorator"]
            )

    def ingest_class_extends(self, child_name, child_file, parent_name, parent_file=None):
        with self.driver.session(database=self.database) as session:
            session.run(
                """
                MERGE (child:Class {name: $child_name, file: $child_file})
                MERGE (parent:Class {name: $parent_name, file: $parent_file})
                MERGE (child)-[:EXTENDS]->(parent)
                """,
                child_name=child_name,
                child_file=child_file,
                parent_name=parent_name,
                parent_file=parent_file or "",
            )

    def print_summary_counts(self):
        with self.driver.session(database=self.database) as session:
            def _one(query: str) -> int:
                res = session.run(query)
                rec = res.single()
                return rec[0] if rec else 0

            calls = _one("MATCH ()-[r:CALLS]->() RETURN count(r)")
            used_in = _one("MATCH ()-[r:USED_IN]->() RETURN count(r)")
            extends = _one("MATCH ()-[r:EXTENDS]->() RETURN count(r)")
            imports = _one("MATCH ()-[r:IMPORTS]->() RETURN count(r)")
            files = _one("MATCH (n:File) RETURN count(n)")
            funcs = _one("MATCH (n:Function) RETURN count(n)")
            classes = _one("MATCH (n:Class) RETURN count(n)")

            print(f"Summary: files={files}, functions={funcs}, classes={classes}, IMPORTS={imports}, CALLS={calls}, USED_IN={used_in}, EXTENDS={extends}")

# ------------------- Ingestion Runner -------------------

def run_ingestion(repo_root, ingestor, dry_run=False):
    func_name_to_file = {}
    parsed_all = []

    # First pass: parse files, collect functions
    for root, dirs, files in os.walk(repo_root):
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            if ext in EXT_LANG_MAP:
                full = os.path.join(root, fname)
                parsed = parse_any_file(full)
                if parsed is None:
                    # Fallback: still ingest File node so the graph has coverage
                    rel_path = os.path.relpath(full, repo_root).replace(os.sep, "/")
                    parsed = {
                        "file": {"path": rel_path, "name": os.path.basename(full)},
                        "functions": [],
                        "classes": [],
                        "imports": [],
                        "function_calls": [],
                        "endpoints": [],
                    }
                parsed_all.append(parsed)
                for fun in parsed.get("functions", []):
                    func_name_to_file[fun["name"]] = fun["file"]

    # Second pass: ingest
    for parsed in parsed_all:
        if dry_run:
            print(f"[dry-run] Parsed {parsed['file']['path']}: funcs {len(parsed['functions'])}, imports {len(parsed['imports'])}, classes {len(parsed['classes'])}")
            continue

        ingestor.ingest_file(parsed["file"])

        for cls in parsed.get("classes", []):
            ingestor.ingest_class(cls)
            # Create EXTENDS relationships to parent classes by name (file may be unknown)
            for base_name in cls.get("bases", []) or []:
                if base_name:
                    ingestor.ingest_class_extends(cls["name"], cls["file"], base_name)

        for fun in parsed.get("functions", []):
            ingestor.ingest_function(fun)

        for ep in parsed.get("endpoints", []):
            ingestor.ingest_endpoint(ep)

        # Imports mapping
        for imp in parsed.get("imports", []):
            # try to clean import string
            imp_clean = imp.strip().rstrip(";").strip()
            to_path = None
            # heuristics: map module name to file in repo
            candidate = imp_clean.replace(".", "/")
            for e in [".py", ".js", ".ts", ".jsx", ".tsx"]:
                cand = os.path.join(repo_root, candidate + e)
                if os.path.isfile(cand):
                    to_path = os.path.relpath(cand, repo_root).replace(os.sep, "/")
                    break
            if to_path:
                ingestor.ingest_import(parsed["file"]["path"], to_path)

        # Function calls
        for fc in parsed.get("function_calls", []):
            # Resolve called function's file if known; else assume local to caller's file
            resolved_called_file = func_name_to_file.get(fc["called"]) or fc.get("caller_file")
            # Create CALLS edge only if we know the caller function name
            if fc.get("caller"):
                ingestor.ingest_function_call(
                    fc["caller"], fc["caller_file"], fc["called"], resolved_called_file
                )
            # Always record USED_IN: the called function (by resolved file) is used in the caller's file
            ingestor.ingest_function_used_in(
                fc["called"], resolved_called_file, fc["caller_file"]
            )

def main():
    parser = argparse.ArgumentParser(description="Fixed multi-lang ingestion into Neo4j")
    parser.add_argument("--repo", type=str, default=REPO_ROOT, help="Path to repo root")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, no Neo4j writes")
    parser.add_argument("--log-missing", action="store_true", help="Print per-file missing-parser messages")
    args = parser.parse_args()

    ingestor = GraphIngestor(NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE)
    try:
        run_ingestion(args.repo, ingestor, dry_run=args.dry_run)
        # Print a short summary about skipped files if any
        if SKIPPED_COUNTS:
            total_skipped = sum(SKIPPED_COUNTS.values())
            print(f"Missing parser summary: {total_skipped} files skipped.")
            for lk, cnt in SKIPPED_COUNTS.items():
                print(f"  - {lk}: {cnt}")
        if not args.dry_run:
            print("Ingestion complete.")
            # show a brief summary of created nodes/edges
            ingestor.print_summary_counts()
    finally:
        ingestor.close()

if __name__ == "__main__":
    main()