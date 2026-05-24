import type { Context, Next } from "hono";
import { config } from "../lib/config.js";
import { verifySessionToken, type SessionClaims } from "../services/sessionJwt.js";

export type AuthVariables = {
  user: SessionClaims;
};

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";

  if (token) {
    try {
      const user = await verifySessionToken(token);
      c.set("user", user);
      await next();
      return;
    } catch {
      if (config.authRequired) {
        return c.json({ error: "Invalid or expired session" }, 401);
      }
    }
  }

  if (config.authRequired) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
}
