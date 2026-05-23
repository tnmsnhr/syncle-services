import { Hono } from "hono";
import { contextStore } from "../services/contextStore.js";
import { buildStubChatReply } from "../services/chatStub.js";
import { parseJsonBody } from "../lib/validate.js";
import { chatBodySchema } from "../types/api.js";

export const chatRoutes = new Hono();

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

  const response = buildStubChatReply(parsed.data, page, selection);
  return c.json(response);
});
