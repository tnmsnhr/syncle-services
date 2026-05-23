import type {
  PageContextRecord,
  SelectionContextRecord,
} from "../services/contextStore.js";
import {
  classifySelectionShape,
  defaultUserMessageForShape,
  formatContextLensBlock,
  isAutoExplainMessage,
  normalizeSelectionShape,
  parseContextLens,
  type ContextLens,
  type SelectionShape,
} from "./selectionShape.js";

const BASE_INSTRUCTION = `You are answering about a user-selected region from a webpage.
The selected region is the main subject.
The surrounding/page context is only the domain lens.
Explain the selected region in the meaning that best fits the context.
Do not summarize unrelated surrounding content.
Do not invent facts not supported by the selection or context.
Be concise unless the user asks for more detail.`;

const HARD_RULES_SHORT = `Hard output rules:
- Never start with "The selected text discusses...", "This paragraph discusses...", or "The passage explains...".
- Always answer about the selected thing first.
- Context is supporting evidence, not the main subject.
- If meaning is ambiguous, give the most likely meaning in this context; mention ambiguity briefly only if needed.`;

const FRAGMENT_AND_CROP_RULE = `If the selected text appears partial, truncated, mid-word, or inconsistent with the attached crop, the crop is the source of truth. Prioritize the crop and infer the actual selected item from the crop and context. Do not explain the broken fragment literally.`;

const SHAPE_INSTRUCTIONS: Record<SelectionShape, string> = {
  short_inline_selection: `The user selected a short inline item from a webpage.
Explain the selected item directly.
Use local/page context as the domain lens.
If the item has multiple possible meanings, choose the meaning that best fits the context.
If it appears to be a formula, notation, acronym, shorthand, typo, symbol, technical term, API/function name, or compact expression, infer the likely meaning from context.
Start the answer with the selected item itself.
Do not summarize the surrounding paragraph.

${HARD_RULES_SHORT}`,

  visual_selection: `The user selected a visual region. The crop/image is the primary subject.
First identify what is visible in the selected crop.
Then explain it using the local/page context as the domain lens.
If the crop contains a formula, notation, symbol, acronym, diagram element, chart fragment, label, object, or UI element, infer its likely meaning from the crop and context.
Do not describe unrelated parts of the full page or full image.

${FRAGMENT_AND_CROP_RULE}`,

  mixed_selection: `The user selected both text and visual content.
Use the selected text and crop together as the primary subject.
If extracted text looks partial or broken, treat the crop as the source of truth.
Use local/page context only to clarify the domain and meaning.

${FRAGMENT_AND_CROP_RULE}`,

  code_like_selection: `The user selected code or code-like text.
Explain what the selected code does and why it matters in the nearby context.
Do not summarize unrelated surrounding text.`,

  long_text_selection: `The user selected a larger text block.
Summarize or explain the selected text itself.
Use nearby context only to disambiguate.`,

  structured_data_selection: `The user selected structured data such as a table row/cell/list/card.
Explain the selected value/row/card.
Use headers, labels, captions, and nearby context to interpret the data.`,
};

export interface ParsedSelection {
  focusText: string;
  elementTypes: string[];
  hasVisual: boolean;
  selectionShape: SelectionShape;
  contextLens?: ContextLens;
  localContextBlock: string;
  imageBase64?: string;
  focusUncertain?: boolean;
  focusExtractionMethod?: string;
  focusConfidence?: number;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function formatPageContextBlock(page: PageContextRecord): string {
  const ctx = page.pageContext;
  if (typeof ctx.contextBlock === "string" && ctx.contextBlock.trim()) {
    return ctx.contextBlock.trim();
  }
  const pageMeta = ctx.page;
  if (pageMeta && typeof pageMeta === "object") {
    const title = pickString(pageMeta as Record<string, unknown>, "title");
    const url = pickString(pageMeta as Record<string, unknown>, "canonicalUrl");
    const domain = pickString(pageMeta as Record<string, unknown>, "domain");
    return [title && `Title: ${title}`, url && `URL: ${url}`, domain && `Domain: ${domain}`]
      .filter(Boolean)
      .join("\n");
  }
  return `URL: ${page.canonicalUrl}`;
}

function resolveSelectionShape(
  sel: Record<string, unknown>,
  focusText: string,
  elementTypes: string[],
  hasVisual: boolean
): SelectionShape {
  const topLevel = normalizeSelectionShape(sel.selectionShape);
  if (topLevel) return topLevel;

  const meta =
    sel.meta && typeof sel.meta === "object"
      ? (sel.meta as Record<string, unknown>)
      : {};
  const fromMeta =
    normalizeSelectionShape(meta.selectionShape) ??
    normalizeSelectionShape(meta.selectionIntent);
  if (fromMeta) return fromMeta;

  return classifySelectionShape({
    text: focusText,
    elementTypes,
    hasVisual,
  });
}

export function parseSelectionRecord(
  selection: SelectionContextRecord
): ParsedSelection {
  const sel = selection.selection;
  const userSelection = sel.userSelection;
  let focusText = "";
  let elementTypes: string[] = [];

  if (userSelection && typeof userSelection === "object") {
    const us = userSelection as Record<string, unknown>;
    focusText = pickString(us, "text");
    if (Array.isArray(us.elementTypes)) {
      elementTypes = us.elementTypes.filter((t): t is string => typeof t === "string");
    }
  }

  const meta =
    sel.meta && typeof sel.meta === "object"
      ? (sel.meta as Record<string, unknown>)
      : {};
  const hasVisual =
    meta.hasImage === true || typeof sel.cropImageBase64 === "string";

  const selectionShape = resolveSelectionShape(
    sel as Record<string, unknown>,
    focusText,
    elementTypes,
    hasVisual
  );

  const contextLens =
    parseContextLens(sel.contextLens) ??
    parseContextLens(meta.contextLens);

  const crop =
    typeof sel.cropImageBase64 === "string" ? sel.cropImageBase64 : undefined;

  const focusUncertain = meta.focusUncertain === true;
  const focusExtractionMethod =
    typeof meta.focusExtractionMethod === "string"
      ? meta.focusExtractionMethod
      : undefined;
  const focusConfidence =
    typeof meta.focusConfidence === "number" ? meta.focusConfidence : undefined;

  return {
    focusText,
    elementTypes,
    hasVisual,
    selectionShape,
    contextLens,
    localContextBlock: pickString(sel, "localContextBlock"),
    imageBase64: crop?.replace(/^data:image\/\w+;base64,/, ""),
    focusUncertain,
    focusExtractionMethod,
    focusConfidence,
  };
}

export function buildAnswerPrompt(
  parsed: ParsedSelection,
  pageBlock: string
): string {
  const shapeBlock = SHAPE_INSTRUCTIONS[parsed.selectionShape];

  const selectedLine = parsed.focusText.trim()
    ? parsed.focusText.trim()
    : parsed.hasVisual
      ? "(visual selection — see attached image)"
      : "(empty selection)";

  const sections = [
    BASE_INSTRUCTION,
    "",
    shapeBlock,
    "",
    "Selected content:",
    selectedLine,
    "",
    "Selection shape:",
    parsed.selectionShape,
  ];

  const lensBlock = formatContextLensBlock(parsed.contextLens);
  if (lensBlock) {
    sections.push(
      "",
      "Context lens (domain background — not the main subject):",
      lensBlock
    );
  }

  if (parsed.localContextBlock) {
    sections.push(
      "",
      "Local context (background only):",
      parsed.localContextBlock
    );
  }

  if (pageBlock.trim()) {
    sections.push(
      "",
      "Page context (background only):",
      pageBlock.trim()
    );
  }

  if (
    parsed.focusUncertain ||
    (typeof parsed.focusConfidence === "number" && parsed.focusConfidence < 0.75) ||
    (parsed.hasVisual &&
      parsed.focusText.trim().length > 0 &&
      parsed.focusText.trim().length < 48)
  ) {
    sections.push("", FRAGMENT_AND_CROP_RULE);
  }

  if (
    typeof parsed.focusConfidence === "number" &&
    parsed.focusConfidence < 0.45 &&
    parsed.hasVisual
  ) {
    sections.push(
      "",
      "Extraction confidence is low. Do not treat the extracted text line as authoritative. Infer the selected subject from the attached crop and local/page context."
    );
  } else if (
    typeof parsed.focusConfidence === "number" &&
    parsed.focusConfidence >= 0.45 &&
    parsed.focusConfidence < 0.75 &&
    parsed.hasVisual
  ) {
    sections.push(
      "",
      "Extraction confidence is medium. Use the extracted text as a hint, but verify against the crop and context before answering."
    );
  }

  return sections.join("\n");
}

export function resolveUserMessage(
  userMessage: string,
  parsed: ParsedSelection
): string {
  if (isAutoExplainMessage(userMessage)) {
    return defaultUserMessageForShape(parsed.selectionShape, parsed.focusText);
  }
  return userMessage;
}

export function buildChatCompletionRequest(
  userMessage: string,
  page: PageContextRecord,
  selection: SelectionContextRecord
): import("./types.js").ChatCompletionRequest {
  const parsed = parseSelectionRecord(selection);
  const pageBlock = formatPageContextBlock(page);
  const systemPrompt = buildAnswerPrompt(parsed, pageBlock);
  const resolvedMessage = resolveUserMessage(userMessage, parsed);

  return {
    systemPrompt,
    userMessage: resolvedMessage,
    imageBase64: parsed.imageBase64,
    imageMimeType: parsed.imageBase64 ? "image/jpeg" : undefined,
  };
}
