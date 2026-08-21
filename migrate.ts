import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "./db";

const migrationsDir = path.dirname(new URL(import.meta.url).pathname);
const db = getDb();

await db.query("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
const applied = await db.query<{ name: string }>("SELECT name FROM app_migrations");
const executed = new Set(applied.rows.map(row => row.name));
const entries = (await fs.readdir(migrationsDir)).filter(file => /^\d+_.+\.sql$/.test(file)).sort();

for (const name of entries) {
  if (executed.has(name)) continue;
  const sql = await fs.readFile(path.join(migrationsDir, name), "utf-8");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO app_migrations(name) VALUES($1)", [name]);
    await client.query("COMMIT");
    console.log(`Applied ${name}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

await db.end();
