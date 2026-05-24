import { Hono } from "hono";
import { contextStore } from "../services/contextStore.js";
import { runChat } from "../services/chatService.js";
import { parseJsonBody } from "../lib/validate.js";
import { chatBodySchema } from "../types/api.js";
import { getChatProvider } from "../ai/factory.js";
import { config, isOpenAiConfigured } from "../lib/config.js";
import { ECHO_EXTRACTION_ONLY } from "../lib/aiMode.js";
import { buildSummaryFromChat } from "../services/summaryFromContext.js";
import { summaryStore } from "../services/summaryStore.js";
import type { AuthVariables } from "../middleware/auth.js";

export const chatRoutes = new Hono<{ Variables: AuthVariables }>();

chatRoutes.get("/ai/status", (c) => {
  if (ECHO_EXTRACTION_ONLY) {
    return c.json({
      provider: "echo",
      configured: true,
      openai: false,
      echoExtractionOnly: true,
    });
  }
  const provider = getChatProvider();
  return c.json({
    provider: provider.id,
    configured: provider.isConfigured(),
    openai: isOpenAiConfigured(),
    echoExtractionOnly: config.echoExtractionOnly,
  });
});

chatRoutes.post("/chat", async (c) => {
  const parsed = await parseJsonBody(c, chatBodySchema);
  if (!parsed.ok) return parsed.response;

  const page = contextStore.getPage(parsed.data.pageContextId);
  if (!page) {
    return c.json({ error: "pageContextId not found or expired" }, 404);
  }

  const selection = contextStore.getSelection(parsed.data.selectionContextId);
  if (!selection) {
    return c.json({ error: "selectionContextId not found or expired" }, 404);
  }

  if (selection.pageContextId !== parsed.data.pageContextId) {
    return c.json(
      { error: "selectionContextId does not belong to pageContextId" },
      400
    );
  }

  try {
    const response = await runChat(parsed.data, page, selection);

    // Summaries from AI chat only when OpenAI is enabled
    if (!ECHO_EXTRACTION_ONLY) {
      const user = c.get("user");
      if (user) {
        const partial = buildSummaryFromChat(
          user.sub,
          page,
          selection,
          parsed.data.message,
          response.reply
        );
        await summaryStore.upsertFromChat(user.sub, {
          ...partial,
          userMessage: parsed.data.message,
        });
      }
    }

    return c.json(response);
  } catch (err) {
    console.error("[syncle-services] chat failed:", err);
    const message =
      err instanceof Error ? err.message : "Chat completion failed";
    return c.json({ error: message }, 502);
  }
});
