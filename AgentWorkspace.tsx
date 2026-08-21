import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Bell, Check, ChevronRight, Clock3, Compass, MessageSquareText, RefreshCw, UserRoundCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { CurrentUser } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";
import { useRealtime } from "@/hooks/useRealtime";

type QueueItem = { id: string; status: "pending-agent" | "agent-active"; ai_attempts: number; escalation_reason: string | null; handoff_summary: string | null; updated_at: string; current_path: string | null; country: string | null; city: string | null };
type Detail = QueueItem & { visitor_session_id: string; messages: Array<{ id: string; sender_type: string; content: string; created_at: string }>; activity: Array<{ activity_type: string; path: string | null; happened_at: string }> };
type Notification = { id: string; notification_type: string; title: string; body: string; created_at: string };

export function AgentWorkspace({ user, onAdmin }: { user: CurrentUser; onAdmin: () => void }) {
  const [queue, setQueue] = useState<QueueItem[]>([]); const [selected, setSelected] = useState<Detail | null>(null); const [reply, setReply] = useState(""); const [notice, setNotice] = useState(""); const [loading, setLoading] = useState(true); const [notifications, setNotifications] = useState<Notification[]>([]); const [showNotifications, setShowNotifications] = useState(false); const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const reload = useCallback(async () => { try { const [items, alerts] = await Promise.all([api<QueueItem[]>("/api/agent/queue"), api<Notification[]>("/api/agent/notifications")]); setQueue(items); setNotifications(alerts); if (selected) { const next = await api<Detail>(`/api/agent/conversations/${selected.id}`); setSelected(next); } } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to load the queue."); } finally { setLoading(false); } }, [selected?.id]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const interval = window.setInterval(() => { void reload(); }, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);
  useEffect(() => {
    const latestVisitorAlert = notifications.find(alert => alert.title === "New visitor");
    if (!latestVisitorAlert) return;
    const message = `${latestVisitorAlert.title}: ${latestVisitorAlert.body}`;
    setLiveNotice(message);
    const timer = window.setTimeout(() => setLiveNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [notifications]);
  useRealtime(useCallback(() => { void reload(); }, [reload]));
  async function select(item: QueueItem) { try { setSelected(await api<Detail>(`/api/agent/conversations/${item.id}`)); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to open the conversation."); } }
  async function claim() { if (!selected) return; try { await api(`/api/agent/conversations/${selected.id}/claim`, { method: "POST" }); await reload(); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to claim this conversation."); } }
  async function send() { if (!selected || !reply.trim()) return; try { await api(`/api/agent/conversations/${selected.id}/messages`, { method: "POST", body: JSON.stringify({ content: reply.trim() }) }); setReply(""); await reload(); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to send the reply."); } }
  async function resolve() { if (!selected) return; try { await api(`/api/agent/conversations/${selected.id}/resolve`, { method: "POST" }); setSelected(null); await reload(); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to resolve this conversation."); } }
  const pending = useMemo(() => queue.filter(item => item.status === "pending-agent"), [queue]);
  return <div className="staff-shell"><header className="staff-topbar"><a className="wordmark" href="/"><span className="wordmark-mark">S</span><span>Support Command</span></a><div className="staff-actions"><button className="top-action" onClick={() => void reload()}><RefreshCw size={15} /> Refresh</button><div className="notification-wrap"><button className="notification-button" onClick={() => setShowNotifications(value => !value)} aria-expanded={showNotifications}><Bell size={17} /><span>{notifications.length}</span></button>{showNotifications && <section className="notifications-panel"><p className="eyebrow">LIVE NOTIFICATIONS</p>{notifications.length === 0 ? <p className="notifications-empty">Nothing is awaiting attention.</p> : notifications.slice(0, 8).map(alert => <article key={alert.id}><b>{alert.title}</b><p>{alert.body}</p><time>{new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></article>)}</section>}</div><div className="user-chip"><span>{user.display_name.slice(0, 1).toUpperCase()}</span><div><strong>{user.display_name}</strong><small>{user.role === "admin" ? "Administrator" : "Support agent"}</small></div></div></div></header>
    {liveNotice && <div className="live-toast" role="status" aria-live="polite">{liveNotice}</div>}
    <aside className="staff-sidebar"><p className="eyebrow">WORKSPACE</p><button className="nav-active"><MessageSquareText size={17} /> Escalation queue <b>{pending.length}</b></button><button onClick={onAdmin} disabled={user.role !== "admin"}><Activity size={17} /> Visitor intelligence</button><div className="sidebar-note"><span className="live-dot" /> Live event channel<br /><small>Messages, visits, and assignments update as they occur.</small></div></aside>
    <main className="queue-main"><section className="queue-column"><div className="panel-heading"><div><p className="eyebrow">LIVE OPERATIONS</p><h1>Support queue</h1><p>{pending.length} awaiting a person · {queue.length} active cases</p></div><span className="queue-count">{queue.length}</span></div>{notice && <p className="inline-error">{notice}</p>}{loading ? <div className="empty-state">Loading conversations…</div> : queue.length === 0 ? <div className="empty-state"><Check size={23} /><strong>The queue is clear.</strong><p>Escalated conversations will appear here with the AI context already intact.</p></div> : <div className="queue-list">{queue.map(item => <button key={item.id} className={`queue-card ${selected?.id === item.id ? "queue-card-selected" : ""}`} onClick={() => void select(item)}><div className="queue-card-top"><StatusPill status={item.status} /><time>{new Date(item.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{item.escalation_reason ?? "Conversation needs review"}</p><div className="queue-context"><Compass size={13} />{item.current_path ?? "No page context"}<span>·</span>{[item.city, item.country].filter(Boolean).join(", ") || "Location unavailable"}</div></button>)}</div>}</section>
      <section className="conversation-column">{!selected ? <div className="detail-empty"><UserRoundCheck size={28} /><h2>Select a conversation</h2><p>Every escalation arrives with the full thread, resolution attempts, and relevant visitor context.</p></div> : <><header className="detail-header"><div><StatusPill status={selected.status} /><h2>Case context</h2><p>{selected.escalation_reason}</p></div>{selected.status === "pending-agent" ? <button className="primary-button" onClick={() => void claim()}>Claim conversation <ChevronRight size={17} /></button> : <button className="soft-success-button" onClick={() => void resolve()}><Check size={16} /> Resolve</button>}</header><div className="case-grid"><aside className="case-facts"><p className="eyebrow">AI HANDOFF</p><p className="handoff-copy">{selected.handoff_summary ?? "A handoff summary will appear when the AI escalates."}</p><div className="fact-divider" /><p className="eyebrow">VISITOR JOURNEY</p><div className="activity-list">{selected.activity.map((item, index) => <div key={`${item.happened_at}-${index}`}><span /><p><b>{item.activity_type.replace("-", " ")}</b>{item.path && ` · ${item.path}`}<small>{new Date(item.happened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></p></div>)}</div></aside><div className="agent-thread">{selected.messages.map(message => <article key={message.id} className={`agent-message agent-message-${message.sender_type}`}><span>{message.sender_type === "visitor" ? "Visitor" : message.sender_type === "ai" ? "AI" : message.sender_type === "agent" ? "You" : "System"}</span><p>{message.content}</p><time>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></article>)}</div></div>{selected.status === "agent-active" && <form className="agent-composer" onSubmit={event => { event.preventDefault(); void send(); }}><textarea value={reply} onChange={event => setReply(event.target.value)} placeholder="Reply with the full context in mind…" rows={2} /><button className="primary-button" type="submit" disabled={!reply.trim()}>Send reply</button></form>}</>}</section></main>
  </div>;
}
