import { Hono } from "hono";
import { config, isGoogleAuthConfigured } from "../lib/config.js";
import { parseJsonBody } from "../lib/validate.js";
import { googleSignInBodySchema } from "../types/auth.js";
import { verifyGoogleAccessToken } from "../services/googleAuth.js";
import { issueSessionToken, verifySessionToken } from "../services/sessionJwt.js";
import type { AuthVariables } from "../middleware/auth.js";

export const authRoutes = new Hono<{ Variables: AuthVariables }>();

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
