import fs from "fs";
import csv from "csv-parser";
import pool from "./db.js";

async function insertCodesFromCSV(filePath) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rows = [];

    // Read CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => rows.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    // Insert rows one by one (safe, but not fastest)
    for (const row of rows) {
      const { code, code_id } = row;

      await client.query(
        `INSERT INTO codes (code, code_id) VALUES ($1, $2)
         ON CONFLICT (code_id) DO NOTHING`, 
        [code, code_id]
      );
    }

    await client.query("COMMIT");
    console.log("✅ All rows inserted successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error inserting rows:", err.message);
  } finally {
    client.release();
  }
}

// Run script
insertCodesFromCSV("./codes.csv");
