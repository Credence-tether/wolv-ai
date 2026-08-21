import type { Intent } from "./domain";

export function mandatoryEscalationReason(intent: Intent) {
  if (intent === "human-agent-request") return "The visitor explicitly requested a human agent.";
  if (intent === "sensitive-issue") return "The conversation matched an administrator-configured sensitive topic.";
  return null;
}

export function shouldEscalateForUnresolvedAttempt(input: { intent: Intent; existingAttempts: number; unresolvedSignal: boolean; threshold: number }) {
  if (!input.unresolvedSignal) return false;
  if (input.intent === "prompt-injection") return false;
  return input.existingAttempts >= input.threshold;
}

export function resolutionStage(existingAttempts: number, unresolvedSignal: boolean) {
  const nextAttempts = existingAttempts === 0 ? 1 : unresolvedSignal ? existingAttempts + 1 : existingAttempts;
  const stage = nextAttempts === 1 ? "resolve" : nextAttempts === 2 ? "reframe" : "fallback";
  return { nextAttempts, stage } as const;
}

export function verifiedKnowledgeFallbackReason(chunkCount: number) {
  return chunkCount === 0 ? "The assistant lacks verified approved knowledge required to answer reliably." : null;
}

export function canTransitionConversation(from: "AI-handling" | "pending-agent" | "agent-active" | "resolved", to: "AI-handling" | "pending-agent" | "agent-active" | "resolved") {
  const allowed: Record<string, string[]> = {
    "AI-handling": ["pending-agent"],
    "pending-agent": ["agent-active"],
    "agent-active": ["resolved"],
    "resolved": [],
  };
  return allowed[from].includes(to);
}
