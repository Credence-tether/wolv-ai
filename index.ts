import "dotenv/config";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { EventBus } from "./events";
import { env } from "./env";
import { databaseIsConfigured, query } from "./db";
import { lookupApproximateIpLocation } from "./geolocation";
import { ingestApprovedWebsite } from "./ingestion";
import { replaceKnowledgeSource } from "./knowledge";
import { createVisitorCookie, ensureVisitorId, getCurrentStaff, getVisitorId, loginStaff, logoutStaff } from "./session";
import { agentClaim, agentReply, agentResolve, createConversation, ensureVisitorSession, getConversationForStaff, getConversationForVisitor, recordVisitorActivity, replyAsAI } from "./support";
import { setupVite, serveStatic } from "./server-vite";
import type { StaffUser } from "./domain";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
const httpServer = createServer(app);
const eventBus = new EventBus(httpServer);

app.set("trust proxy", process.env.TRUST_PROXY === "true");
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => { void handler(request, response).catch(next); };
}

function bodyString(request: Request, key: string, fallback = "") {
  const value = request.body?.[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function requireDatabase(_request: Request, response: Response, next: NextFunction) {
  if (!databaseIsConfigured()) {
    response.status(503).json({ error: "Database is not configured. Set DATABASE_URL before using this feature." });
    return;
  }
  next();
}

async function visitorIdFor(request: Request, response: Response) {
  return ensureVisitorId(request, response);
}

async function visitorRequestMetadata(request: Request, consent: boolean) {
  if (!consent) return {};
  const userAgent = request.get("user-agent") ?? "";
  const location = await lookupApproximateIpLocation(request.ip ?? request.socket.remoteAddress ?? "").catch(() => ({}));
  return {
    referrer: request.body?.referrer ? String(request.body.referrer).slice(0, 500) : undefined,
    timezone: request.body?.timezone ? String(request.body.timezone).slice(0, 120) : undefined,
    deviceType: /tablet/i.test(userAgent) ? "tablet" : /mobile|android|iphone|ipad/i.test(userAgent) ? "mobile" : "desktop",
    browser: /edg/i.test(userAgent) ? "Edge" : /chrome/i.test(userAgent) ? "Chrome" : /firefox/i.test(userAgent) ? "Firefox" : /safari/i.test(userAgent) ? "Safari" : "Other",
    operatingSystem: /windows/i.test(userAgent) ? "Windows" : /mac os|macintosh/i.test(userAgent) ? "macOS" : /android/i.test(userAgent) ? "Android" : /iphone|ipad|ios/i.test(userAgent) ? "iOS" : /linux/i.test(userAgent) ? "Linux" : "Other",
    ...location,
  };
}

async function initializeVisitor(request: Request, response: Response) {
  const visitorId = await visitorIdFor(request, response);
  const trackingConsent = request.body?.trackingConsent !== false;
  const pathValue = bodyString(request, "path", "/").slice(0, 500);
  const metadata = await visitorRequestMetadata(request, trackingConsent);
  const result = await ensureVisitorSession({ visitorId, trackingConsent, path: pathValue, ...metadata });
  if (result.created && result.trackingConsent) {
    eventBus.emitToAdmins({ type: "visitor", payload: { visitorId, status: "online", action: "arrived", currentPath: pathValue } });
    eventBus.emitToAgents({ type: "visitor", payload: { visitorId, status: "online", action: "arrived", currentPath: pathValue } });
    await query("INSERT INTO notifications(id, notification_type, title, body, metadata) VALUES($1, 'visitor-arrival', $2, $3, $4)", [randomUUID(), "New visitor", "A consented visitor just arrived.", JSON.stringify({ visitorId, path: pathValue })]);
    eventBus.emitToAgents({ type: "notification", payload: { visitorId, title: "New visitor", body: "A consented visitor just arrived." } });
    eventBus.emitToAdmins({ type: "notification", payload: { visitorId, title: "New visitor", body: "A consented visitor just arrived." } });
  }
  response.json({ visitorId, trackingConsent: result.trackingConsent });
}

app.get("/api/health", (_request, response) => response.json({ status: "ok", databaseConfigured: databaseIsConfigured() }));

app.post("/api/auth/login", requireDatabase, asyncRoute(async (request, response) => {
  const email = bodyString(request, "email");
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  if (!email || !password) { response.status(400).json({ error: "Email and password are required." }); return; }
  const user = await loginStaff(response, email, password);
  if (!user) { response.status(401).json({ error: "Invalid staff credentials." }); return; }
  response.json({ user });
}));

app.post("/api/auth/logout", asyncRoute(async (_request, response) => { await logoutStaff(response); response.json({ ok: true }); }));
app.get("/api/auth/me", requireDatabase, asyncRoute(async (request, response) => { response.json({ user: await getCurrentStaff(request) }); }));

app.post("/api/visitor/initialize", requireDatabase, asyncRoute(initializeVisitor));
app.post("/api/visitor/consent", requireDatabase, asyncRoute(initializeVisitor));
app.post("/api/visitor/activity", requireDatabase, asyncRoute(async (request, response) => {
  const visitorId = await visitorIdFor(request, response);
  await ensureVisitorSession({ visitorId, path: bodyString(request, "path", "/"), trackingConsent: undefined });
  const type = bodyString(request, "type");
  if (!["page-view", "page-exit", "cta", "chat-opened", "chat-started", "heartbeat"].includes(type)) { response.status(400).json({ error: "Unsupported activity type." }); return; }
  const recorded = await recordVisitorActivity({ visitorId, type: type as "page-view" | "page-exit" | "cta" | "chat-opened" | "chat-started" | "heartbeat", path: bodyString(request, "path", "/"), metadata: request.body?.metadata });
  if (recorded && type === "page-view") await query("UPDATE visitor_sessions SET current_path = $2, last_seen_at = NOW(), is_online = TRUE, offline_at = NULL WHERE id = $1 AND tracking_consent = TRUE", [visitorId, bodyString(request, "path", "/")]);
  if (recorded) {
    eventBus.emitToAdmins({ type: "activity", payload: { visitorId, activityType: type, path: bodyString(request, "path", "/") } });
    eventBus.emitToAgents({ type: "activity", payload: { visitorId, activityType: type, path: bodyString(request, "path", "/") } });
  }
  response.json({ recorded });
}));
app.post("/api/visitor/heartbeat", requireDatabase, asyncRoute(async (request, response) => {
  const visitorId = await visitorIdFor(request, response);
  const pathValue = bodyString(request, "path", "/").slice(0, 500);
  const result = await query("UPDATE visitor_sessions SET is_online = TRUE, last_seen_at = NOW(), current_path = $2, offline_at = NULL WHERE id = $1 AND tracking_consent = TRUE", [visitorId, pathValue]);
  const recorded = (result.rowCount ?? 0) > 0 && await recordVisitorActivity({ visitorId, type: "heartbeat", path: pathValue });
  if (recorded) {
    eventBus.emitToAdmins({ type: "visitor", payload: { visitorId, status: "online", action: "heartbeat", currentPath: pathValue } });
    eventBus.emitToAgents({ type: "visitor", payload: { visitorId, status: "online", action: "heartbeat", currentPath: pathValue } });
  }
  response.json({ recorded });
}));

app.post("/api/conversations", requireDatabase, asyncRoute(async (request, response) => {
  const visitorId = await visitorIdFor(request, response);
  await ensureVisitorSession({ visitorId, path: "/", trackingConsent: undefined });
  const conversation = await createConversation(visitorId);
  await recordVisitorActivity({ visitorId, type: "chat-started", path: bodyString(request, "path", "/") });
  eventBus.emitToAgents({ type: "conversation", payload: { conversationId: conversation.id, status: conversation.status } });
  response.json({ ...conversation, messages: [] });
}));
app.get("/api/conversations/:id", requireDatabase, asyncRoute(async (request, response) => {
  const visitorId = await getVisitorId(request);
  if (!visitorId) { response.status(404).json({ error: "Conversation not found." }); return; }
  const conversation = await getConversationForVisitor(request.params.id, visitorId);
  if (!conversation) { response.status(404).json({ error: "Conversation not found." }); return; }
  response.json(conversation);
}));
app.post("/api/conversations/:id/messages", requireDatabase, asyncRoute(async (request, response) => {
  const visitorId = await getVisitorId(request);
  const content = bodyString(request, "content");
  if (!visitorId || !content) { response.status(400).json({ error: "A visitor session and message are required." }); return; }
  if (content.length > 8000) { response.status(413).json({ error: "Message is too long." }); return; }
  const conversation = await replyAsAI({ conversationId: request.params.id, visitorId, message: content, bus: eventBus });
  response.json(conversation);
}));

async function staffFrom(request: Request, response: Response) {
  const staff = await getCurrentStaff(request);
  if (!staff) { response.status(401).json({ error: "Staff authentication required." }); return null; }
  return staff;
}

async function staffRole(request: Request, response: Response, roles: Array<"agent" | "admin">) {
  const staff = await staffFrom(request, response);
  if (!staff) return null;
  if (!roles.includes(staff.role as "agent" | "admin")) { response.status(403).json({ error: "Insufficient staff permissions." }); return null; }
  return staff;
}

app.get("/api/agent/queue", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["agent", "admin"])) return;
  const rows = await query("SELECT c.id, c.status, c.ai_attempts, c.escalation_reason, c.handoff_summary, c.updated_at, vs.current_path, vs.country, vs.city FROM conversations c JOIN visitor_sessions vs ON vs.id = c.visitor_session_id WHERE c.status IN ('pending-agent', 'agent-active') ORDER BY CASE WHEN c.status = 'pending-agent' THEN 0 ELSE 1 END, c.updated_at DESC");
  response.json(rows.rows);
}));
app.get("/api/agent/notifications", requireDatabase, asyncRoute(async (request, response) => {
  const staff = await staffRole(request, response, ["agent", "admin"]);
  if (!staff) return;
  const rows = await query("SELECT id, notification_type, title, body, created_at FROM notifications WHERE recipient_id IS NULL OR recipient_id = $1 ORDER BY created_at DESC LIMIT 50", [staff.id]);
  response.json(rows.rows);
}));
app.get("/api/agent/conversations/:id", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["agent", "admin"])) return;
  const conversation = await getConversationForStaff(request.params.id);
  if (!conversation) { response.status(404).json({ error: "Conversation not found." }); return; }
  response.json(conversation);
}));
app.post("/api/agent/conversations/:id/claim", requireDatabase, asyncRoute(async (request, response) => {
  const staff = await staffRole(request, response, ["agent", "admin"]);
  if (!staff) return;
  response.json(await agentClaim(request.params.id, staff, eventBus));
}));
app.post("/api/agent/conversations/:id/messages", requireDatabase, asyncRoute(async (request, response) => {
  const staff = await staffRole(request, response, ["agent", "admin"]);
  if (!staff) return;
  const content = bodyString(request, "content");
  if (!content || content.length > 8000) { response.status(400).json({ error: "A non-empty message up to 8,000 characters is required." }); return; }
  response.json(await agentReply(request.params.id, staff, content, eventBus));
}));
app.post("/api/agent/conversations/:id/resolve", requireDatabase, asyncRoute(async (request, response) => {
  const staff = await staffRole(request, response, ["agent", "admin"]);
  if (!staff) return;
  response.json(await agentResolve(request.params.id, staff, eventBus));
}));

app.get("/api/admin/visitors", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["admin"])) return;
  await query("UPDATE visitor_sessions SET is_online = FALSE, offline_at = COALESCE(offline_at, NOW()) WHERE tracking_consent = TRUE AND is_online = TRUE AND last_seen_at < NOW() - INTERVAL '2 minutes'");
  const rows = await query("SELECT vs.id, vs.current_path, vs.country, vs.city, vs.is_online, COALESCE((SELECT c.status FROM conversations c WHERE c.visitor_session_id = vs.id AND c.status <> 'resolved' ORDER BY c.updated_at DESC LIMIT 1), 'No chat') AS chat_status FROM visitor_sessions vs WHERE vs.tracking_consent = TRUE ORDER BY vs.is_online DESC, vs.last_seen_at DESC LIMIT 100");
  response.json(rows.rows);
}));
app.get("/api/admin/visitors/:id", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["admin"])) return;
  const session = await query("SELECT id, current_path, country, city, is_online, entry_path, region, device_type, browser, operating_system, timezone FROM visitor_sessions WHERE id = $1 AND tracking_consent = TRUE", [request.params.id]);
  if (!session.rows[0]) { response.status(404).json({ error: "Visitor not found." }); return; }
  const activity = await query("SELECT activity_type, path, happened_at FROM visitor_activities WHERE visitor_session_id = $1 ORDER BY happened_at DESC LIMIT 100", [request.params.id]);
  const conversations = await query("SELECT id, status, escalation_reason, updated_at FROM conversations WHERE visitor_session_id = $1 ORDER BY updated_at DESC", [request.params.id]);
  response.json({ session: session.rows[0], activity: activity.rows, conversations: conversations.rows });
}));
app.get("/api/admin/settings", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["admin"])) return;
  const rows = await query("SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key");
  response.json(rows.rows);
}));
app.put("/api/admin/settings/:key", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["admin"])) return;
  const key = request.params.key;
  if (!["escalation_threshold", "sensitive_topics", "visitor_activity_retention_days"].includes(key)) { response.status(400).json({ error: "Unsupported setting." }); return; }
  const value = request.body?.value;
  if (key === "escalation_threshold" && (!Number.isInteger(value) || value < 1 || value > 10)) { response.status(400).json({ error: "Escalation threshold must be an integer from 1 to 10." }); return; }
  if (key === "visitor_activity_retention_days" && (!Number.isInteger(value) || value < 1 || value > 3650)) { response.status(400).json({ error: "Retention must be an integer from 1 to 3,650 days." }); return; }
  if (key === "sensitive_topics" && (!Array.isArray(value) || value.some(item => typeof item !== "string"))) { response.status(400).json({ error: "Sensitive topics must be an array of strings." }); return; }
  await query("INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES($1, $2, NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()", [key, JSON.stringify(value)]);
  response.json({ ok: true });
}));
app.get("/api/admin/agents", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["admin"])) return;
  const rows = await query("SELECT id, email, display_name, role, active, created_at FROM app_users WHERE role IN ('agent', 'admin') ORDER BY created_at DESC");
  response.json(rows.rows);
}));
app.post("/api/admin/agents", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["admin"])) return;
  const email = bodyString(request, "email").toLowerCase();
  const displayName = bodyString(request, "displayName");
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const role = request.body?.role === "admin" ? "admin" : "agent";
  if (!email || !displayName || password.length < 12) { response.status(400).json({ error: "Name, email, and a password of at least 12 characters are required." }); return; }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await query("INSERT INTO app_users(id, email, display_name, password_hash, role) VALUES($1, $2, $3, $4, $5) RETURNING id, email, display_name, role, active, created_at", [randomUUID(), email, displayName, passwordHash, role]);
    response.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) { response.status(409).json({ error: "That email is already in use." }); return; }
    throw error;
  }
}));
app.patch("/api/admin/agents/:id", requireDatabase, asyncRoute(async (request, response) => {
  const admin = await staffRole(request, response, ["admin"]);
  if (!admin) return;
  if (request.params.id === admin.id && request.body?.active === false) { response.status(400).json({ error: "An administrator cannot disable their own account." }); return; }
  if (typeof request.body?.active !== "boolean") { response.status(400).json({ error: "The active field must be boolean." }); return; }
  const result = await query("UPDATE app_users SET active = $2, updated_at = NOW() WHERE id = $1 AND role IN ('agent', 'admin') RETURNING id, email, display_name, role, active, created_at", [request.params.id, request.body.active]);
  if (!result.rows[0]) { response.status(404).json({ error: "Staff account not found." }); return; }
  response.json(result.rows[0]);
}));
app.get("/api/admin/conversations", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["admin"])) return;
  const search = typeof request.query.q === "string" ? request.query.q.trim() : "";
  const result = await query("SELECT c.id, c.status, c.ai_attempts, c.escalation_reason, c.updated_at, vs.current_path, vs.country, vs.city FROM conversations c JOIN visitor_sessions vs ON vs.id = c.visitor_session_id WHERE ($1 = '' OR c.id ILIKE $2 OR COALESCE(c.escalation_reason, '') ILIKE $2 OR COALESCE(vs.current_path, '') ILIKE $2) ORDER BY c.updated_at DESC LIMIT 200", [search, `%${search}%`]);
  response.json(result.rows);
}));
app.post("/api/admin/knowledge", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["admin"])) return;
  const url = bodyString(request, "url");
  const title = bodyString(request, "title");
  const content = bodyString(request, "content");
  if (!url || !title || content.length < 100) { response.status(400).json({ error: "A source URL, title, and at least 100 characters of approved content are required." }); return; }
  new URL(url);
  response.status(201).json(await replaceKnowledgeSource({ url, title, text: content }));
}));
app.post("/api/admin/knowledge/reindex", requireDatabase, asyncRoute(async (request, response) => {
  if (!await staffRole(request, response, ["admin"])) return;
  const url = bodyString(request, "url") || env.approvedSourceUrl;
  if (!url) { response.status(400).json({ error: "Provide an approved source URL or configure APPROVED_SOURCE_URL." }); return; }
  response.json(await ingestApprovedWebsite(url));
}));

app.use((request: Request, response: Response, next: NextFunction) => { if (request.path.startsWith("/api/")) { response.status(404).json({ error: "API route not found." }); return; } next(); });

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  if (response.headersSent) return;
  response.status(500).json({ error: "The server could not complete that request." });
});

async function startServer() {
  if (env.nodeEnv === "development") await setupVite(app, httpServer);
  else serveStatic(app, rootDir);
  httpServer.listen(env.port, () => console.log(`Support Command listening on ${env.appOrigin}`));
}

void startServer().catch(error => { console.error(error); process.exitCode = 1; });
