/**
 * When true, POST /chat does not call OpenAI (or any AI provider).
 * Returns the extraction payload registered from the extension instead.
 *
 * Enable via .env: ECHO_EXTRACTION_ONLY=true
 */
export const ECHO_EXTRACTION_ONLY =
  process.env.ECHO_EXTRACTION_ONLY === "true";
