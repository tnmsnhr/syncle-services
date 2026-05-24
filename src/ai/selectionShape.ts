/** Keep in sync with syncle-ui/src/extraction/selectionShape.ts */

export type SelectionShape =
  | "short_inline_selection"
  | "multi_line_text_selection"
  | "long_text_selection"
  | "code_like_selection"
  | "visual_selection"
  | "structured_data_selection"
  | "mixed_selection";

export interface ContextLens {
  pageTitle?: string;
  pageType?: string;
  domain?: string;
  nearestHeading?: string;
  topicHint?: string;
}

export interface ClassifySelectionShapeInput {
  text: string;
  elementTypes: string[];
  hasVisual: boolean;
  hasTableContext?: boolean;
  isMultiLine?: boolean;
}

const LONG_TEXT_CHAR_MIN = 250;
const LONG_TEXT_SENTENCE_MIN = 2;
const LONG_TEXT_SENTENCE_CHAR_MIN = 120;
const MEANINGFUL_TEXT_MIN = 12;

const TABLE_TYPES = new Set([
  "table",
  "td",
  "th",
  "tr",
  "thead",
  "tbody",
  "tfoot",
  "caption",
]);

const AUTO_EXPLAIN_MARKERS: Array<string | RegExp> = [
  "__syncle_explain_selection__",
  /^Summarize what the user selected/i,
  /^Explain the selected content/i,
];

const VALID_SHAPES = new Set<SelectionShape>([
  "short_inline_selection",
  "multi_line_text_selection",
  "long_text_selection",
  "code_like_selection",
  "visual_selection",
  "structured_data_selection",
  "mixed_selection",
]);

const LEGACY_TO_SHAPE: Record<string, SelectionShape> = {
  short_inline_selection: "short_inline_selection",
  multi_line_text_selection: "multi_line_text_selection",
  long_text_selection: "long_text_selection",
  code_like_selection: "code_like_selection",
  visual_selection: "visual_selection",
  structured_data_selection: "structured_data_selection",
  mixed_selection: "mixed_selection",
  focus_explanation: "short_inline_selection",
  passage_summary: "long_text_selection",
  paragraph_summary: "long_text_selection",
  visual_explanation: "visual_selection",
  table_explanation: "structured_data_selection",
  term_explanation: "short_inline_selection",
  formula_explanation: "short_inline_selection",
  code_explanation: "code_like_selection",
  error_explanation: "short_inline_selection",
  unknown: "short_inline_selection",
};

export function normalizeSelectionShape(value: unknown): SelectionShape | undefined {
  if (typeof value !== "string") return undefined;
  const mapped = LEGACY_TO_SHAPE[value];
  return mapped ?? (VALID_SHAPES.has(value as SelectionShape) ? (value as SelectionShape) : undefined);
}

export function isAutoExplainMessage(message: string): boolean {
  const m = message.trim();
  return AUTO_EXPLAIN_MARKERS.some((marker) =>
    typeof marker === "string" ? m === marker : marker.test(m)
  );
}

export function defaultUserMessageForShape(
  shape: SelectionShape,
  focusText: string
): string {
  const quoted = focusText.trim()
    ? `"${focusText.trim().slice(0, 120)}"`
    : "the selection";

  switch (shape) {
    case "multi_line_text_selection":
      return "Explain the selected passages across the highlighted lines.";
    case "long_text_selection":
      return "Summarize or explain the selected text clearly.";
    case "visual_selection":
      return "Describe and explain what is shown in the selected visual region.";
    case "mixed_selection":
      return `Explain the selected text and visual together: ${quoted}`;
    case "code_like_selection":
      return `Explain what this selected code does and why it matters here: ${quoted}`;
    case "structured_data_selection":
      return `Explain the selected structured data value: ${quoted}`;
    case "short_inline_selection":
    default:
      return `Explain ${quoted} directly. Start with the selected item. Use context only as a domain lens.`;
  }
}

export function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

export function hasTableLikeElement(elementTypes: string[]): boolean {
  return elementTypes.some((t) => TABLE_TYPES.has(t.toLowerCase()));
}

export function looksCodeLike(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (
    /\b(function|const|let|var|class|return|import|export|async|await)\b/.test(t)
  ) {
    return true;
  }
  if (/=>/.test(t) && /[({;]/.test(t)) return true;
  if (/^[\s]*at\s+[\w./<>]+/m.test(t)) return true;
  if (/<\/?[A-Za-z][\w-]*(\s|>|\/)/.test(t) && /[<>]/.test(t)) return true;
  if (/[{}`;]/.test(t) && /\b(if|else|for|while|switch)\b/.test(t)) return true;
  if (t.includes("{") && t.includes("}") && t.length >= 12) return true;
  return false;
}

function hasMeaningfulText(text: string): boolean {
  return text.trim().length >= MEANINGFUL_TEXT_MIN;
}

function isLongTextSelection(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.length >= LONG_TEXT_CHAR_MIN) return true;
  return (
    countSentences(t) >= LONG_TEXT_SENTENCE_MIN &&
    t.length >= LONG_TEXT_SENTENCE_CHAR_MIN
  );
}

export function classifySelectionShape(
  input: ClassifySelectionShapeInput
): SelectionShape {
  const text = input.text.trim();
  const { hasVisual, elementTypes } = input;
  const table =
    input.hasTableContext ?? hasTableLikeElement(elementTypes);

  if (hasVisual && hasMeaningfulText(text)) return "mixed_selection";
  if (hasVisual && !hasMeaningfulText(text)) return "visual_selection";
  if (table) return "structured_data_selection";
  if (text && looksCodeLike(text)) return "code_like_selection";
  if (text && isLongTextSelection(text)) return "long_text_selection";
  if (input.isMultiLine && hasMeaningfulText(text)) {
    return "multi_line_text_selection";
  }
  return "short_inline_selection";
}

export function parseContextLens(value: unknown): ContextLens | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  const lens: ContextLens = {};
  for (const key of [
    "pageTitle",
    "pageType",
    "domain",
    "nearestHeading",
    "topicHint",
  ] as const) {
    if (typeof o[key] === "string" && o[key].trim()) {
      lens[key] = o[key].trim();
    }
  }
  return Object.keys(lens).length > 0 ? lens : undefined;
}

export function formatContextLensBlock(lens: ContextLens | undefined): string {
  if (!lens) return "";
  const lines: string[] = [];
  if (lens.pageTitle) lines.push(`Page title: ${lens.pageTitle}`);
  if (lens.domain) lines.push(`Domain: ${lens.domain}`);
  if (lens.pageType) lines.push(`Page type: ${lens.pageType}`);
  if (lens.nearestHeading) lines.push(`Nearest heading: ${lens.nearestHeading}`);
  if (lens.topicHint) lines.push(`Topic hint: ${lens.topicHint}`);
  return lines.join("\n");
}
