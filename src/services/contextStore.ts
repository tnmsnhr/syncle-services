import { config } from "../lib/config.js";
import { newPageContextId, newSelectionContextId } from "../lib/ids.js";
import type {
  RegisterPageContextBody,
  RegisterSelectionContextBody,
} from "../types/api.js";

export interface PageContextRecord {
  id: string;
  schemaVersion: string;
  extractorVersion: string;
  pageFingerprint: string;
  canonicalUrl: string;
  pageContext: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

export interface SelectionContextRecord {
  id: string;
  pageContextId: string;
  schemaVersion: string;
  extractorVersion: string;
  pageFingerprint: string;
  selection: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

class ContextStore {
  private pages = new Map<string, PageContextRecord>();
  private selections = new Map<string, SelectionContextRecord>();
  private pruneTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => this.pruneExpired(), config.pruneIntervalMs);
    this.pruneTimer.unref?.();
  }

  stop(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  private expiresAt(): number {
    return Date.now() + config.contextTtlMs;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, record] of this.pages) {
      if (record.expiresAt <= now) this.pages.delete(id);
    }
    for (const [id, record] of this.selections) {
      if (record.expiresAt <= now) this.selections.delete(id);
    }
  }

  registerPage(body: RegisterPageContextBody): {
    pageContextId: string;
    selectionContextId: string;
  } {
    const now = Date.now();
    const expiresAt = this.expiresAt();
    const pageContextId = newPageContextId();
    const selectionContextId = newSelectionContextId();

    this.pages.set(pageContextId, {
      id: pageContextId,
      schemaVersion: body.schemaVersion,
      extractorVersion: body.extractorVersion,
      pageFingerprint: body.pageFingerprint,
      canonicalUrl: body.canonicalUrl,
      pageContext: body.pageContext,
      createdAt: now,
      expiresAt,
    });

    this.selections.set(selectionContextId, {
      id: selectionContextId,
      pageContextId,
      schemaVersion: body.schemaVersion,
      extractorVersion: body.extractorVersion,
      pageFingerprint: body.pageFingerprint,
      selection: body.selection,
      createdAt: now,
      expiresAt,
    });

    return { pageContextId, selectionContextId };
  }

  registerSelection(body: RegisterSelectionContextBody): string | null {
    const page = this.pages.get(body.pageContextId);
    if (!page || page.expiresAt <= Date.now()) {
      return null;
    }

    const selectionContextId = newSelectionContextId();
    const now = Date.now();

    this.selections.set(selectionContextId, {
      id: selectionContextId,
      pageContextId: body.pageContextId,
      schemaVersion: body.schemaVersion,
      extractorVersion: body.extractorVersion,
      pageFingerprint: body.pageFingerprint,
      selection: body.selection,
      createdAt: now,
      expiresAt: this.expiresAt(),
    });

    return selectionContextId;
  }

  getPage(id: string): PageContextRecord | undefined {
    const record = this.pages.get(id);
    if (!record || record.expiresAt <= Date.now()) {
      if (record) this.pages.delete(id);
      return undefined;
    }
    return record;
  }

  getSelection(id: string): SelectionContextRecord | undefined {
    const record = this.selections.get(id);
    if (!record || record.expiresAt <= Date.now()) {
      if (record) this.selections.delete(id);
      return undefined;
    }
    return record;
  }
}

export const contextStore = new ContextStore();
