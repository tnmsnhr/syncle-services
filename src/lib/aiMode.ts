/**
 * When true, POST /chat does not call OpenAI — returns registered extraction only.
 * Default on (local extraction focus). Set ECHO_EXTRACTION_ONLY=false to enable AI.
 */
export const ECHO_EXTRACTION_ONLY =
  process.env.ECHO_EXTRACTION_ONLY !== "false";
