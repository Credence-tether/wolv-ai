import "dotenv/config";
import { getDb } from "./db";

const db = getDb();
const settings = await db.query<{ setting_value: number }>("SELECT setting_value::text::integer AS setting_value FROM app_settings WHERE setting_key = 'visitor_activity_retention_days'");
const days = Number(settings.rows[0]?.setting_value ?? process.env.VISITOR_ACTIVITY_RETENTION_DAYS ?? 30);
const result = await db.query("DELETE FROM visitor_activities WHERE happened_at < NOW() - ($1::text || ' days')::interval", [Math.max(1, Math.min(3650, days))]);
console.log(`Removed ${result.rowCount ?? 0} expired visitor activity record(s).`);
await db.end();
