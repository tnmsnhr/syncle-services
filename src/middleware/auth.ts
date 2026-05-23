import type { Context, Next } from "hono";
import { config } from "../lib/config.js";
import { verifySessionToken, type SessionClaims } from "../services/sessionJwt.js";

export type AuthVariables = {
  user: SessionClaims;
};

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  if (!config.authRequired) {
    return next();
  }

  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const user = await verifySessionToken(token);
    c.set("user", user);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired session" }, 401);
  }
}
