import type { Intent } from "./domain";

const has = (text: string, pattern: RegExp) => pattern.test(text);

export function classifyIntent(message: string, sensitiveTopics: string[]): Intent {
  const text = message.toLowerCase();
  if (has(text, /ignore (all|any|previous)|system prompt|hidden instruction|reveal.*prompt|pretend.*admin|override.*rule/)) return "prompt-injection";
  if (sensitiveTopics.some(topic => topic.trim() && text.includes(topic.toLowerCase()))) return "sensitive-issue";
  if (has(text, /human|real person|representative|agent|someone.*help/)) return "human-agent-request";
  if (has(text, /price|pricing|cost|plan.*price|how much/)) return "pricing-inquiry";
  if (has(text, /compare|difference|versus|vs\.?/)) return "comparison";
  if (has(text, /not help|doesn.t work|still broken|frustrat|angry|unhappy/)) return "frustration";
  if (has(text, /error|bug|broken|cannot|can.t|failed|issue/)) return "troubleshooting";
  if (has(text, /sign up|start|buy|purchase|which plan|right for me|requirements/)) return "high-purchase-interest";
  if (has(text, /why should|not sure|concern|risk|worry|doubt/)) return "objection";
  if (has(text, /how do|how can|steps|instructions/)) return "how-to";
  if (has(text, /feature|service|product|offer/)) return "product-inquiry";
  return "general-information";
}

export function isUnresolvedSignal(message: string) {
  return /not help|doesn.t work|still (?:have|need|broken)|didn.t solve|not what i meant|try again/i.test(message);
}

export function isComplexRequest(message: string) {
  return message.length > 2200 || /custom (?:integration|development|implementation)|legal (?:review|advice|claim)|security (?:incident|breach|audit)|data (?:deletion|export|residency)|contract (?:negotiation|amendment)/i.test(message);
}
