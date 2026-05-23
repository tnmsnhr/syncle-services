import { config } from "../lib/config.js";
import type { ChatProvider } from "./types.js";
import { OpenAiChatProvider } from "./providers/openai.js";
import { StubChatProvider } from "./providers/stub.js";

let cached: ChatProvider | null = null;

export function getChatProvider(): ChatProvider {
  if (cached) return cached;

  const provider = (config.aiProvider || "openai").toLowerCase();

  if (provider === "openai") {
    const openai = new OpenAiChatProvider();
    cached = openai.isConfigured() ? openai : new StubChatProvider();
    return cached;
  }

  if (provider === "stub") {
    cached = new StubChatProvider();
    return cached;
  }

  console.warn(
    `[syncle-services] Unknown AI_PROVIDER="${config.aiProvider}", using stub`
  );
  cached = new StubChatProvider();
  return cached;
}

/** Reset provider cache (tests / hot reload). */
export function resetChatProvider(): void {
  cached = null;
}
