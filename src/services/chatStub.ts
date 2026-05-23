import type { ChatBody, ChatStubResponse } from "../types/api.js";
import type {
  PageContextRecord,
  SelectionContextRecord,
} from "./contextStore.js";

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function summarizeSelection(selection: Record<string, unknown>): string | undefined {
  const direct = pickString(selection, "text");
  if (direct) return direct.slice(0, 200);

  const userSelection = selection.userSelection;
  if (userSelection && typeof userSelection === "object") {
    const text = pickString(userSelection as Record<string, unknown>, "text");
    if (text) return text.slice(0, 200);
  }

  const focus = selection.focus;
  if (focus && typeof focus === "object") {
    const text = pickString(focus as Record<string, unknown>, "text");
    if (text) return text.slice(0, 200);
  }

  return undefined;
}

function summarizePage(pageContext: Record<string, unknown>, canonicalUrl: string): {
  pageTitle?: string;
  canonicalUrl: string;
} {
  const source = pageContext.source;
  if (source && typeof source === "object") {
    const title = pickString(source as Record<string, unknown>, "title");
    if (title) return { pageTitle: title, canonicalUrl };
  }

  const context = pageContext.context;
  if (context && typeof context === "object") {
    const title = pickString(
      context as Record<string, unknown>,
      "pageTitle",
      "h1"
    );
    if (title) return { pageTitle: title, canonicalUrl };
  }

  const page = pageContext.page;
  if (page && typeof page === "object") {
    const title = pickString(page as Record<string, unknown>, "title");
    if (title) return { pageTitle: title, canonicalUrl };
  }

  return { canonicalUrl };
}

export function buildStubChatReply(
  body: ChatBody,
  page: PageContextRecord,
  selection: SelectionContextRecord
): ChatStubResponse {
  const selectionText = summarizeSelection(selection.selection);
  const pageSummary = summarizePage(page.pageContext, page.canonicalUrl);

  const contextHint = [
    pageSummary.pageTitle ? `page "${pageSummary.pageTitle}"` : null,
    selectionText ? `selection "${selectionText}"` : "no selection text",
  ]
    .filter(Boolean)
    .join(", ");

  const reply = [
    `[Syncle stub] You asked: ${body.message.slice(0, 500)}`,
    `Context: ${contextHint}.`,
    "Wire a real LLM provider here when ready — no API keys in v1.",
  ].join("\n\n");

  return {
    reply,
    stub: true,
    pageContextId: body.pageContextId,
    selectionContextId: body.selectionContextId,
    summary: {
      ...pageSummary,
      selectionText,
    },
  };
}
