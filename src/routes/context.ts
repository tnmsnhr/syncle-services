import { Hono } from "hono";
import { contextStore } from "../services/contextStore.js";
import { parseJsonBody } from "../lib/validate.js";
import {
  registerPageContextBodySchema,
  registerSelectionContextBodySchema,
} from "../types/api.js";

export const contextRoutes = new Hono();

contextRoutes.post("/context/page/register", async (c) => {
  const parsed = await parseJsonBody(c, registerPageContextBodySchema);
  if (!parsed.ok) return parsed.response;

  const ids = contextStore.registerPage(parsed.data);
  return c.json(ids, 201);
});

contextRoutes.post("/context/selection/register", async (c) => {
  const parsed = await parseJsonBody(c, registerSelectionContextBodySchema);
  if (!parsed.ok) return parsed.response;

  const selectionContextId = contextStore.registerSelection(parsed.data);
  if (!selectionContextId) {
    return c.json({ error: "pageContextId not found or expired" }, 404);
  }

  return c.json({ selectionContextId }, 201);
});
