/** Per-user summaries — persisted to data/user-data.json (no seed data). */

import {
  loadUserData,
  mutateUserData,
} from "./userDataPersistence.js";

export interface FollowUpMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface SummaryRecord {
  id: string;
  userId: string;
  title: string;
  originalText: string;
  summaryText: string;
  sourceUrl: string;
  website: string;
  tags: string[];
  pinned: boolean;
  followUps: FollowUpMessage[];
  createdAt: string;
  updatedAt: string;
  selectionContextId?: string;
  pageContextId?: string;
  isAutoSummary?: boolean;
}

let idCounter = Date.now();

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

async function listForUser(userId: string): Promise<SummaryRecord[]> {
  const data = await loadUserData();
  return (data.summaries[userId] as SummaryRecord[] | undefined) ?? [];
}

function saveList(userId: string, list: SummaryRecord[]): void {
  mutateUserData((data) => {
    data.summaries[userId] = list;
  });
}

let followId = 0;

export const summaryStore = {
  async list(
    userId: string,
    opts: {
      search?: string;
      status?: string;
      website?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ items: SummaryRecord[]; total: number; page: number; limit: number }> {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    let items = [...(await listForUser(userId))];

    if (opts.status === "pinned") items = items.filter((s) => s.pinned);
    if (opts.status === "unpinned") items = items.filter((s) => !s.pinned);

    if (opts.website) {
      const w = opts.website.toLowerCase();
      items = items.filter((s) => s.website.toLowerCase().includes(w));
    }

    if (opts.from) {
      const from = new Date(opts.from).getTime();
      items = items.filter((s) => new Date(s.createdAt).getTime() >= from);
    }
    if (opts.to) {
      const to = new Date(opts.to).getTime();
      items = items.filter((s) => new Date(s.createdAt).getTime() <= to);
    }

    if (opts.search) {
      const q = opts.search.toLowerCase();
      items = items.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.summaryText.toLowerCase().includes(q) ||
          s.originalText.toLowerCase().includes(q) ||
          s.sourceUrl.toLowerCase().includes(q)
      );
    }

    items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = items.length;
    const start = (page - 1) * limit;
    return { items: items.slice(start, start + limit), total, page, limit };
  },

  async get(userId: string, id: string): Promise<SummaryRecord | undefined> {
    return (await listForUser(userId)).find((s) => s.id === id);
  },

  async create(
    userId: string,
    data: Omit<SummaryRecord, "id" | "userId" | "createdAt" | "updatedAt">
  ): Promise<SummaryRecord> {
    const now = new Date().toISOString();
    const record: SummaryRecord = {
      ...data,
      id: `sum_${++idCounter}`,
      userId,
      website: data.website || hostFromUrl(data.sourceUrl),
      createdAt: now,
      updatedAt: now,
    };
    const list = await listForUser(userId);
    list.unshift(record);
    saveList(userId, list);
    return record;
  },

  /** Upsert by selectionContextId — used when extension/chat saves the same highlight. */
  async upsertFromChat(
    userId: string,
    data: Omit<SummaryRecord, "id" | "userId" | "createdAt" | "updatedAt"> & {
      userMessage: string;
    }
  ): Promise<SummaryRecord> {
    const list = await listForUser(userId);
    const selId = data.selectionContextId;
    const existing = selId
      ? list.find((s) => s.selectionContextId === selId)
      : undefined;

    const now = new Date().toISOString();

    if (existing && !data.isAutoSummary) {
      existing.summaryText = data.summaryText;
      existing.updatedAt = now;
      existing.followUps.push(
        {
          id: `f_${++followId}`,
          role: "user",
          content: data.userMessage,
          createdAt: now,
        },
        {
          id: `f_${++followId}`,
          role: "assistant",
          content: data.summaryText,
          createdAt: now,
        }
      );
      saveList(userId, list);
      return existing;
    }

    if (existing && data.isAutoSummary) {
      existing.summaryText = data.summaryText;
      existing.originalText = data.originalText;
      existing.title = data.title;
      existing.updatedAt = now;
      saveList(userId, list);
      return existing;
    }

    const { userMessage: _msg, ...record } = data;
    return this.create(userId, record);
  },

  async update(
    userId: string,
    id: string,
    patch: Partial<Pick<SummaryRecord, "title" | "tags">>
  ): Promise<SummaryRecord | undefined> {
    const list = await listForUser(userId);
    const item = list.find((s) => s.id === id);
    if (!item) return undefined;
    if (patch.title !== undefined) item.title = patch.title;
    if (patch.tags !== undefined) item.tags = patch.tags;
    item.updatedAt = new Date().toISOString();
    saveList(userId, list);
    return item;
  },

  async togglePin(userId: string, id: string): Promise<SummaryRecord | undefined> {
    const list = await listForUser(userId);
    const item = list.find((s) => s.id === id);
    if (!item) return undefined;
    item.pinned = !item.pinned;
    item.updatedAt = new Date().toISOString();
    saveList(userId, list);
    return item;
  },

  async delete(userId: string, id: string): Promise<boolean> {
    const list = await listForUser(userId);
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    saveList(userId, list);
    return true;
  },

  async stats(userId: string): Promise<{
    totalSummaries: number;
    pinnedCount: number;
    websitesThisWeek: number;
  }> {
    const items = await listForUser(userId);
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = items.filter((s) => new Date(s.createdAt).getTime() >= weekAgo);
    const hosts = new Set(recent.map((s) => s.website));
    return {
      totalSummaries: items.length,
      pinnedCount: items.filter((s) => s.pinned).length,
      websitesThisWeek: hosts.size,
    };
  },

  async recentActivity(
    userId: string,
    limit = 5
  ): Promise<Array<{ id: string; title: string; action: string; at: string }>> {
    const items = await listForUser(userId);
    return items.slice(0, limit).map((s) => ({
      id: s.id,
      title: s.title,
      action: s.pinned ? "pinned" : "created",
      at: s.updatedAt,
    }));
  },
};
