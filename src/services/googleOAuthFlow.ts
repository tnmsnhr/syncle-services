import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { config, isGoogleOAuthFlowConfigured } from "../lib/config.js";
import type { GoogleUserInfo } from "./googleAuth.js";

interface PendingOAuthState {
  redirectUri: string;
  expiresAt: number;
}

const pendingByState = new Map<string, PendingOAuthState>();

const STATE_TTL_MS = 10 * 60 * 1000;

export { isGoogleOAuthFlowConfigured };

/** Redirect targets after Google OAuth (extension or dashboard). */
export function isAllowedOAuthRedirectUri(uri: string): boolean {
  if (uri.startsWith("chrome-extension://")) return true;
  try {
    const url = new URL(uri);
    if (url.hostname.endsWith(".chromiumapp.org")) return true;
    if (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    ) {
      return (
        url.pathname === "/login/callback" ||
        url.pathname.endsWith("/login/callback")
      );
    }
  } catch {
    return false;
  }
  return false;
}

/** @deprecated Use isAllowedOAuthRedirectUri */
export const isAllowedExtensionRedirectUri = isAllowedOAuthRedirectUri;

function oauthClient(): OAuth2Client {
  return new OAuth2Client(
    config.googleClientId,
    config.googleClientSecret,
    config.googleOAuthRedirectUri
  );
}

export function createOAuthState(redirectUri: string): string {
  const state = randomBytes(16).toString("hex");
  pendingByState.set(state, {
    redirectUri,
    expiresAt: Date.now() + STATE_TTL_MS,
  });
  return state;
}

export function consumeOAuthState(state: string): string | null {
  const pending = pendingByState.get(state);
  pendingByState.delete(state);
  if (!pending || pending.expiresAt < Date.now()) return null;
  return pending.redirectUri;
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const url = oauthClient().generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
  return url;
}

export async function exchangeCodeForUser(code: string): Promise<GoogleUserInfo> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) {
    throw new Error("No access token from Google");
  }

  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!res.ok) {
    throw new Error("Failed to load Google user profile");
  }

  const profile = (await res.json()) as {
    id?: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!profile.id) {
    throw new Error("Google profile missing id");
  }

  return {
    sub: profile.id,
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
  };
}

export function pruneExpiredOAuthStates(): void {
  const now = Date.now();
  for (const [state, pending] of pendingByState) {
    if (pending.expiresAt <= now) pendingByState.delete(state);
  }
}
