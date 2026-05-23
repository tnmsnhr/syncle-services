import { OAuth2Client } from "google-auth-library";
import { config } from "../lib/config.js";

const client = new OAuth2Client();

export interface GoogleUserInfo {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

/** Verify a Google OAuth access token from chrome.identity.getAuthToken. */
export async function verifyGoogleAccessToken(
  accessToken: string
): Promise<GoogleUserInfo> {
  if (!config.googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }

  const info = await client.getTokenInfo(accessToken);
  const aud =
    (info as { aud?: string; audience?: string }).aud ??
    (info as { audience?: string }).audience;

  if (aud && aud !== config.googleClientId) {
    throw new Error("Token audience does not match GOOGLE_CLIENT_ID");
  }

  if (!info.sub) {
    throw new Error("Invalid Google token: missing subject");
  }

  return {
    sub: info.sub,
    email: info.email,
    name: undefined,
    picture: undefined,
  };
}
