import {
  formatPageContextBlock,
  parseSelectionRecord,
} from "../ai/buildAnswerPrompt.js";
import { formatContextLensBlock } from "../ai/selectionShape.js";
import type {
  PageContextRecord,
  SelectionContextRecord,
} from "./contextStore.js";

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function section(title: string, body: string | undefined): string {
  if (!body?.trim()) return "";
  return `**${title}**\n${body.trim()}`;
}

/**
 * Human-readable dump of what the extension registered (no LLM).
 */
export function formatExtractedReply(
  page: PageContextRecord,
  selection: SelectionContextRecord,
  userMessage?: string
): string {
  const sel = selection.selection as Record<string, unknown>;
  const meta =
    sel.meta && typeof sel.meta === "object"
      ? (sel.meta as Record<string, unknown>)
      : {};

  const parsed = parseSelectionRecord(selection);
  const pageBlock = formatPageContextBlock(page);
  const lensBlock = formatContextLensBlock(parsed.contextLens);
  const localBlock = parsed.localContextBlock;

  const lines: string[] = [
    "_OpenAI disconnected (ECHO_EXTRACTION_ONLY). Showing registered extraction._",
    "",
  ];

  const focus = section(
    "Selected focus",
    parsed.focusText ||
      (parsed.hasVisual ? "(visual selection — image stored, not shown here)" : "(empty)")
  );
  if (focus) lines.push(focus, "");

  const metaLines: string[] = [];
  const shape =
    pickString(sel, "selectionShape") || pickString(meta, "selectionShape");
  if (shape) metaLines.push(`selectionShape: ${shape}`);
  if (parsed.elementTypes.length) {
    metaLines.push(`elementTypes: ${parsed.elementTypes.join(", ")}`);
  }
  if (typeof meta.focusConfidence === "number") {
    metaLines.push(`focus.confidence: ${meta.focusConfidence}`);
  }
  if (meta.focusExtractionMethod) {
    metaLines.push(`focus.extractionMethod: ${meta.focusExtractionMethod}`);
  }
  if (meta.focusUncertain === true) metaLines.push("focus.uncertain: true");
  if (meta.extractionStrategy) {
    metaLines.push(`extractionStrategy: ${meta.extractionStrategy}`);
  }
  if (meta.selectionTier) metaLines.push(`selectionTier: ${meta.selectionTier}`);
  if (metaLines.length) {
    lines.push("**Selection meta**", metaLines.join("\n"), "");
  }

  if (lensBlock) {
    lines.push("**Context lens**", lensBlock, "");
  }
  if (localBlock) {
    lines.push("**Local context**", localBlock, "");
  }
  if (pageBlock) {
    lines.push("**Page context**", pageBlock, "");
  }

  lines.push(
    `**IDs**`,
    `pageContextId: ${page.id}`,
    `selectionContextId: ${selection.id}`,
    `canonicalUrl: ${page.canonicalUrl}`
  );

  if (userMessage?.trim()) {
    lines.push("", "**Chat message (ignored in echo mode)**", userMessage.trim());
  }

  return lines.join("\n").trim();
}
