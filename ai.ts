import { env } from "./env";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AIProvider {
  complete(messages: ChatMessage[]): Promise<string>;
}

class OpenAICompatibleProvider implements AIProvider {
  async complete(messages: ChatMessage[]) {
    if (!env.ai.baseUrl || !env.ai.apiKey || !env.ai.model) {
      throw new Error("AI provider is not configured. Set AI_BASE_URL, AI_API_KEY, and AI_MODEL.");
    }
    const response = await fetch(`${env.ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.ai.apiKey}` },
      body: JSON.stringify({ model: env.ai.model, messages, temperature: 0.2 }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}.`);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("AI provider returned no usable message.");
    return content.trim();
  }
}

let provider: AIProvider | undefined;

export function getAIProvider() {
  if (!provider) {
    if (env.ai.provider !== "openai-compatible") throw new Error(`Unsupported AI_PROVIDER: ${env.ai.provider}`);
    provider = new OpenAICompatibleProvider();
  }
  return provider;
}
