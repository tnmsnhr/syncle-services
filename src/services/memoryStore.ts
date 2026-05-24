/** Per-user memory — no seed data; starts empty per user. */

export interface MemoryItem {
  id: string;
  userId: string;
  key: string;
  value: string;
  category: "profile" | "preference" | "domain";
  createdAt: string;
  updatedAt: string;
}

interface UserMemoryState {
  enabled: boolean;
  items: MemoryItem[];
}

const byUser = new Map<string, UserMemoryState>();

function stateFor(userId: string): UserMemoryState {
  if (!byUser.has(userId)) {
    byUser.set(userId, { enabled: true, items: [] });
  }
  return byUser.get(userId)!;
}

let memId = 100;

export const memoryStore = {
  getState(userId: string): { enabled: boolean; items: MemoryItem[] } {
    const s = stateFor(userId);
    return { enabled: s.enabled, items: [...s.items] };
  },

  setEnabled(userId: string, enabled: boolean): void {
    stateFor(userId).enabled = enabled;
  },

  create(
    userId: string,
    data: { key: string; value: string; category?: MemoryItem["category"] }
  ): MemoryItem {
    const s = stateFor(userId);
    const now = new Date().toISOString();
    const item: MemoryItem = {
      id: `mem_${++memId}`,
      userId,
      key: data.key,
      value: data.value,
      category: data.category ?? "preference",
      createdAt: now,
      updatedAt: now,
    };
    s.items.push(item);
    return item;
  },

  update(
    userId: string,
    id: string,
    patch: Partial<Pick<MemoryItem, "key" | "value" | "category">>
  ): MemoryItem | undefined {
    const item = stateFor(userId).items.find((m) => m.id === id);
    if (!item) return undefined;
    if (patch.key !== undefined) item.key = patch.key;
    if (patch.value !== undefined) item.value = patch.value;
    if (patch.category !== undefined) item.category = patch.category;
    item.updatedAt = new Date().toISOString();
    return item;
  },

  delete(userId: string, id: string): boolean {
    const s = stateFor(userId);
    const idx = s.items.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    s.items.splice(idx, 1);
    return true;
  },
};
