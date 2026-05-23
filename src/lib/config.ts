const DEFAULT_PORT = 3001;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_JWT_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

const defaultPort = Number(process.env.PORT ?? DEFAULT_PORT);

export const config = {
  port: defaultPort,
  contextTtlMs: Number(process.env.CONTEXT_TTL_MS ?? DEFAULT_TTL_MS),
  pruneIntervalMs: Number(process.env.PRUNE_INTERVAL_MS ?? 5 * 60 * 1000),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleOAuthRedirectUri:
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    `http://localhost:${defaultPort}/auth/google/callback`,
  jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-change-me",
  jwtTtlSec: Number(process.env.JWT_TTL_SEC ?? DEFAULT_JWT_TTL_SEC),
  authRequired: process.env.AUTH_REQUIRED === "true",
};

/** Token exchange via access token (chrome.identity.getAuthToken). */
export function isGoogleAuthConfigured(): boolean {
  return Boolean(config.googleClientId && config.jwtSecret);
}

/** Browser OAuth redirect flow for extension launchWebAuthFlow. */
export function isGoogleOAuthFlowConfigured(): boolean {
  return Boolean(
    config.googleClientId &&
      config.googleClientSecret &&
      config.googleOAuthRedirectUri &&
      config.jwtSecret &&
      !isPlaceholderGoogleClientId(config.googleClientId) &&
      !isPlaceholderGoogleSecret(config.googleClientSecret)
  );
}

const PLACEHOLDER_CLIENT_RE =
  /your-client-id|REPLACE|example|xxx|changeme/i;
const PLACEHOLDER_SECRET_RE = /your-client-secret|REPLACE|example|changeme/i;

export function isPlaceholderGoogleClientId(id: string): boolean {
  return !id.endsWith(".apps.googleusercontent.com") || PLACEHOLDER_CLIENT_RE.test(id);
}

export function isPlaceholderGoogleSecret(secret: string): boolean {
  return secret.length < 10 || PLACEHOLDER_SECRET_RE.test(secret);
}

export function warnIfPlaceholderGoogleCredentials(): void {
  if (isPlaceholderGoogleClientId(config.googleClientId)) {
    console.warn(
      "[syncle-services] GOOGLE_CLIENT_ID is still a placeholder in .env — Google sign-in will fail with invalid_client. See docs/AUTH.md"
    );
  }
  if (isPlaceholderGoogleSecret(config.googleClientSecret)) {
    console.warn(
      "[syncle-services] GOOGLE_CLIENT_SECRET is still a placeholder in .env"
    );
  }
}
