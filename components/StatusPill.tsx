export function StatusPill({ status }: { status: string }) {
  const tone = status === "AI-handling" ? "status-ai" : status === "pending-agent" ? "status-pending" : status === "agent-active" ? "status-agent" : "status-resolved";
  return <span className={`status-pill ${tone}`}>{status.replace("-", " ")}</span>;
}
