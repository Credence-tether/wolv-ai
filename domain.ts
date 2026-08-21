export const conversationStates = ["AI-handling", "pending-agent", "agent-active", "resolved"] as const;
export type ConversationState = (typeof conversationStates)[number];

export const staffRoles = ["customer", "agent", "admin"] as const;
export type StaffRole = (typeof staffRoles)[number];

export type StaffUser = {
  id: string;
  email: string;
  display_name: string;
  role: StaffRole;
  active: boolean;
};

export type Intent =
  | "general-information"
  | "product-inquiry"
  | "pricing-inquiry"
  | "how-to"
  | "troubleshooting"
  | "objection"
  | "risk-concern"
  | "high-purchase-interest"
  | "low-purchase-interest"
  | "comparison"
  | "complaint"
  | "frustration"
  | "human-agent-request"
  | "sensitive-issue"
  | "prompt-injection";
