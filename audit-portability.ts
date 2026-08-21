import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname);
const targets = ["index.ts", "env.ts", "db.ts", "domain.ts", "session.ts", "events.ts", "ai.ts", "intent.ts", "escalation.ts", "authorization.ts", "geolocation.ts", "ingestion.ts", "knowledge.ts", "support.ts", "server-vite.ts", "vite.config.ts", "main.tsx", "CustomerHome.tsx", "CustomerLayout.tsx", "CustomerChat.tsx", "AgentWorkspace.tsx", "AdminConsole.tsx", "components", "hooks", "lib", "styles.css", "admin.css", "Dockerfile", "package.json", "0001_initial.sql", "0002_visitor_tracking_consent.sql", "environment.example"];
const forbidden = [/manus/gi, /BUILT_IN_FORGE/gi, /VITE_OAUTH/gi, /OAUTH_SERVER_URL/gi, /OWNER_OPEN_ID/gi, /mysql2/gi, /drizzle/gi];
const findings: Array<{ file: string; term: string }> = [];

async function scan(location: string) {
  if (location === "audit-portability.ts") return;
  const full = path.join(root, location);
  const stat = await fs.stat(full);
  if (stat.isDirectory()) {
    for (const child of await fs.readdir(full)) await scan(path.join(location, child));
    return;
  }
  const source = await fs.readFile(full, "utf-8");
  for (const pattern of forbidden) {
    if (pattern.test(source)) findings.push({ file: location, term: pattern.source });
    pattern.lastIndex = 0;
  }
}

for (const target of targets) {
  try { await scan(target); } catch { /* Optional file absent in a portable distribution. */ }
}

if (findings.length) {
  console.error("Portability audit found required review items:");
  findings.forEach(finding => console.error(`- ${finding.file}: ${finding.term}`));
  process.exitCode = 1;
} else {
  console.log("Portability audit passed: no required platform-runtime identifiers found in application sources.");
}
