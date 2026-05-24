import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../data");
const DATA_FILE = join(DATA_DIR, "user-data.json");

export interface PersistedUserData {
  summaries: Record<string, unknown[]>;
  memory: Record<string, { enabled: boolean; items: unknown[] }>;
}

const emptyData = (): PersistedUserData => ({
  summaries: {},
  memory: {},
});

let cache: PersistedUserData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadUserData(): Promise<PersistedUserData> {
  if (cache) return cache;
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    cache = { ...emptyData(), ...JSON.parse(raw) };
  } catch {
    cache = emptyData();
  }
  return cache!;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushUserData();
  }, 200);
}

export async function flushUserData(): Promise<void> {
  if (!cache) return;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(cache, null, 2), "utf8");
}

export function mutateUserData(mutator: (data: PersistedUserData) => void): void {
  if (!cache) {
    cache = emptyData();
  }
  mutator(cache);
  scheduleSave();
}

/** Call once at server startup. */
export async function initUserDataPersistence(): Promise<void> {
  await loadUserData();
}
