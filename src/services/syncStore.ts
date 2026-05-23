/** Per-user sync state (v1 in-memory). */

export interface SyncDevice {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string;
}

export interface SyncStatus {
  status: "synced" | "syncing" | "error" | "conflict";
  lastSyncedAt: string | null;
  message?: string;
  devices: SyncDevice[];
}

const byUser = new Map<string, SyncStatus>();

function seed(userId: string): SyncStatus {
  if (byUser.has(userId)) return byUser.get(userId)!;

  const now = new Date().toISOString();
  const state: SyncStatus = {
    status: "synced",
    lastSyncedAt: now,
    devices: [
      {
        id: "dev_current",
        name: "This browser",
        platform: "Chrome Extension",
        lastSeenAt: now,
      },
      {
        id: "dev_dashboard",
        name: "Syncle Dashboard",
        platform: "Web",
        lastSeenAt: now,
      },
    ],
  };
  byUser.set(userId, state);
  return state;
}

export const syncStore = {
  getStatus(userId: string): SyncStatus {
    return { ...seed(userId), devices: [...seed(userId).devices] };
  },

  async triggerManualSync(userId: string): Promise<SyncStatus> {
    const state = seed(userId);
    state.status = "syncing";
    // Simulate brief sync
    await new Promise((r) => setTimeout(r, 400));
    const now = new Date().toISOString();
    state.status = "synced";
    state.lastSyncedAt = now;
    state.message = undefined;
    const current = state.devices.find((d) => d.id === "dev_current");
    if (current) current.lastSeenAt = now;
    return this.getStatus(userId);
  },
};
