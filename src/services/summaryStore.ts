/** In-memory summary store keyed by user sub (v1). */

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
}

const summariesByUser = new Map<string, SummaryRecord[]>();

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function seedForUser(userId: string): void {
  if (summariesByUser.has(userId)) return;

  const now = Date.now();
  const samples: Omit<SummaryRecord, "id" | "userId">[] = [
    {
      title: "React Server Components overview",
      originalText:
        "Server Components run on the server and can fetch data directly without useEffect...",
      summaryText:
        "RSC lets you fetch on the server and stream UI to the client, reducing client bundle size and waterfall requests.",
      sourceUrl: "https://react.dev/reference/rsc/server-components",
      website: "react.dev",
      tags: ["react", "frontend"],
      pinned: true,
      followUps: [
        {
          id: "f1",
          role: "user",
          content: "When should I use client components instead?",
          createdAt: new Date(now - 3600000).toISOString(),
        },
        {
          id: "f2",
          role: "assistant",
          content:
            "Use client components when you need interactivity, browser APIs, or local state.",
          createdAt: new Date(now - 3500000).toISOString(),
        },
      ],
      createdAt: new Date(now - 86400000 * 2).toISOString(),
      updatedAt: new Date(now - 86400000 * 2).toISOString(),
    },
    {
      title: "Tailwind v4 migration notes",
      originalText: "Tailwind CSS v4 uses @import tailwindcss and a new Vite plugin...",
      summaryText:
        "v4 simplifies setup with a single CSS import and native Vite integration; config moves toward CSS-first.",
      sourceUrl: "https://tailwindcss.com/docs",
      website: "tailwindcss.com",
      tags: ["css", "tooling"],
      pinned: false,
      followUps: [],
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString(),
    },
    {
      title: "Chrome extension MV3 service workers",
      originalText:
        "Manifest V3 replaces background pages with service workers that may terminate...",
      summaryText:
        "MV3 service workers are event-driven and short-lived; persist state in chrome.storage and use offscreen documents when needed.",
      sourceUrl: "https://developer.chrome.com/docs/extensions/mv3/service_workers/",
      website: "developer.chrome.com",
      tags: ["chrome", "extension"],
      pinned: true,
      followUps: [],
      createdAt: new Date(now - 43200000).toISOString(),
      updatedAt: new Date(now - 43200000).toISOString(),
    },
  ];

  summariesByUser.set(
    userId,
    samples.map((s, i) => ({
      ...s,
      id: `sum_${userId.slice(0, 6)}_${i + 1}`,
      userId,
    }))
  );
}

function listForUser(userId: string): SummaryRecord[] {
  seedForUser(userId);
  return summariesByUser.get(userId)!;
}

let idCounter = 1000;

export const summaryStore = {
  list(
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
  ): { items: SummaryRecord[]; total: number; page: number; limit: number } {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    let items = [...listForUser(userId)];

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

  get(userId: string, id: string): SummaryRecord | undefined {
    return listForUser(userId).find((s) => s.id === id);
  },

  create(
    userId: string,
    data: Omit<SummaryRecord, "id" | "userId" | "createdAt" | "updatedAt">
  ): SummaryRecord {
    seedForUser(userId);
    const now = new Date().toISOString();
    const record: SummaryRecord = {
      ...data,
      id: `sum_${++idCounter}`,
      userId,
      website: data.website || hostFromUrl(data.sourceUrl),
      createdAt: now,
      updatedAt: now,
    };
    listForUser(userId).unshift(record);
    return record;
  },

  update(
    userId: string,
    id: string,
    patch: Partial<Pick<SummaryRecord, "title" | "tags">>
  ): SummaryRecord | undefined {
    const item = this.get(userId, id);
    if (!item) return undefined;
    if (patch.title !== undefined) item.title = patch.title;
    if (patch.tags !== undefined) item.tags = patch.tags;
    item.updatedAt = new Date().toISOString();
    return item;
  },

  togglePin(userId: string, id: string): SummaryRecord | undefined {
    const item = this.get(userId, id);
    if (!item) return undefined;
    item.pinned = !item.pinned;
    item.updatedAt = new Date().toISOString();
    return item;
  },

  delete(userId: string, id: string): boolean {
    const list = listForUser(userId);
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  },

  stats(userId: string): {
    totalSummaries: number;
    pinnedCount: number;
    websitesThisWeek: number;
  } {
    const items = listForUser(userId);
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = items.filter((s) => new Date(s.createdAt).getTime() >= weekAgo);
    const hosts = new Set(recent.map((s) => s.website));
    return {
      totalSummaries: items.length,
      pinnedCount: items.filter((s) => s.pinned).length,
      websitesThisWeek: hosts.size,
    };
  },

  recentActivity(
    userId: string,
    limit = 5
  ): Array<{ id: string; title: string; action: string; at: string }> {
    return listForUser(userId)
      .slice(0, limit)
      .map((s) => ({
        id: s.id,
        title: s.title,
        action: s.pinned ? "pinned" : "created",
        at: s.updatedAt,
      }));
  },
};
