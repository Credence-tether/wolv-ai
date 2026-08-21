export type CurrentUser = {
  id: string;
  email: string;
  display_name: string;
  role: "customer" | "agent" | "admin";
  active: boolean;
};

export type ConversationMessage = {
  id: string;
  sender_type: "visitor" | "ai" | "agent" | "system" | string;
  sender_id: string | null;
  content: string;
  intent?: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  visitor_session_id: string;
  status: "AI-handling" | "pending-agent" | "agent-active" | "resolved" | string;
  ai_attempts: number;
  escalation_reason: string | null;
  handoff_summary: string | null;
  assigned_agent_id: string | null;
  updated_at: string;
  messages: ConversationMessage[];
};
