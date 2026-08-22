import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, DatabaseZap, Eye, RefreshCcw, ShieldAlert, UsersRound } from "lucide-react";
import { api } from "@/lib/api";

type Visitor = { id: string; current_path: string | null; country: string | null; city: string | null; is_online: boolean; chat_status: string | null };
type Setting = { setting_key: string; setting_value: unknown };
type Agent = { id: string; email: string; display_name: string; role: "agent" | "admin"; active: boolean; created_at: string };
type ConversationListing = { id: string; status: string; ai_attempts: number; escalation_reason: string | null; updated_at: string; current_path: string | null; country: string | null; city: string | null };
type VisitorDetail = { session: Visitor & { entry_path: string | null; region: string | null; device_type: string | null; browser: string | null; operating_system: string | null; timezone: string | null }; activity: Array<{ activity_type: string; path: string | null; happened_at: string }>; conversations: Array<{ id: string; status: string; escalation_reason: string | null; updated_at: string }> };

export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [threshold, setThreshold] = useState(3);
  const [retentionDays, setRetentionDays] = useState(30);
  const [topics, setTopics] = useState("");
  const [notice, setNotice] = useState("");
  const [knowledge, setKnowledge] = useState({ url: "", title: "", content: "" });
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentForm, setAgentForm] = useState({ email: "", displayName: "", password: "", role: "agent" });
  const [conversations, setConversations] = useState<ConversationListing[]>([]);
  const [conversationQuery, setConversationQuery] = useState("");
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorDetail | null>(null);

  const load = useCallback(async () => {
    try {
      const [visitorRows, settingRows, agentRows, conversationRows] = await Promise.all([
        api<Visitor[]>("/api/admin/visitors"),
        api<Setting[]>("/api/admin/settings"),
        api<Agent[]>("/api/admin/agents"), api<ConversationListing[]>("/api/admin/conversations"),
      ]);
      setVisitors(visitorRows);
      setAgents(agentRows);
      setConversations(conversationRows);
      const savedThreshold = settingRows.find(item => item.setting_key === "escalation_threshold")?.setting_value;
      const savedTopics = settingRows.find(item => item.setting_key === "sensitive_topics")?.setting_value;
      const savedRetention = settingRows.find(item => item.setting_key === "visitor_activity_retention_days")?.setting_value;
      if (typeof savedThreshold === "number") setThreshold(savedThreshold);
      if (Array.isArray(savedTopics)) setTopics(savedTopics.join("\n"));
      if (typeof savedRetention === "number") setRetentionDays(savedRetention);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load administration data.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function update(key: string, value: unknown) {
    try {
      await api(`/api/admin/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
      setNotice("Saved.");
      void load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save this setting.");
    }
  }

  async function searchConversations() {
    try {
      const rows = await api<ConversationListing[]>(`/api/admin/conversations?q=${encodeURIComponent(conversationQuery)}`);
      setConversations(rows);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to search conversations.");
    }
  }

  async function ingest(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/admin/knowledge", { method: "POST", body: JSON.stringify(knowledge) });
      setKnowledge({ url: "", title: "", content: "" });
      setNotice("Approved knowledge source saved and indexed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save the knowledge source.");
    }
  }

  async function reindexWebsite() {
    setCrawling(true);
    try {
      const result = await api<{ visited: number; indexed: number }>("/api/admin/knowledge/reindex", { method: "POST", body: JSON.stringify({ url: crawlUrl || undefined }) });
      setNotice(`Site crawl complete: visited ${result.visited} page(s) and indexed ${result.indexed} changed source(s).`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to crawl the approved website.");
    } finally {
      setCrawling(false);
    }
  }

  async function createAgent(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/admin/agents", { method: "POST", body: JSON.stringify(agentForm) });
      setAgentForm({ email: "", displayName: "", password: "", role: "agent" });
      setNotice("Staff account created.");
      void load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create the staff account.");
    }
  }

  async function setAgentActive(agent: Agent, active: boolean) {
    try {
      await api(`/api/admin/agents/${agent.id}`, { method: "PATCH", body: JSON.stringify({ active }) });
      setNotice(active ? "Staff access enabled." : "Staff access disabled.");
      void load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update staff access.");
    }
  }

  async function selectVisitor(visitor: Visitor) {
    try {
      setSelectedVisitor(await api<VisitorDetail>(`/api/admin/visitors/${visitor.id}`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load the visitor detail.");
    }
  }

  return <main className="admin-shell">
    <header className="admin-header"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to workspace</button><div><p className="eyebrow">ADMINISTRATION</p><h1>Operational controls</h1></div><button className="top-action" onClick={() => void load()}><RefreshCcw size={15} /> Refresh</button></header>
    {notice && <p className="admin-notice">{notice}</p>}
    <section className="admin-grid">
      <article className="admin-card visitor-board"><div className="admin-card-title"><span><Eye size={18} /></span><div><h2>Live visitors</h2><p>Consent-aware activity from active sessions</p></div><b>{visitors.filter(visitor => visitor.is_online).length} online</b></div><div className="visitor-table"><div className="visitor-table-head"><span>Visitor</span><span>Current context</span><span>Support</span></div>{visitors.length === 0 ? <p className="table-empty">Visitor sessions will appear as the customer experience is used.</p> : visitors.map(visitor => <button className="visitor-row visitor-select" key={visitor.id} onClick={() => void selectVisitor(visitor)}><span><i className={visitor.is_online ? "online" : "offline"} />{visitor.id.slice(0, 8)}</span><span><b>{visitor.current_path ?? "—"}</b><small>{[visitor.city, visitor.country].filter(Boolean).join(", ") || "Approximate location unavailable"}</small></span><span>{visitor.chat_status ?? "No chat"}</span></button>)}</div>{selectedVisitor && <section className="visitor-detail"><div><p className="eyebrow">SELECTED VISITOR</p><h3>{selectedVisitor.session.id.slice(0, 8)} · {selectedVisitor.session.current_path ?? "No current page"}</h3><p>{[selectedVisitor.session.city, selectedVisitor.session.region, selectedVisitor.session.country].filter(Boolean).join(", ") || "Approximate location unavailable"} · {[selectedVisitor.session.device_type, selectedVisitor.session.browser, selectedVisitor.session.operating_system].filter(Boolean).join(" / ") || "Device unavailable"}</p></div><div><p className="eyebrow">ACTIVITY TIMELINE</p>{selectedVisitor.activity.slice(0, 8).map((event, index) => <p className="timeline-line" key={`${event.happened_at}-${index}`}><b>{event.activity_type.replace("-", " ")}</b>{event.path && ` · ${event.path}`}<small>{new Date(event.happened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></p>)}</div><div><p className="eyebrow">CONVERSATIONS</p>{selectedVisitor.conversations.length === 0 ? <p className="table-empty">No support conversation yet.</p> : selectedVisitor.conversations.map(conversation => <p className="timeline-line" key={conversation.id}><b>{conversation.status}</b>{conversation.escalation_reason && ` · ${conversation.escalation_reason}`}<small>{new Date(conversation.updated_at).toLocaleString()}</small></p>)}</div></section>}</article>
      <article className="admin-card settings-card"><div className="admin-card-title"><span><ShieldAlert size={18} /></span><div><h2>Escalation policy</h2><p>Controls the high-persistence handoff guardrail</p></div></div><label className="range-setting">Substantive attempts before handoff <strong>{threshold}</strong><input type="range" min="1" max="10" value={threshold} onChange={event => setThreshold(Number(event.target.value))} /><small>The AI must use each permitted resolution stage before this threshold causes escalation.</small></label><button className="secondary-button" onClick={() => void update("escalation_threshold", threshold)}>Save escalation threshold</button><label>Always-sensitive topics<textarea value={topics} onChange={event => setTopics(event.target.value)} placeholder="One topic per line" rows={5} /></label><button className="secondary-button" onClick={() => void update("sensitive_topics", topics.split("\n").map(value => value.trim()).filter(Boolean))}>Save sensitive-topic policy</button><label>Visitor-activity retention (days)<input type="number" min="1" max="3650" value={retentionDays} onChange={event => setRetentionDays(Number(event.target.value))} /></label><button className="secondary-button" onClick={() => void update("visitor_activity_retention_days", retentionDays)}>Save retention policy</button></article>
      <article className="admin-card knowledge-card"><div className="admin-card-title"><span><DatabaseZap size={18} /></span><div><h2>Crawl approved site</h2><p>Automatically indexes every page on your site. Leave the URL blank to use the APPROVED_SOURCE_URL configured on the server.</p></div></div><label>Website URL (optional)<input type="url" value={crawlUrl} onChange={event => setCrawlUrl(event.target.value)} placeholder="https://wolvcapital.com (blank = server default)" /></label><button className="primary-button" type="button" disabled={crawling} onClick={() => void reindexWebsite()}>{crawling ? "Crawling…" : "Crawl and index site"}</button></article>
      <article className="admin-card knowledge-card"><div className="admin-card-title"><span><DatabaseZap size={18} /></span><div><h2>Add a single page manually</h2><p>Only this verified business content is used for answers</p></div></div><form onSubmit={ingest}><label>Source URL<input type="url" value={knowledge.url} onChange={event => setKnowledge({ ...knowledge, url: event.target.value })} required placeholder="https://example.com/plans" /></label><label>Source title<input value={knowledge.title} onChange={event => setKnowledge({ ...knowledge, title: event.target.value })} required placeholder="Plans and pricing" /></label><label>Verified content<textarea value={knowledge.content} onChange={event => setKnowledge({ ...knowledge, content: event.target.value })} required minLength={100} rows={7} placeholder="Paste approved website or business content…" /></label><div className="knowledge-actions"><button className="primary-button" type="submit">Save and index source</button></div></form></article>
      <article className="admin-card agent-card"><div className="admin-card-title"><span><UsersRound size={18} /></span><div><h2>Agent accounts</h2><p>Application-owned roles and server-enforced access</p></div></div><form className="agent-form" onSubmit={createAgent}><label>Name<input value={agentForm.displayName} onChange={event => setAgentForm({ ...agentForm, displayName: event.target.value })} required minLength={2} /></label><label>Email<input type="email" value={agentForm.email} onChange={event => setAgentForm({ ...agentForm, email: event.target.value })} required /></label><label>Temporary password<input type="password" value={agentForm.password} onChange={event => setAgentForm({ ...agentForm, password: event.target.value })} required minLength={12} /></label><label>Role<select value={agentForm.role} onChange={event => setAgentForm({ ...agentForm, role: event.target.value })}><option value="agent">Agent</option><option value="admin">Administrator</option></select></label><button className="primary-button" type="submit">Create staff account</button></form><div className="agent-roster">{agents.map(agent => <div key={agent.id}><span><b>{agent.display_name}</b><small>{agent.email} · {agent.role}</small></span><button className={agent.active ? "deactivate-button" : "activate-button"} onClick={() => void setAgentActive(agent, !agent.active)}>{agent.active ? "Disable" : "Enable"}</button></div>)}</div></article>
      <article className="admin-card conversation-board"><div className="admin-card-title"><span><UsersRound size={18} /></span><div><h2>All conversations</h2><p>Search retained support records across the system</p></div><b>{conversations.length} shown</b></div><form className="conversation-search" onSubmit={event => { event.preventDefault(); void searchConversations(); }}><input value={conversationQuery} onChange={event => setConversationQuery(event.target.value)} placeholder="Search case ID, escalation reason, or page" /><button className="secondary-button" type="submit">Search</button></form><div className="conversation-list">{conversations.length === 0 ? <p className="table-empty">No matching conversations found.</p> : conversations.map(conversation => <div key={conversation.id}><span><b>{conversation.status}</b><small>{conversation.id.slice(0, 8)} · {conversation.current_path ?? "No page context"}</small></span><p>{conversation.escalation_reason ?? "AI-handled conversation"}</p><time>{new Date(conversation.updated_at).toLocaleString()}</time></div>)}</div></article>
    </section>
  </main>;
}