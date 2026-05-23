import { SignJWT, jwtVerify } from "jose";
import { config } from "../lib/config.js";
import type { GoogleUserInfo } from "./googleAuth.js";

export interface SessionClaims {
  sub: string;
  email?: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(config.jwtSecret);
}

export async function issueSessionToken(user: GoogleUserInfo): Promise<string> {
  return new SignJWT({
    email: user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime(`${config.jwtTtlSec}s`)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secretKey(), {
    algorithms: ["HS256"],
  });

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Invalid session token");
  }

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
