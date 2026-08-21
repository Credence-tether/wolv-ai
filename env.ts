import "dotenv/config";

function integer(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function boolean(name: string, fallback: boolean) {
  const value = process.env[name]?.toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: integer("PORT", 3000, 1, 65535),
  appOrigin: process.env.APP_ORIGIN ?? "http://localhost:3000",
  cookieSecret: process.env.COOKIE_SECRET ?? "development-cookie-secret-change-me",
  sessionSecret: process.env.SESSION_SECRET ?? "development-session-secret-change-me",
  databaseUrl: process.env.DATABASE_URL ?? "",
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  ai: {
    provider: process.env.AI_PROVIDER ?? "openai-compatible",
    baseUrl: (process.env.AI_BASE_URL ?? "").replace(/\/$/, ""),
    apiKey: process.env.AI_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "",
    embeddingBaseUrl: (process.env.AI_EMBEDDING_BASE_URL ?? process.env.AI_BASE_URL ?? "").replace(/\/$/, ""),
    embeddingApiKey: process.env.AI_EMBEDDING_API_KEY ?? process.env.AI_API_KEY ?? "",
    embeddingModel: process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    embeddingDimensions: integer("AI_EMBEDDING_DIMENSIONS", 1536, 1, 4096),
  },
  maxKnowledgePages: integer("MAX_KNOWLEDGE_PAGES", 25, 1, 500),
  approvedSourceUrl: process.env.APPROVED_SOURCE_URL ?? "",
  visitorActivityRetentionDays: integer("VISITOR_ACTIVITY_RETENTION_DAYS", 30, 1, 3650),
  geolocation: {
    provider: process.env.GEOLOCATION_PROVIDER ?? "disabled",
    apiUrl: process.env.GEOLOCATION_API_URL ?? "",
    apiKey: process.env.GEOLOCATION_API_KEY ?? "",
  },
  secureCookies: boolean("SECURE_COOKIES", process.env.NODE_ENV === "production"),
};

export function requireDatabaseUrl() {
  if (!env.databaseUrl) throw new Error("DATABASE_URL is required for database-backed operations.");
  return env.databaseUrl;
}

export function requireSessionSecret() {
  if (env.sessionSecret.length < 32 && env.nodeEnv === "production") {
    throw new Error("SESSION_SECRET must be at least 32 characters in production.");
  }
  return env.sessionSecret;
}

export function requireCookieSecret() {
  if (env.cookieSecret.length < 32 && env.nodeEnv === "production") {
    throw new Error("COOKIE_SECRET must be at least 32 characters in production.");
  }
  return env.cookieSecret;
}
