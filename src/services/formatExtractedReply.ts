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

  const lines: string[] = [];

  const candidateLines = parsed.selectionEvidence.candidates
    .slice(0, 8)
    .map(
      (c) =>
        `• ${c.text?.trim() || c.type} (visual ${Math.round(c.visualWeight * 100)}%, ${c.type})`
    );
  if (candidateLines.length) {
    lines.push("**Selection candidates**", candidateLines.join("\n"), "");
  }

  const focus = section(
    "Resolved hint (top candidate)",
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
  if (typeof meta.evidenceConfidence === "number") {
    metaLines.push(`evidenceConfidence: ${meta.evidenceConfidence}`);
  } else if (typeof meta.focusConfidence === "number") {
    metaLines.push(`evidenceConfidence: ${meta.focusConfidence}`);
  }
  if (meta.focusExtractionMethod) {
    metaLines.push(`extractionMethod: ${meta.focusExtractionMethod}`);
  }
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
