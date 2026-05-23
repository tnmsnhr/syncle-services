const DEFAULT_PORT = 3001;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_JWT_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

export const config = {
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  contextTtlMs: Number(process.env.CONTEXT_TTL_MS ?? DEFAULT_TTL_MS),
  pruneIntervalMs: Number(process.env.PRUNE_INTERVAL_MS ?? 5 * 60 * 1000),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-change-me",
  jwtTtlSec: Number(process.env.JWT_TTL_SEC ?? DEFAULT_JWT_TTL_SEC),
  authRequired: process.env.AUTH_REQUIRED === "true",
};

export function isGoogleAuthConfigured(): boolean {
  return Boolean(config.googleClientId && config.jwtSecret);
}
