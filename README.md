## GitHub Repo Graph (JS)

Create a knowledge graph of a JavaScript/TypeScript codebase in Neo4j. This project parses a repository and stores files, functions, classes, imports, and function-call relationships as a graph for exploration and analytics.

Repository: [`Aditya-Sakpal/github_repo_graph_js`](https://github.com/Aditya-Sakpal/github_repo_graph_js)

### What it does
- Parse JS/TS (and optionally Python via the Python ingester) source files
- Store nodes: `File`, `Function`, `Class` (optionally `Endpoint`)
- Store relationships: `DEFINED_IN`, `IMPORTS`, `CALLS`, `USED_IN`, `EXTENDS`, `HANDLED_BY`
- Apply constraints and indexes via `schema.cypher`

### Prerequisites
- Neo4j 5.x (local or AuraDB)
- Node.js 18+ and npm
- Python 3.10+ (for running the Python tools)

---

## Quick Start (step-by-step)

Follow these steps exactly as listed.

1) Clone the repo

```bash
git clone https://github.com/Aditya-Sakpal/github_repo_graph_js.git
cd github_repo_graph_js
```

2) Activate virtual env

Windows (PowerShell):
```powershell
python -m venv venv
./venv/Scripts/Activate.ps1
```

macOS/Linux (bash):
```bash
python3 -m venv venv
source venv/bin/activate
```

3) Setup the Neo4j instance

- Provision Neo4j (Desktop, Server, or AuraDB)
- Ensure you have a URI and credentials. For AuraDB use `neo4j+s://<instance>.databases.neo4j.io`.

4) env credentials

Create a `.env` file in the project root with your connection info and the repo path to ingest (defaults shown):

```env
# Neo4j
NEO4J_URI=neo4j+s://<your-instance>.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<your-password>
NEO4J_DATABASE=neo4j

# Local path to the repository to ingest
# Example: absolute or relative path
REPO_ROOT=repo
```

5) Activate env and download required packages

Python deps:
```bash
pip install -r requirements.txt  # if you add one
# or install directly:
pip install neo4j python-dotenv tree_sitter tree_sitter_languages pytz
```

Node deps:
```bash
npm install
```

6) Run upload_schema.py file for uploading the relations and constraints

```bash
python upload_schema.py
```

This executes `schema.cypher` to create unique constraints and helpful indexes before ingestion.

7) npm i and run ingest_js file inorder to ingest the js repo in the repo

Place the repository you want to analyze at the path specified by `REPO_ROOT` (default: `repo/` folder inside this project) or set `REPO_ROOT` in `.env` to point to your target repo. Then run:

```bash
npm run ingest:js
# or
node ingest_js.mjs
```

You should see progress logs like "Ingested <file> (funcs=..., classes=..., imports=..., calls=...)".

---

## Alternative: Python-based ingester (multi-language)

The Python tool `ingest_structure.py` supports JS/TS and Python using Tree-sitter (with graceful fallbacks).

```bash
python ingest_structure.py --repo "<path-to-your-repo>"
# optional dry run (parse only):
python ingest_structure.py --repo "<path>" --dry-run
```

After completion, it prints a summary of created nodes/edges.

## Connectivity check (optional)

To verify connectivity to Neo4j before ingesting:

```bash
python neo4j_connect.py
```

---

## How it works

- Node ingester (`ingest_js.mjs`):
  - Uses `@babel/parser` and `@babel/traverse` to build ASTs
  - Extracts `imports`, `functions`, `classes`, `functionCalls`
  - Writes to Neo4j with the official `neo4j-driver`

- Python ingester (`ingest_structure.py`):
  - Uses Python AST for `.py` files and Tree-sitter for JS/TS
  - Normalizes and writes `File`, `Function`, `Class`, `Endpoint` (best-effort) and relationships

- Schema (`schema.cypher`):
  - Creates uniqueness constraints and indexes for faster writes/queries

Labels and relationships you can expect:
- `(:File {path, name})`
- `(:Function {name, file})-[:DEFINED_IN]->(:File)`
- `(:Class {name, file})-[:DEFINED_IN]->(:File)`
- `(:File)-[:IMPORTS]->(:File)`
- `(:Function)-[:CALLS]->(:Function)`
- `(:Function)-[:USED_IN]->(:File)`
- `(:Class)-[:EXTENDS]->(:Class)`
- `(:Endpoint)-[:HANDLED_BY]->(:Function)` (Python ingester when decorators are detected)

---

## Example Cypher queries

Count nodes and relationships:
```cypher
MATCH (n) RETURN labels(n) AS label, count(*) AS count ORDER BY count DESC;
MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS count ORDER BY count DESC;
```

Files that import other files:
```cypher
MATCH (a:File)-[r:IMPORTS]->(b:File)
RETURN a.path AS from, b.path AS to LIMIT 25;
```

Most called functions (within same file heuristic):
```cypher
MATCH (:Function)-[c:CALLS]->(f:Function)
RETURN f.name AS function, count(c) AS calls
ORDER BY calls DESC LIMIT 25;
```

Functions used in a file:
```cypher
MATCH (fun:Function)-[:USED_IN]->(f:File {path: $filePath})
RETURN fun.name ORDER BY fun.name;
```

Class inheritance map:
```cypher
MATCH (c:Class)-[:EXTENDS]->(p:Class)
RETURN c.name AS child, p.name AS parent LIMIT 50;
```

---

## Tips & troubleshooting

- Ensure `.env` is loaded by both Python and Node processes (project uses `python-dotenv` and `dotenv`).
- For AuraDB, use the `neo4j+s://` scheme and the correct username/password.
- Large repos: set `REPO_ROOT` to a trimmed copy or exclude generated code; the ingester scans `**/*.js, *.jsx, *.ts, *.tsx`.
- If constraints already exist, `upload_schema.py` is idempotent (uses `IF NOT EXISTS`).
- If you hit connection errors, run `python neo4j_connect.py` to validate credentials and reachability.

---

## Scripts reference

- `upload_schema.py`: Loads `schema.cypher` into the configured Neo4j database
- `ingest_js.mjs`: Node-based JS/TS ingester (npm script `ingest:js`)
- `ingest_structure.py`: Python-based multi-language ingester
- `neo4j_connect.py`: Quick connectivity test

---

## License

No license specified. See repository for details.

---

## Credits

Project repo: [`Aditya-Sakpal/github_repo_graph_js`](https://github.com/Aditya-Sakpal/github_repo_graph_js)


