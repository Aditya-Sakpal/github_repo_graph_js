from neo4j import GraphDatabase
import os

from dotenv import load_dotenv
load_dotenv()

# replace with your Aura details
URI = os.getenv("NEO4J_URI")
USER = os.getenv("NEO4J_USERNAME")
PASSWORD = os.getenv("NEO4J_PASSWORD")
DATABASE = os.getenv("NEO4J_DATABASE") or "neo4j"


driver = GraphDatabase.driver(URI, auth=(USER, PASSWORD))

def test_connection():
    # Verify connectivity early to get clearer errors
    driver.verify_connectivity()
    with driver.session(database=DATABASE) as session:
        result = session.run("RETURN 'Connected to Neo4j Aura!' AS msg")
        for record in result:
            print(record["msg"])

if __name__ == "__main__":
    try:
        test_connection()
    except Exception as exc:
        print(f"Connection failed: {type(exc).__name__}: {exc}")
        raise
    finally:
        driver.close()
