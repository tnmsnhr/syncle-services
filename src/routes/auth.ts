import { Hono } from "hono";
import {
  config,
  isGoogleAuthConfigured,
  isGoogleOAuthFlowConfigured,
} from "../lib/config.js";
import { parseJsonBody } from "../lib/validate.js";
import { googleSignInBodySchema } from "../types/auth.js";
import { verifyGoogleAccessToken } from "../services/googleAuth.js";
import { issueSessionToken, verifySessionToken } from "../services/sessionJwt.js";
import {
  buildGoogleAuthorizeUrl,
  consumeOAuthState,
  createOAuthState,
  exchangeCodeForUser,
  isAllowedOAuthRedirectUri,
  pruneExpiredOAuthStates,
} from "../services/googleOAuthFlow.js";
import type { AuthVariables } from "../middleware/auth.js";

export const authRoutes = new Hono<{ Variables: AuthVariables }>();

authRoutes.get("/auth/status", (c) => {
  const ready = isGoogleOAuthFlowConfigured();
  return c.json({
    /** Extension sign-in (launchWebAuthFlow) — requires client ID + secret. */
    googleSignIn: ready,
    browserOAuth: ready,
  });
});

/** Start Google sign-in; extension opens this URL with launchWebAuthFlow. */
/** Dashboard sign-in — redirects back to DASHBOARD_ORIGIN/login/callback with JWT in hash. */
authRoutes.get("/auth/google/dashboard/start", (c) => {
  if (!isGoogleOAuthFlowConfigured()) {
    return c.json(
      {
        error: "Google sign-in not configured",
        hint: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET in .env",
      },
      503
    );
  }

  pruneExpiredOAuthStates();
  // Must not be under /auth/* — Vite dev proxy forwards /auth to this API.
  const callback = `${config.dashboardOrigin.replace(/\/$/, "")}/login/callback`;
  const state = createOAuthState(callback);
  return c.redirect(buildGoogleAuthorizeUrl(state));
});

authRoutes.get("/auth/google/start", (c) => {
  if (!isGoogleOAuthFlowConfigured()) {
    return c.html(
      `<html><body><p>Google sign-in is not configured on the server.</p>
      <p>Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and JWT_SECRET in syncle-services/.env</p></body></html>`,
      503
    );
  }

  const redirectUri = c.req.query("redirect_uri") ?? "";
  if (!isAllowedOAuthRedirectUri(redirectUri)) {
    return c.json({ error: "Invalid redirect_uri" }, 400);
  }

  pruneExpiredOAuthStates();
  const state = createOAuthState(redirectUri);
  return c.redirect(buildGoogleAuthorizeUrl(state));
});

/** Google redirects here after user approves. */
authRoutes.get("/auth/google/callback", async (c) => {
  if (!isGoogleOAuthFlowConfigured()) {
    return c.text("Google OAuth not configured", 503);
  }

  const error = c.req.query("error");
  if (error) {
    const desc = c.req.query("error_description") ?? error;
    return c.html(`<html><body><p>Sign-in failed: ${desc}</p></body></html>`, 400);
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.text("Missing code or state", 400);
  }

  const extensionRedirect = consumeOAuthState(state);
  if (!extensionRedirect) {
    return c.text("Invalid or expired sign-in session", 400);
  }

  try {
    const googleUser = await exchangeCodeForUser(code);
    const token = await issueSessionToken(googleUser);
    const final = new URL(extensionRedirect);
    final.hash = new URLSearchParams({
      token,
      email: googleUser.email ?? "",
    }).toString();
    return c.redirect(final.toString());
  } catch (err) {
    console.error("[syncle-services] OAuth callback failed:", err);
    return c.html(
      "<html><body><p>Sign-in failed. Close this window and try again.</p></body></html>",
      500
    );
  }
});

authRoutes.post("/auth/google", async (c) => {
  if (!isGoogleAuthConfigured()) {
    return c.json(
      {
        error: "Google auth not configured",
        hint: "Set GOOGLE_CLIENT_ID and JWT_SECRET in syncle-services/.env",
      },
      503
    );
  }

  const parsed = await parseJsonBody(c, googleSignInBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const googleUser = await verifyGoogleAccessToken(parsed.data.accessToken);
    const token = await issueSessionToken(googleUser);
    return c.json({
      token,
      user: {
        sub: googleUser.sub,
        email: googleUser.email,
      },
      expiresInSec: config.jwtTtlSec,
    });
  } catch (err) {
    console.error("[syncle-services] Google auth failed:", err);
    return c.json({ error: "Invalid Google access token" }, 401);
  }
});

authRoutes.get("/auth/me", async (c) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const user = await verifySessionToken(header.slice("Bearer ".length).trim());
    return c.json({ user });
  } catch {
    return c.json({ error: "Invalid or expired session" }, 401);
  }
});
