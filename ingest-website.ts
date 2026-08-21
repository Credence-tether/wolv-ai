import "dotenv/config";
import { getDb } from "./db";
import { ingestApprovedWebsite } from "./ingestion";

const root = process.env.APPROVED_SOURCE_URL;
if (!root) throw new Error("APPROVED_SOURCE_URL is required to ingest approved website knowledge.");
const result = await ingestApprovedWebsite(root);
console.log(`Completed approved-knowledge ingestion. Visited ${result.visited} page(s); indexed ${result.indexed} changed source(s).`);
await getDb().end();
