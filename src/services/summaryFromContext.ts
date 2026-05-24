import { parseSelectionRecord } from "../ai/buildAnswerPrompt.js";
import type {
  PageContextRecord,
  SelectionContextRecord,
} from "./contextStore.js";
import type { SummaryRecord } from "./summaryStore.js";

const AUTO_PROMPT = "__syncle_explain_selection__";

function titleFromText(text: string, url: string): string {
  const line = text.split(/\n/).find((l) => l.trim())?.trim() ?? "";
  if (line.length >= 12) return line.slice(0, 80);
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `Selection on ${host}`;
  } catch {
    return "Web selection";
  }
}

export function buildSummaryFromChat(
  userId: string,
  page: PageContextRecord,
  selection: SelectionContextRecord,
  userMessage: string,
  reply: string
): Omit<SummaryRecord, "id" | "createdAt" | "updatedAt"> {
  const parsed = parseSelectionRecord(selection);
  const originalText =
    parsed.focusText.trim() ||
    (parsed.hasVisual ? "(visual selection)" : "(empty selection)");

  return {
    userId,
    title: titleFromText(originalText, page.canonicalUrl),
    originalText,
    summaryText: reply,
    sourceUrl: page.canonicalUrl,
    website: hostFromUrl(page.canonicalUrl),
    tags: [],
    pinned: false,
    selectionContextId: selection.id,
    pageContextId: page.id,
    followUps: [],
    isAutoSummary: userMessage === AUTO_PROMPT || userMessage.includes(AUTO_PROMPT),
  };
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
