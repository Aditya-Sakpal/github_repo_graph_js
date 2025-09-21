import os
from neo4j import GraphDatabase, basic_auth
from dotenv import load_dotenv
load_dotenv()


# Load Neo4j connection settings (better via env vars)
NEO4J_URI = os.getenv("NEO4J_URI")       # e.g. "neo4j+s://<instance>.databases.neo4j.io"
NEO4J_USER = os.getenv("NEO4J_USERNAME")     # often "neo4j"
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

# Optionally, the database name (Aura might have a default one). If needed:
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")  

def load_cypher_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def _strip_cypher_comments(script: str) -> str:
    lines = []
    for line in script.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("//"):
            continue
        # remove inline // comments
        if "//" in line:
            line = line.split("//", 1)[0]
        lines.append(line)
    return "\n".join(lines)


def _split_statements(script: str) -> list[str]:
    # simple split on semicolons not inside quotes
    statements: list[str] = []
    current = []
    in_single = False
    in_double = False
    escape = False
    for ch in script:
        if ch == "\\" and not escape:
            escape = True
            current.append(ch)
            continue
        if ch == "'" and not in_double and not escape:
            in_single = not in_single
        elif ch == '"' and not in_single and not escape:
            in_double = not in_double
        if ch == ";" and not in_single and not in_double:
            stmt = "".join(current).strip()
            if stmt:
                statements.append(stmt)
            current = []
        else:
            current.append(ch)
        escape = False
    tail = "".join(current).strip()
    if tail:
        statements.append(tail)
    return statements


def run_cypher_script(driver: GraphDatabase.driver, script: str):
    cleaned = _strip_cypher_comments(script)
    statements = _split_statements(cleaned)
    if not statements:
        print("No statements to run.")
        return
    with driver.session(database=NEO4J_DATABASE) as session:
        for idx, stmt in enumerate(statements, start=1):
            result = session.run(stmt)
            summary = result.consume()
            print(f"[{idx}/{len(statements)}] counters: {summary.counters}")

def main():
    if not (NEO4J_URI and NEO4J_USER and NEO4J_PASSWORD):
        raise RuntimeError("Please set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD environment variables")

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    # Verify connectivity (optional but helpful)
    try:
        driver.verify_connectivity()
        print("Connected to Neo4j!")
    except Exception as e:
        print("Failed to connect to Neo4j:", e)
        return

    script = load_cypher_file("schema.cypher")  # path to your schema file
    run_cypher_script(driver, script)

    driver.close()

if __name__ == "__main__":
    main()