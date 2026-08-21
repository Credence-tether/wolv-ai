import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
if (!email || password.length < 12) throw new Error("ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters are required.");
const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || "Administrator";
const db = getDb();
const passwordHash = await bcrypt.hash(password, 12);
await db.query(`INSERT INTO app_users(id, email, display_name, password_hash, role, active) VALUES($1, $2, $3, $4, 'admin', TRUE) ON CONFLICT(email) DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash, role = 'admin', active = TRUE, updated_at = NOW()`, [randomUUID(), email, displayName, passwordHash]);
console.log(`Administrator account ready for ${email}.`);
await db.end();
