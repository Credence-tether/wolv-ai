export type ConversationOwner = {
  visitorSessionId: string;
  customerId: string | null;
};

export type ConversationActor = { visitorId: string | null; customerId: string | null };

export function canAccessConversation(owner: ConversationOwner, actor: ConversationActor) {
  return owner.visitorSessionId === actor.visitorId || (owner.customerId !== null && owner.customerId === actor.customerId);
}

export function requireStaffRole(role: string | undefined, allowed: Array<"agent" | "admin">) {
  if (!role || !allowed.includes(role as "agent" | "admin")) throw new Error("Staff authorization required.");
}
