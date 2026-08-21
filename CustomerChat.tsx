import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, LoaderCircle, MessageCircle, SendHorizontal, ShieldCheck, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import type { Conversation } from "@/lib/types";
import { StatusPill } from "./StatusPill";
import { useRealtime } from "@/hooks/useRealtime";

export function CustomerChat() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [trackingConsent, setTrackingConsent] = useState(() => {
    const saved = window.localStorage.getItem("support_tracking_consent");
    return saved === "denied" ? false : true;
  });
  const bottom = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (id: string) => {
    const current = await api<Conversation>(`/api/conversations/${id}`);
    setConversation(current);
  }, []);

  useEffect(() => {
    void api("/api/visitor/initialize", { method: "POST", body: JSON.stringify({ trackingConsent, path: window.location.pathname, referrer: document.referrer, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) }).catch(() => setNotice("Support is preparing a private connection."));
  }, [trackingConsent]);

  useEffect(() => {
    if (!trackingConsent) return;
    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      void api("/api/visitor/heartbeat", { method: "POST", body: JSON.stringify({ path: window.location.pathname }) }).catch(() => undefined);
    };
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 30_000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") sendHeartbeat(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [trackingConsent]);

  useRealtime(useCallback(event => {
    const conversationId = String(event.payload.conversationId ?? "");
    if (conversation?.id && conversationId === conversation.id) void refresh(conversation.id).catch(() => undefined);
  }, [conversation?.id, refresh]), trackingConsent || Boolean(conversation));

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [conversation?.messages.length, open]);

  async function begin() {
    setLoading(true);
    try {
      await api("/api/visitor/activity", { method: "POST", body: JSON.stringify({ type: "chat-opened", path: window.location.pathname }) });
      const next = await api<Conversation>("/api/conversations", { method: "POST" });
      setConversation({ ...next, messages: [] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to open support right now.");
    } finally {
      setLoading(false);
    }
  }

  async function updateTrackingConsent(next: boolean) {
    setTrackingConsent(next);
    window.localStorage.setItem("support_tracking_consent", next ? "granted" : "denied");
    try {
      await api("/api/visitor/consent", { method: "POST", body: JSON.stringify({ trackingConsent: next, path: window.location.pathname, referrer: document.referrer, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update the visitor-activity preference.");
    }
  }

  async function send() {
    if (!input.trim() || !conversation || loading || conversation.status !== "AI-handling") return;
    const message = input.trim();
    setInput("");
    setLoading(true);
    try {
      const next = await api<Conversation>(`/api/conversations/${conversation.id}/messages`, { method: "POST", body: JSON.stringify({ content: message }) });
      setConversation(next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-dock">
      {open && <section className="chat-panel" aria-label="Customer support chat">
        <header className="chat-header">
          <div className="chat-brand"><span className="brand-orb"><Bot size={18} /></span><div><p className="eyebrow">AI SUPPORT</p><strong>Here when you need us</strong></div></div>
          <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close support chat"><ChevronDown size={20} /></button>
        </header>
        <div className="chat-trust"><ShieldCheck size={14} /> Your conversation stays with this support team.</div>
        <div className="chat-body">
          {!conversation ? <div className="welcome-card"><span className="welcome-mark"><MessageCircle size={23} /></span><h2>How can we help?</h2><p>Ask about services, plans, or an issue. We’ll keep the context as we work through it together.</p><button className="primary-button" onClick={begin} disabled={loading}>{loading ? "Opening…" : "Start a conversation"}</button>{notice && <small className="inline-error">{notice}</small>}</div> : <>
            <div className="chat-status-line"><StatusPill status={conversation.status} /><span>{conversation.status === "AI-handling" ? `Resolution attempt ${conversation.ai_attempts + 1}` : conversation.status === "pending-agent" ? "A specialist has your full context." : "Your conversation history is retained."}</span></div>
            <div className="message-list">{conversation.messages.length === 0 && <div className="assistant-greeting"><Bot size={16} /><p>Tell me what you’re trying to accomplish, and I’ll help from there.</p></div>}
              {conversation.messages.map(message => <article key={message.id} className={`message message-${message.sender_type}`}><span className="message-avatar">{message.sender_type === "visitor" ? <UserRound size={14} /> : <Bot size={14} />}</span><div><p>{message.content}</p><time>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div></article>)}
              {loading && <article className="message message-ai"><span className="message-avatar"><LoaderCircle className="spin" size={14} /></span><div><p>Working on a helpful next step…</p></div></article>}<div ref={bottom} />
            </div>
            {conversation.status === "AI-handling" ? <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}><textarea value={input} onChange={event => setInput(event.target.value)} placeholder="Type your message…" rows={1} /><button className="send-button" type="submit" disabled={!input.trim() || loading} aria-label="Send message"><SendHorizontal size={17} /></button></form> : <div className="handoff-note">{conversation.status === "pending-agent" ? "A human agent will join this thread. You do not need to repeat yourself." : conversation.status === "agent-active" ? "An agent is active in this conversation." : "This support conversation has been resolved."}</div>}
            {notice && <small className="inline-error">{notice}</small>}
          </>}
        </div>
      </section>}
      <button className="chat-launcher" onClick={() => setOpen(value => !value)} aria-expanded={open}><MessageCircle size={20} /><span>{open ? "Close support" : "Need help?"}</span></button>
    </div>
  );
}
