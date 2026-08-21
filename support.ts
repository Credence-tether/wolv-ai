import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getAIProvider } from "./ai";
import { transaction, query } from "./db";
import type { ConversationState, Intent, StaffUser } from "./domain";
import { classifyIntent, isComplexRequest, isUnresolvedSignal } from "./intent";
import { searchKnowledge } from "./knowledge";
import type { EventBus } from "./events";
import { mandatoryEscalationReason, resolutionStage, shouldEscalateForUnresolvedAttempt, verifiedKnowledgeFallbackReason } from "./escalation";

type Conversation = {
  id: string;
  visitor_session_id: string;
  customer_id?: string | null;
  status: ConversationState;
  ai_attempts: number;
  escalation_reason: string | null;
  handoff_summary: string | null;
  assigned_agent_id: string | null;
  updated_at: Date;
};
type SupportMessage = { id: string; sender_type: string; sender_id: string | null; content: string; intent: string | null; created_at: Date };
type Activity = { activity_type: string; path: string | null; happened_at: Date };

async function setting<T>(key: string, fallback: T): Promise<T> {
  const result = await query<{ setting_value: T }>("SELECT setting_value FROM app_settings WHERE setting_key = $1", [key]);
  return result.rows[0]?.setting_value ?? fallback;
}

async function recordEvent(client: PoolClient, conversationId: string, eventType: string, actorType: string, detail: Record<string, unknown> = {}) {
  await client.query(
    "INSERT INTO conversation_events(id, conversation_id, event_type, actor_type, detail) VALUES($1, $2, $3, $4, $5)",
    [randomUUID(), conversationId, eventType, actorType, JSON.stringify(detail)],
  );
}

async function addMessage(client: PoolClient, input: { conversationId: string; senderType: "visitor" | "ai" | "agent" | "system"; senderId?: string; content: string; intent?: string; metadata?: Record<string, unknown> }) {
  const id = randomUUID();
  const result = await client.query<SupportMessage>(
    `INSERT INTO messages(id, conversation_id, sender_type, sender_id, content, intent, metadata)
     VALUES($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, sender_type, sender_id, content, intent, created_at`,
    [id, input.conversationId, input.senderType, input.senderId ?? null, input.content, input.intent ?? null, JSON.stringify(input.metadata ?? {})],
  );
  return result.rows[0];
}

export async function ensureVisitorSession(input: { visitorId: string; trackingConsent?: boolean; path?: string; referrer?: string; timezone?: string; deviceType?: string; browser?: string; operatingSystem?: string; country?: string; region?: string; city?: string }) {
  return transaction(async client => {
    const existing = await client.query<{ id: string; tracking_consent: boolean }>("SELECT id, tracking_consent FROM visitor_sessions WHERE id = $1", [input.visitorId]);
    const consent = input.trackingConsent ?? existing.rows[0]?.tracking_consent ?? false;
    if (!existing.rows[0]) {
      await client.query(
        `INSERT INTO visitor_sessions(id, tracking_consent, tracking_consent_at, is_online, entry_path, current_path, referrer, timezone, device_type, browser, operating_system, country, region, city)
         VALUES($1, $2, CASE WHEN $2 THEN NOW() ELSE NULL END, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [input.visitorId, consent, consent, consent ? input.path ?? "/" : null, consent ? input.referrer ?? null : null, consent ? input.timezone ?? null : null, consent ? input.deviceType ?? null : null, consent ? input.browser ?? null : null, consent ? input.operatingSystem ?? null : null, consent ? input.country ?? null : null, consent ? input.region ?? null : null, consent ? input.city ?? null : null],
      );
      if (consent) await client.query("INSERT INTO visitor_activities(id, visitor_session_id, activity_type, path) VALUES($1, $2, 'arrival', $3)", [randomUUID(), input.visitorId, input.path ?? "/"]);
      return { created: true, trackingConsent: consent, consentChanged: consent };
    }
    if (input.trackingConsent === false && existing.rows[0].tracking_consent) {
      await client.query("UPDATE visitor_sessions SET tracking_consent = FALSE, tracking_consent_at = NULL, is_online = FALSE, entry_path = NULL, current_path = NULL, referrer = NULL, timezone = NULL, device_type = NULL, browser = NULL, operating_system = NULL, country = NULL, region = NULL, city = NULL, offline_at = NOW() WHERE id = $1", [input.visitorId]);
      await client.query("DELETE FROM visitor_activities WHERE visitor_session_id = $1", [input.visitorId]);
      return { created: false, trackingConsent: false, consentChanged: true };
    }
    if (consent) {
      await client.query("UPDATE visitor_sessions SET tracking_consent = TRUE, tracking_consent_at = COALESCE(tracking_consent_at, NOW()), is_online = TRUE, last_seen_at = NOW(), entry_path = COALESCE(entry_path, $2), current_path = COALESCE($2, current_path), referrer = COALESCE($3, referrer), timezone = COALESCE($4, timezone), device_type = COALESCE($5, device_type), browser = COALESCE($6, browser), operating_system = COALESCE($7, operating_system), country = COALESCE($8, country), region = COALESCE($9, region), city = COALESCE($10, city), offline_at = NULL WHERE id = $1", [input.visitorId, input.path ?? null, input.referrer ?? null, input.timezone ?? null, input.deviceType ?? null, input.browser ?? null, input.operatingSystem ?? null, input.country ?? null, input.region ?? null, input.city ?? null]);
      if (!existing.rows[0].tracking_consent) await client.query("INSERT INTO visitor_activities(id, visitor_session_id, activity_type, path) VALUES($1, $2, 'arrival', $3)", [randomUUID(), input.visitorId, input.path ?? "/"]);
    }
    return { created: false, trackingConsent: consent, consentChanged: consent !== existing.rows[0].tracking_consent };
  });
}

export async function recordVisitorActivity(input: { visitorId: string; type: "page-view" | "page-exit" | "cta" | "chat-opened" | "chat-started" | "heartbeat"; path?: string; metadata?: Record<string, unknown> }) {
  const result = await query("INSERT INTO visitor_activities(id, visitor_session_id, activity_type, path, metadata) SELECT $1, id, $2, $3, $4 FROM visitor_sessions WHERE id = $5 AND tracking_consent = TRUE", [randomUUID(), input.type, input.path ?? null, JSON.stringify(input.metadata ?? {}), input.visitorId]);
  return (result.rowCount ?? 0) > 0;
}

export async function createConversation(visitorId: string, customerId?: string) {
  const existing = await query<Conversation>(
    `SELECT id, visitor_session_id, customer_id, status, ai_attempts, escalation_reason, handoff_summary, assigned_agent_id, updated_at
     FROM conversations WHERE visitor_session_id = $1 AND status <> 'resolved' ORDER BY updated_at DESC LIMIT 1`,
    [visitorId],
  );
  if (existing.rows[0]) return existing.rows[0];
  const id = randomUUID();
  const result = await query<Conversation>(
    `INSERT INTO conversations(id, visitor_session_id, customer_id) VALUES($1, $2, $3)
     RETURNING id, visitor_session_id, customer_id, status, ai_attempts, escalation_reason, handoff_summary, assigned_agent_id, updated_at`,
    [id, visitorId, customerId ?? null],
  );
  return result.rows[0];
}

export async function getConversationForVisitor(conversationId: string, visitorId: string) {
  const conversation = await query<Conversation>(
    `SELECT id, visitor_session_id, customer_id, status, ai_attempts, escalation_reason, handoff_summary, assigned_agent_id, updated_at
     FROM conversations WHERE id = $1 AND visitor_session_id = $2`,
    [conversationId, visitorId],
  );
  if (!conversation.rows[0]) return null;
  const messages = await query<SupportMessage>("SELECT id, sender_type, sender_id, content, intent, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at", [conversationId]);
  return { ...conversation.rows[0], messages: messages.rows };
}

export async function getConversationForCustomer(conversationId: string, customerId: string) {
  const conversation = await query<Conversation>(
    `SELECT id, visitor_session_id, customer_id, status, ai_attempts, escalation_reason, handoff_summary, assigned_agent_id, updated_at
     FROM conversations WHERE id = $1 AND customer_id = $2`,
    [conversationId, customerId],
  );
  if (!conversation.rows[0]) return null;
  const messages = await query<SupportMessage>("SELECT id, sender_type, sender_id, content, intent, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at", [conversationId]);
  return { ...conversation.rows[0], messages: messages.rows };
}

export async function getConversationForStaff(conversationId: string) {
  const conversation = await query<Conversation & { display_name: string | null; current_path: string | null; country: string | null; city: string | null }>(
    `SELECT c.id, c.visitor_session_id, c.customer_id, c.status, c.ai_attempts, c.escalation_reason, c.handoff_summary, c.assigned_agent_id, c.updated_at,
      u.display_name, vs.current_path, vs.country, vs.city
     FROM conversations c JOIN visitor_sessions vs ON vs.id = c.visitor_session_id LEFT JOIN app_users u ON u.id = c.assigned_agent_id WHERE c.id = $1`,
    [conversationId],
  );
  if (!conversation.rows[0]) return null;
  const messages = await query<SupportMessage>("SELECT id, sender_type, sender_id, content, intent, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at", [conversationId]);
  const activity = await query<Activity>("SELECT activity_type, path, happened_at FROM visitor_activities WHERE visitor_session_id = $1 ORDER BY happened_at DESC LIMIT 20", [conversation.rows[0].visitor_session_id]);
  return { ...conversation.rows[0], messages: messages.rows, activity: activity.rows };
}

export function buildHandoffSummary(history: SupportMessage[], reason: string, activity: Activity[]) {
  const visitorText = history.filter(message => message.sender_type === "visitor").map(message => message.content).slice(-6).join(" ");
  const attempts = history.filter(message => message.sender_type === "ai").map(message => message.content).slice(-3).join(" ");
  const journey = activity.slice(0, 8).reverse().map(item => `${item.activity_type}${item.path ? ` (${item.path})` : ""}`).join(" → ");
  return `Visitor objective and context: ${visitorText || "No visitor message recorded."}\n\nAI assistance already attempted: ${attempts || "No completed AI response."}\n\nRelevant visitor journey: ${journey || "No activity context recorded."}\n\nReason for handoff: ${reason}`;
}

async function escalate(input: { conversationId: string; reason: string; bus: EventBus }) {
  const history = await query<SupportMessage>("SELECT id, sender_type, sender_id, content, intent, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at", [input.conversationId]);
  const visitor = await query<{ visitor_session_id: string }>("SELECT visitor_session_id FROM conversations WHERE id = $1", [input.conversationId]);
  const activity = visitor.rows[0] ? await query<Activity>("SELECT activity_type, path, happened_at FROM visitor_activities WHERE visitor_session_id = $1 ORDER BY happened_at DESC LIMIT 12", [visitor.rows[0].visitor_session_id]) : { rows: [] as Activity[] };
  const summary = buildHandoffSummary(history.rows, input.reason, activity.rows);
  const event = await transaction(async client => {
    await client.query("UPDATE conversations SET status = 'pending-agent', escalation_reason = $2, handoff_summary = $3, updated_at = NOW() WHERE id = $1 AND status = 'AI-handling'", [input.conversationId, input.reason, summary]);
    await recordEvent(client, input.conversationId, "escalated", "ai", { reason: input.reason });
    const systemMessage = await addMessage(client, { conversationId: input.conversationId, senderType: "system", content: "This conversation has been routed to a human support agent." });
    await client.query("INSERT INTO notifications(id, notification_type, title, body, metadata) VALUES($1, 'escalation', $2, $3, $4)", [randomUUID(), "Conversation awaiting pickup", input.reason, JSON.stringify({ conversationId: input.conversationId })]);
    return systemMessage;
  });
  if (visitor.rows[0]) input.bus.emitToVisitor(visitor.rows[0].visitor_session_id, { type: "conversation", payload: { conversationId: input.conversationId, status: "pending-agent" } });
  input.bus.emitToAgents({ type: "notification", payload: { conversationId: input.conversationId, title: "Conversation awaiting pickup", reason: input.reason } });
  input.bus.emitToAgents({ type: "message", payload: { conversationId: input.conversationId, message: event } });
  return summary;
}

export async function replyAsAI(input: { conversationId: string; visitorId: string; message: string; bus: EventBus }) {
  const sensitiveTopics = await setting<string[]>("sensitive_topics", []);
  const threshold = await setting<number>("escalation_threshold", 3);
  const intent = classifyIntent(input.message, sensitiveTopics);
  const conversation = await getConversationForVisitor(input.conversationId, input.visitorId);
  if (!conversation) throw new Error("Conversation not found.");
  if (conversation.status !== "AI-handling") throw new Error("This conversation is awaiting or receiving human support.");
  const visitorMessage = await transaction(client => addMessage(client, { conversationId: input.conversationId, senderType: "visitor", content: input.message, intent }));
  input.bus.emitToVisitor(input.visitorId, { type: "message", payload: { conversationId: input.conversationId, message: visitorMessage } });
  input.bus.emitToAgents({ type: "message", payload: { conversationId: input.conversationId, message: visitorMessage } });

  if (intent === "high-purchase-interest") {
    await query("INSERT INTO notifications(id, notification_type, title, body, metadata) VALUES($1, 'high-intent', $2, $3, $4)", [randomUUID(), "Potential high-intent visitor", "A visitor asked a conversion-oriented question and may need informed guidance.", JSON.stringify({ conversationId: input.conversationId })]);
    input.bus.emitToAgents({ type: "notification", payload: { conversationId: input.conversationId, title: "Potential high-intent visitor" } });
  }

  const mandatoryReason = mandatoryEscalationReason(intent);
  if (mandatoryReason) {
    await escalate({ conversationId: input.conversationId, reason: mandatoryReason, bus: input.bus });
    return getConversationForVisitor(input.conversationId, input.visitorId);
  }
  if (intent === "prompt-injection") {
    const refusal = await transaction(client => addMessage(client, { conversationId: input.conversationId, senderType: "ai", intent, content: "I can’t provide internal instructions, private data, or unverified business information. I can still help with a legitimate question about the approved services or support process." }));
    input.bus.emitToVisitor(input.visitorId, { type: "message", payload: { conversationId: input.conversationId, message: refusal } });
    return getConversationForVisitor(input.conversationId, input.visitorId);
  }

  if (isComplexRequest(input.message)) {
    await escalate({ conversationId: input.conversationId, reason: "The request requires human judgement or authority beyond safe AI resolution.", bus: input.bus });
    return getConversationForVisitor(input.conversationId, input.visitorId);
  }

  const unresolved = isUnresolvedSignal(input.message);
  if (shouldEscalateForUnresolvedAttempt({ intent, existingAttempts: conversation.ai_attempts, unresolvedSignal: unresolved, threshold })) {
    await escalate({ conversationId: input.conversationId, reason: `The visitor remained unresolved after ${conversation.ai_attempts} substantive AI attempts.`, bus: input.bus });
    return getConversationForVisitor(input.conversationId, input.visitorId);
  }

  const { nextAttempts, stage: phase } = resolutionStage(conversation.ai_attempts, unresolved);
  const knowledge = await searchKnowledge(input.message);
  const knowledgeFallback = verifiedKnowledgeFallbackReason(knowledge.length);
  if (knowledgeFallback) {
    await escalate({ conversationId: input.conversationId, reason: knowledgeFallback, bus: input.bus });
    return getConversationForVisitor(input.conversationId, input.visitorId);
  }
  const history = await query<SupportMessage>("SELECT id, sender_type, sender_id, content, intent, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 18", [input.conversationId]);
  const activity = await query<Activity>("SELECT activity_type, path, happened_at FROM visitor_activities WHERE visitor_session_id = $1 ORDER BY happened_at DESC LIMIT 12", [conversation.visitor_session_id]);
  const visitorContext = activity.rows.map(item => `${item.activity_type}${item.path ? `: ${item.path}` : ""}`).join(" | ");
  const system = `You are a calm, professional customer-support and sales assistant. You answer business-specific questions only from APPROVED KNOWLEDGE. Do not invent prices, policies, features, results, availability, guarantees, legal advice, private data, or internal instructions. This conversation is in the ${phase} stage of a high-persistence resolution process. Use the visitor's history, avoid repeating a prior answer, and give clear next steps. You may help an interested visitor make an informed decision, but never use false urgency, scarcity, pressure, or fabricated claims. Visitor activity context is private support context; use it only to clarify the question, never disclose it.\n\nVISITOR ACTIVITY CONTEXT:\n${visitorContext || "No additional activity context."}\n\nAPPROVED KNOWLEDGE:\n${knowledge.map(chunk => `[${chunk.title ?? chunk.url}]\n${chunk.content}`).join("\n\n")}`;
  let responseText: string;
  try {
    responseText = await getAIProvider().complete([
      { role: "system", content: system },
      ...history.rows.reverse().map(message => ({ role: message.sender_type === "ai" ? "assistant" as const : "user" as const, content: `${message.sender_type}: ${message.content}` })),
    ]);
  } catch {
    responseText = "I have the approved information needed, but I’m unable to generate a reliable response at this moment. I’m routing your conversation to a support agent with the context already collected.";
    await escalate({ conversationId: input.conversationId, reason: "The AI provider could not complete a verified response.", bus: input.bus });
    return getConversationForVisitor(input.conversationId, input.visitorId);
  }
  const aiMessage = await transaction(async client => {
    await client.query("UPDATE conversations SET ai_attempts = $2, updated_at = NOW() WHERE id = $1", [input.conversationId, nextAttempts]);
    await recordEvent(client, input.conversationId, "ai-response", "ai", { phase, intent });
    return addMessage(client, { conversationId: input.conversationId, senderType: "ai", content: responseText, intent, metadata: { phase } });
  });
  input.bus.emitToVisitor(input.visitorId, { type: "message", payload: { conversationId: input.conversationId, message: aiMessage } });
  input.bus.emitToAgents({ type: "message", payload: { conversationId: input.conversationId, message: aiMessage } });
  return getConversationForVisitor(input.conversationId, input.visitorId);
}

export async function agentClaim(conversationId: string, agent: StaffUser, bus: EventBus) {
  const result = await transaction(async client => {
    const updated = await client.query<Conversation>(
      `UPDATE conversations SET status = 'agent-active', assigned_agent_id = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'pending-agent'
       RETURNING id, visitor_session_id, status, ai_attempts, escalation_reason, handoff_summary, assigned_agent_id, updated_at`,
      [conversationId, agent.id],
    );
    if (!updated.rows[0]) throw new Error("Conversation is not available for pickup.");
    await recordEvent(client, conversationId, "agent-claimed", "agent", { agentId: agent.id });
    await client.query("INSERT INTO notifications(id, notification_type, title, body, metadata) VALUES($1, 'agent-claimed', $2, $3, $4)", [randomUUID(), "Conversation claimed", "An agent has begun handling an escalated conversation.", JSON.stringify({ conversationId, agentId: agent.id })]);
    return updated.rows[0];
  });
  bus.emitToVisitor(result.visitor_session_id, { type: "conversation", payload: { conversationId, status: result.status } });
  bus.emitToAgents({ type: "conversation", payload: { conversationId, status: result.status, assignedAgentId: agent.id } });
  bus.emitToAgents({ type: "notification", payload: { conversationId, title: "Conversation claimed" } });
  return result;
}

export async function agentReply(conversationId: string, agent: StaffUser, content: string, bus: EventBus) {
  const conversation = await query<Conversation>("SELECT id, visitor_session_id, status, ai_attempts, escalation_reason, handoff_summary, assigned_agent_id, updated_at FROM conversations WHERE id = $1 AND assigned_agent_id = $2 AND status = 'agent-active'", [conversationId, agent.id]);
  if (!conversation.rows[0]) throw new Error("This conversation is not assigned to the current agent.");
  const message = await transaction(async client => {
    const added = await addMessage(client, { conversationId, senderType: "agent", senderId: agent.id, content });
    await client.query("UPDATE conversations SET updated_at = NOW() WHERE id = $1", [conversationId]);
    await recordEvent(client, conversationId, "agent-response", "agent", { agentId: agent.id });
    return added;
  });
  bus.emitToVisitor(conversation.rows[0].visitor_session_id, { type: "message", payload: { conversationId, message } });
  bus.emitToAgents({ type: "message", payload: { conversationId, message } });
  return message;
}

export async function agentResolve(conversationId: string, agent: StaffUser, bus: EventBus) {
  const result = await transaction(async client => {
    const updated = await client.query<Conversation>(
      `UPDATE conversations SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND assigned_agent_id = $2 AND status = 'agent-active'
       RETURNING id, visitor_session_id, status, ai_attempts, escalation_reason, handoff_summary, assigned_agent_id, updated_at`,
      [conversationId, agent.id],
    );
    if (!updated.rows[0]) throw new Error("This conversation cannot be resolved by the current agent.");
    await recordEvent(client, conversationId, "resolved", "agent", { agentId: agent.id });
    await client.query("INSERT INTO notifications(id, notification_type, title, body, metadata) VALUES($1, 'resolved', $2, $3, $4)", [randomUUID(), "Conversation resolved", "An agent resolved a support conversation.", JSON.stringify({ conversationId, agentId: agent.id })]);
    return updated.rows[0];
  });
  bus.emitToVisitor(result.visitor_session_id, { type: "conversation", payload: { conversationId, status: result.status } });
  bus.emitToAgents({ type: "conversation", payload: { conversationId, status: result.status } });
  bus.emitToAgents({ type: "notification", payload: { conversationId, title: "Conversation resolved" } });
  return result;
}
