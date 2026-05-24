import { Hono } from "hono";
import { parseJsonBody } from "../lib/validate.js";
import {
  memoryItemBodySchema,
  memoryPatchSchema,
  summaryCreateBodySchema,
  summaryListQuerySchema,
  summaryPatchSchema,
} from "../types/dashboard.js";
import { summaryStore } from "../services/summaryStore.js";
import { memoryStore } from "../services/memoryStore.js";
import { syncStore } from "../services/syncStore.js";
import type { AuthVariables } from "../middleware/auth.js";
import type { SessionClaims } from "../services/sessionJwt.js";

export const apiRoutes = new Hono<{ Variables: AuthVariables }>();

function requireUser(c: {
  get: (k: "user") => SessionClaims | undefined;
  json: (data: unknown, status?: number) => Response;
}): SessionClaims | Response {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized — sign in with Google" }, 401);
  }
  return user;
}

apiRoutes.get("/me", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const stats = await summaryStore.stats(user.sub);
  return c.json({
    user: {
      sub: user.sub,
      email: user.email,
      name: user.email?.split("@")[0] ?? "User",
    },
    plan: "free",
    usage: { summariesThisMonth: stats.totalSummaries, limit: 500 },
  });
});

apiRoutes.post("/logout", (c) => c.json({ ok: true }));

apiRoutes.get("/dashboard/stats", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const stats = await summaryStore.stats(user.sub);
  const recentActivity = await summaryStore.recentActivity(user.sub);
  return c.json({
    ...stats,
    summariesThisMonth: stats.totalSummaries,
    usagePercent: Math.min(100, Math.round((stats.totalSummaries / 50) * 100)),
    recentActivity,
    quickStats: {
      avgSummariesPerDay: Math.max(0, Math.round(stats.totalSummaries / 7)),
      lastSummaryAt: recentActivity[0]?.at ?? null,
    },
  });
});

apiRoutes.get("/summaries", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const parsed = summaryListQuerySchema.safeParse({
    search: c.req.query("search"),
    status: c.req.query("status") || "all",
    website: c.req.query("website"),
    from: c.req.query("from"),
    to: c.req.query("to"),
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });

  const q = parsed.success ? parsed.data : {};
  const result = await summaryStore.list(user.sub, {
    search: q.search,
    status: q.status === "all" ? undefined : q.status,
    website: q.website,
    from: q.from,
    to: q.to,
    page: q.page,
    limit: q.limit,
  });

  return c.json({
    items: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / result.limit) || 1,
    },
  });
});

apiRoutes.post("/summaries", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const parsed = await parseJsonBody(c, summaryCreateBodySchema);
  if (!parsed.ok) return parsed.response;

  const record = await summaryStore.upsertFromChat(user.sub, {
    title: parsed.data.title,
    originalText: parsed.data.originalText,
    summaryText: parsed.data.summaryText,
    sourceUrl: parsed.data.sourceUrl,
    website: "",
    tags: parsed.data.tags ?? [],
    pinned: false,
    followUps: [],
    selectionContextId: parsed.data.selectionContextId,
    pageContextId: parsed.data.pageContextId,
    isAutoSummary: true,
    userMessage: "__syncle_explain_selection__",
  });

  return c.json(record, 201);
});

apiRoutes.get("/summaries/:id", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const item = await summaryStore.get(user.sub, c.req.param("id"));
  if (!item) return c.json({ error: "Summary not found" }, 404);
  return c.json(item);
});

apiRoutes.post("/summaries/:id/pin", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const item = await summaryStore.togglePin(user.sub, c.req.param("id"));
  if (!item) return c.json({ error: "Summary not found" }, 404);
  return c.json(item);
});

apiRoutes.delete("/summaries/:id", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const ok = await summaryStore.delete(user.sub, c.req.param("id"));
  if (!ok) return c.json({ error: "Summary not found" }, 404);
  return c.json({ ok: true });
});

apiRoutes.patch("/summaries/:id", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const parsed = await parseJsonBody(c, summaryPatchSchema);
  if (!parsed.ok) return parsed.response;
  const item = await summaryStore.update(user.sub, c.req.param("id"), parsed.data);
  if (!item) return c.json({ error: "Summary not found" }, 404);
  return c.json(item);
});

apiRoutes.get("/memory", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json(memoryStore.getState(user.sub));
});

apiRoutes.post("/memory", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const parsed = await parseJsonBody(c, memoryItemBodySchema);
  if (!parsed.ok) return parsed.response;
  const item = memoryStore.create(user.sub, parsed.data);
  return c.json(item, 201);
});

apiRoutes.patch("/memory/:id", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const parsed = await parseJsonBody(c, memoryPatchSchema);
  if (!parsed.ok) return parsed.response;
  const item = memoryStore.update(user.sub, c.req.param("id"), parsed.data);
  if (!item) return c.json({ error: "Memory item not found" }, 404);
  return c.json(item);
});

apiRoutes.delete("/memory/:id", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const ok = memoryStore.delete(user.sub, c.req.param("id"));
  if (!ok) return c.json({ error: "Memory item not found" }, 404);
  return c.json({ ok: true });
});

apiRoutes.patch("/memory", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.enabled === "boolean") {
    memoryStore.setEnabled(user.sub, body.enabled);
  }
  return c.json(memoryStore.getState(user.sub));
});

apiRoutes.get("/sync/status", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json(syncStore.getStatus(user.sub));
});

apiRoutes.post("/sync/manual", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const status = await syncStore.triggerManualSync(user.sub);
  return c.json(status);
});
