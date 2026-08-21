import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env, requireDatabaseUrl } from "./env";

let pool: Pool | undefined;

export function getDb() {
  if (!pool) {
    pool = new Pool({ connectionString: requireDatabaseUrl(), max: 10 });
  }
  return pool;
}

export const databaseIsConfigured = () => Boolean(env.databaseUrl);

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getDb().query<T>(text, values);
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
