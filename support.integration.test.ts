import { afterAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("PostgreSQL support workflow integration", async () => {
  process.env.DATABASE_URL = databaseUrl;
  const { getDb } = await import("./db");
  const { agentClaim, agentReply, agentResolve, createConversation, getConversationForVisitor, replyAsAI } = await import("./support");

  const visitorId = "visitor-integration";
  const agent = { id: "agent-integration", email: "agent@example.test", display_name: "Integration Agent", role: "agent" as const, active: true };
  const events = { emitToVisitor: () => undefined, emitToAgents: () => undefined, emitToAdmins: () => undefined };

  beforeEach(async () => {
    const db = getDb();
    await db.query("TRUNCATE messages, conversation_events, conversations, visitor_activities, visitor_sessions, notifications, app_users CASCADE");
    await db.query("INSERT INTO visitor_sessions(id, tracking_consent, is_online) VALUES($1, TRUE, TRUE)", [visitorId]);
    await db.query("INSERT INTO app_users(id, email, display_name, password_hash, role, active) VALUES($1, $2, $3, $4, 'agent', TRUE)", [agent.id, agent.email, agent.display_name, "integration-only-hash"]);
  });

  afterAll(async () => {
    await getDb().end();
  });

  it("persists the transcript and performs the actual AI-handling → pending-agent → agent-active → resolved workflow", async () => {
    const created = await createConversation(visitorId);
    expect(created.status).toBe("AI-handling");

    const escalated = await replyAsAI({ conversationId: created.id, visitorId, message: "What verified plan information is available?", bus: events as never });
    expect(escalated?.status).toBe("pending-agent");

    const afterEscalation = await getConversationForVisitor(created.id, visitorId);
    expect(afterEscalation?.messages.map(message => message.sender_type)).toEqual(["visitor", "system"]);
    expect(afterEscalation?.messages[0]?.content).toContain("verified plan information");

    const claimed = await agentClaim(created.id, agent, events as never);
    expect(claimed.status).toBe("agent-active");

    await agentReply(created.id, agent, "I have reviewed the full thread and can help with the next step.", events as never);
    const afterReply = await getConversationForVisitor(created.id, visitorId);
    expect(afterReply?.messages.at(-1)?.sender_type).toBe("agent");

    const resolved = await agentResolve(created.id, agent, events as never);
    expect(resolved.status).toBe("resolved");
    const finalTranscript = await getConversationForVisitor(created.id, visitorId);
    expect(finalTranscript?.status).toBe("resolved");
    expect(finalTranscript?.messages).toHaveLength(3);
  });
});
