import { FormEvent, useEffect, useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
import { AdminConsole } from "./AdminConsole";
import { AgentWorkspace } from "./AgentWorkspace";
import { CustomerHome } from "./CustomerHome";
import { CustomerLayout } from "./CustomerLayout";
import { api } from "@/lib/api";
import type { CurrentUser } from "@/lib/types";
import "./styles.css";
import "./admin.css";

function StaffLogin({ onAuthenticated, onBack }: { onAuthenticated: (user: CurrentUser) => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    try {
      const result = await api<{ user: CurrentUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      onAuthenticated(result.user);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-shell"><button className="back-link" onClick={onBack}>← Back to customer support</button><section className="login-card"><span className="login-mark"><LockKeyhole size={20} /></span><p className="eyebrow">STAFF ACCESS</p><h1>Support Command</h1><p>Sign in to the protected queue and visitor-intelligence workspace.</p><form onSubmit={submit}><label>Email<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{notice && <p className="inline-error">{notice}</p>}<button className="primary-button" type="submit" disabled={loading}>{loading ? "Signing in…" : <><LogIn size={16} /> Sign in</>}</button></form></section></main>;
}

function App() {
  const [mode, setMode] = useState<"customer" | "staff" | "admin">("customer");
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    void api<{ user: CurrentUser | null }>("/api/auth/me").then(result => { if (result.user) { setUser(result.user); setMode("staff"); } }).catch(() => undefined);
  }, []);

  if (mode === "staff" && !user) return <StaffLogin onAuthenticated={next => { setUser(next); }} onBack={() => setMode("customer")} />;
  if (mode === "admin" && user?.role === "admin") return <AdminConsole onBack={() => setMode("staff")} />;
  if (mode === "staff" && user) return <AgentWorkspace user={user} onAdmin={() => setMode("admin")} />;
  return <CustomerLayout><CustomerHome onStaff={() => setMode("staff")} /></CustomerLayout>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Application root not found.");

import("react-dom/client").then(({ createRoot }) => createRoot(root).render(<App />));
