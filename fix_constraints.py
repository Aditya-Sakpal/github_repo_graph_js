import os
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")

def drop_legacy_function_name_unique(driver):
    to_drop = []
    with driver.session(database=NEO4J_DATABASE) as session:
        result = session.run("""
            SHOW CONSTRAINTS YIELD name, type, entityType, labelsOrTypes, properties
        """)
        for record in result:
            labels = record["labelsOrTypes"] or []
            props = record["properties"] or []
            ctype = record["type"] or ""
            if (
                record["entityType"] == "NODE"
                and labels == ["Function"]
                and props == ["name"]
                and "UNIQUENESS" in ctype
            ):
                to_drop.append(record["name"]) 

    for cname in to_drop:
        with driver.session(database=NEO4J_DATABASE) as session:
            print(f"Dropping legacy constraint: {cname}")
            session.run(f"DROP CONSTRAINT {cname} IF EXISTS")

def main():
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USERNAME, NEO4J_PASSWORD))
    try:
        driver.verify_connectivity()
        drop_legacy_function_name_unique(driver)
        print("Done.")
    finally:
        driver.close()

if __name__ == "__main__":
    main()


