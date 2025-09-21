// Schema Definition for Code-Knowledge Graph

// Unique constraints / Node Key constraints
CREATE CONSTRAINT file_path_unique
IF NOT EXISTS
FOR (f:File)
REQUIRE f.path IS UNIQUE;

CREATE CONSTRAINT function_fullname_unique
IF NOT EXISTS
FOR (fun:Function)
REQUIRE (fun.name, fun.file) IS UNIQUE;

CREATE CONSTRAINT class_fullname_unique
IF NOT EXISTS
FOR (c:Class)
REQUIRE (c.name, c.file) IS UNIQUE;

CREATE CONSTRAINT endpoint_path_methods_unique
IF NOT EXISTS
FOR (e:Endpoint)
REQUIRE (e.path, e.methods) IS UNIQUE;

// Indexes
CREATE INDEX IF NOT EXISTS FOR (fun:Function) ON (fun.name);
CREATE INDEX IF NOT EXISTS FOR (c:Class) ON (c.name);
CREATE INDEX IF NOT EXISTS FOR (f:File) ON (f.name);
CREATE INDEX IF NOT EXISTS FOR (e:Endpoint) ON (e.path);

// Existence constraints (properties must be present)
CREATE CONSTRAINT function_has_file
IF NOT EXISTS
FOR (fun:Function)
REQUIRE fun.file IS NOT NULL;

CREATE CONSTRAINT class_has_file
IF NOT EXISTS
FOR (c:Class)
REQUIRE c.file IS NOT NULL;

CREATE CONSTRAINT file_has_name
IF NOT EXISTS
FOR (f:File)
REQUIRE f.name IS NOT NULL;

CREATE CONSTRAINT endpoint_has_path
IF NOT EXISTS
FOR (e:Endpoint)
REQUIRE e.path IS NOT NULL;

CREATE CONSTRAINT endpoint_methods_not_null
IF NOT EXISTS
FOR (e:Endpoint)
REQUIRE e.methods IS NOT NULL;

// ------------------------------------------------------------
// Relationships overview (documentation)
// ------------------------------------------------------------
// Functions
// (fun:Function)-[:DEFINED_IN]->(f:File)
// (fun:Function)-[:USED_IN]->(f:File)
// (funA:Function)-[:CALLS]->(funB:Function)
//
// Classes
// (c:Class)-[:DEFINED_IN]->(f:File)
// (c:Class)-[:USED_IN]->(f:File)
// (c:Class)-[:EXTENDS]->(parent:Class)          // optional if you model inheritance
//
// Files
// (f1:File)-[:IMPORTS]->(f2:File)
//
// Endpoints
// (e:Endpoint)-[:HANDLED_BY]->(fun:Function)
//
// Notes:
// - Relationship types are shown for reference; Neo4j does not require explicit
//   relationship type declarations in schema. They are created during ingestion.
// - If you add relationship properties in the future (e.g., usage counts, line numbers),
//   Neo4j 5 supports relationship property existence constraints, which you can add here.