import { ArrowRight, CircleCheck, Headphones, LockKeyhole, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { api } from "@/lib/api";

export function CustomerHome({ onStaff }: { onStaff: () => void }) {
  useEffect(() => {
    const path = window.location.pathname;
    void api("/api/visitor/activity", { method: "POST", body: JSON.stringify({ type: "page-view", path }) }).catch(() => undefined);
    const recordExit = () => navigator.sendBeacon("/api/visitor/activity", new Blob([JSON.stringify({ type: "page-exit", path })], { type: "application/json" }));
    window.addEventListener("pagehide", recordExit);
    return () => window.removeEventListener("pagehide", recordExit);
  }, []);

  return <main className="customer-shell"><nav className="public-nav"><a className="wordmark" href="/"><span className="wordmark-mark">S</span><span>Support Command</span></a><button className="quiet-button" onClick={onStaff}><LockKeyhole size={15} /> Staff access</button></nav>
    <section className="hero"><div className="hero-copy"><p className="eyebrow"><Sparkles size={14} /> INTELLIGENT SUPPORT, HUMAN WHEN IT MATTERS</p><h1>Answers that keep the <em>whole</em> picture.</h1><p className="hero-intro">A thoughtful support experience that understands your question, remembers the conversation, and brings in the right person only when it’s genuinely needed.</p><div className="hero-actions"><button className="primary-button" onClick={() => document.querySelector<HTMLButtonElement>(".chat-launcher")?.click()}>Talk to support <ArrowRight size={17} /></button><span className="availability"><span className="live-dot" />Support channel available</span></div></div>
      <div className="signal-card"><div className="signal-heading"><span><Headphones size={19} /></span><p>Support signal</p><i>Live</i></div><div className="signal-thread"><div className="thread-row visitor-row"><span>Visitor</span><p>Which option best fits a small team?</p></div><div className="thread-row assistant-row"><span>Support</span><p>I can help compare the approved options. What matters most for your team?</p></div></div><div className="signal-footer"><CircleCheck size={16} /> Context is retained throughout the conversation</div></div>
    </section>
    <section className="principles"><article><span>01</span><h2>Verified, not invented</h2><p>Business answers stay grounded in approved information, with a clear handoff whenever confirmation is needed.</p></article><article><span>02</span><h2>Persistent by design</h2><p>Context travels with the conversation, so you never need to restate the work already done.</p></article><article><span>03</span><h2>Human judgement on demand</h2><p>Complex and sensitive cases reach a person with the important details already organized.</p></article></section>
  </main>;
}
