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

const CANDIDATE_RESOLUTION_INSTRUCTION = `The browser extracted multiple candidates from the user's selected region. Candidates are ranked by visual proximity and styling (visualWeight), not semantic importance. Your job is to infer which candidate or fragment the user most likely intended, using the candidates, crop (if any), and local/page context. Explain that intended target. Do not explain weak candidates like pronouns unless they are clearly the intended subject. Use local/page context only as the domain lens.`;

const BASE_INSTRUCTION = `You are answering about a user-selected region from a webpage.
The user's intended target (resolved from candidates) is the main subject.
Surrounding/page context is only the domain lens.
Do not summarize unrelated surrounding content.
Do not invent facts not supported by the selection or context.
Be concise unless the user asks for more detail.`;

const HARD_RULES_SHORT = `Hard output rules:
- Never start with "The selected text discusses...", "This paragraph discusses...", or "The passage explains...".
- Always answer about the intended selected item first.
- Context is supporting evidence, not the main subject.
- If meaning is ambiguous, say "This likely refers to…" and explain the most plausible target.`;

const FRAGMENT_AND_CROP_RULE = `If extracted candidates appear partial, truncated, mid-word, or inconsistent with the attached crop, the crop is the source of truth. Prioritize the crop and infer the actual selected item from the crop and context. Do not explain weak extracted text literally unless clearly intended.`;

const SHAPE_INSTRUCTIONS: Record<SelectionShape, string> = {
  short_inline_selection: `The user selected a short inline item.
Infer the likely intended candidate from the candidate list (highest visualWeight is a hint only).
Explain that candidate directly.
Do not summarize the surrounding paragraph.

${HARD_RULES_SHORT}`,

  multi_line_text_selection: `The user selected text across multiple lines.
Explain the selected fragments/passages.
Use candidate visualWeight to prioritize which line fragments matter most.
Do not collapse unrelated lines into one summary unless they form one intentional selection.

${HARD_RULES_SHORT}`,

  visual_selection: `The user selected a visual region. The crop/image is the primary subject.
Candidates and local context are supporting evidence only.
First identify what is visible in the selected crop, then explain it.

${FRAGMENT_AND_CROP_RULE}`,

  mixed_selection: `The user selected both text and visual content.
Use the crop and candidates together as primary evidence.
If text candidates look partial or broken, treat the crop as source of truth.

${FRAGMENT_AND_CROP_RULE}`,

  code_like_selection: `The user selected code or code-like text.
Explain what the selected code does and why it matters in the nearby context.`,

  long_text_selection: `The user selected a larger text block.
Summarize or explain the selected text itself.
Use nearby context only to disambiguate.`,

  structured_data_selection: `The user selected structured data such as a table row/cell/list/card.
Explain the selected value/row/card.
Use headers, labels, captions, and nearby context to interpret the data.`,
};

export interface SelectionCandidateParsed {
  id: string;
  type: string;
  text?: string;
  visualWeight: number;
  confidence: number;
  signals: string[];
  metadata?: Record<string, unknown>;
}

export interface SelectionEvidenceParsed {
  candidates: SelectionCandidateParsed[];
  localContextBlock?: string;
  extractedText?: string;
  hasVisual: boolean;
  evidenceConfidence: number;
}

export interface ParsedSelection {
  selectionEvidence: SelectionEvidenceParsed;
  focusText: string;
  elementTypes: string[];
  hasVisual: boolean;
  selectionShape: SelectionShape;
  contextLens?: ContextLens;
  localContextBlock: string;
  imageBase64?: string;
  evidenceConfidence: number;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function parseCandidates(raw: unknown): SelectionCandidateParsed[] {
  if (!Array.isArray(raw)) return [];
  const out: SelectionCandidateParsed[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : `cand_${out.length}`;
    const type = typeof o.type === "string" ? o.type : "text-token";
    const visualWeight =
      typeof o.visualWeight === "number" ? o.visualWeight : 0;
    const confidence = typeof o.confidence === "number" ? o.confidence : 0.5;
    const signals = Array.isArray(o.signals)
      ? o.signals.filter((s): s is string => typeof s === "string")
      : [];
    const text = typeof o.text === "string" ? o.text : undefined;
    const metadata =
      o.metadata && typeof o.metadata === "object"
        ? (o.metadata as Record<string, unknown>)
        : undefined;
    out.push({ id, type, text, visualWeight, confidence, signals, metadata });
  }
  return out.sort((a, b) => b.visualWeight - a.visualWeight);
}

function parseSelectionEvidence(sel: Record<string, unknown>): SelectionEvidenceParsed | null {
  const raw = sel.selectionEvidence;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const candidates = parseCandidates(o.candidates);
  const evidenceConfidence =
    typeof o.evidenceConfidence === "number" ? o.evidenceConfidence : 0.5;
  const hasVisual = o.hasVisual === true;
  const localContextBlock = pickString(o, "localContextBlock");
  const extractedText = pickString(o, "extractedText");
  return {
    candidates,
    localContextBlock: localContextBlock || undefined,
    extractedText: extractedText || undefined,
    hasVisual,
    evidenceConfidence,
  };
}

function legacyEvidenceFromUserSelection(
  sel: Record<string, unknown>
): SelectionEvidenceParsed | null {
  const userSelection = sel.userSelection;
  if (!userSelection || typeof userSelection !== "object") return null;
  const us = userSelection as Record<string, unknown>;
  const text = pickString(us, "text");
  if (!text) return null;
  return {
    candidates: [
      {
        id: "legacy",
        type: "text-token",
        text,
        visualWeight: 1,
        confidence: 0.5,
        signals: ["legacy-payload"],
      },
    ],
    extractedText: text,
    hasVisual: typeof sel.cropImageBase64 === "string",
    evidenceConfidence: 0.5,
  };
}

function formatCandidatesBlock(candidates: SelectionCandidateParsed[]): string {
  if (!candidates.length) return "(no candidates extracted)";
  return candidates
    .map((c, i) => {
      const parts = [
        `${i + 1}. type=${c.type}`,
        `visualWeight=${c.visualWeight.toFixed(2)}`,
        `confidence=${c.confidence.toFixed(2)}`,
      ];
      if (c.signals.length) parts.push(`signals=[${c.signals.join(", ")}]`);
      if (c.text?.trim()) parts.push(`text="${c.text.trim().slice(0, 200)}"`);
      if (c.metadata?.isPartialMedia === true) parts.push("partial-media=true");
      return parts.join(" ");
    })
    .join("\n");
}

function resolveIntendedHint(evidence: SelectionEvidenceParsed): string {
  const top = evidence.candidates[0];
  if (top?.text?.trim()) return top.text.trim();
  return evidence.extractedText?.trim() ?? "";
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
  const sel = selection.selection as Record<string, unknown>;
  const meta =
    sel.meta && typeof sel.meta === "object"
      ? (sel.meta as Record<string, unknown>)
      : {};

  let selectionEvidence =
    parseSelectionEvidence(sel) ?? legacyEvidenceFromUserSelection(sel);

  if (!selectionEvidence) {
    selectionEvidence = {
      candidates: [],
      hasVisual: meta.hasImage === true,
      evidenceConfidence: 0.1,
    };
  }

  let elementTypes: string[] = [];
  if (Array.isArray(meta.elementTypes)) {
    elementTypes = meta.elementTypes.filter((t): t is string => typeof t === "string");
  } else {
    const userSelection = sel.userSelection;
    if (userSelection && typeof userSelection === "object") {
      const us = userSelection as Record<string, unknown>;
      if (Array.isArray(us.elementTypes)) {
        elementTypes = us.elementTypes.filter((t): t is string => typeof t === "string");
      }
    }
  }

  const focusText = resolveIntendedHint(selectionEvidence);
  const hasVisual =
    selectionEvidence.hasVisual ||
    meta.hasImage === true ||
    typeof sel.cropImageBase64 === "string" ||
    typeof (sel.selectionEvidence as Record<string, unknown> | undefined)
      ?.cropImageBase64 === "string";

  const selectionShape = resolveSelectionShape(
    sel,
    focusText,
    elementTypes,
    hasVisual
  );

  const contextLens =
    parseContextLens(sel.contextLens) ?? parseContextLens(meta.contextLens);

  const crop =
    typeof sel.cropImageBase64 === "string"
      ? sel.cropImageBase64
      : typeof (sel.selectionEvidence as Record<string, unknown> | undefined)
            ?.cropImageBase64 === "string"
        ? String(
            (sel.selectionEvidence as Record<string, unknown>).cropImageBase64
          )
        : undefined;

  const evidenceConfidence =
    typeof meta.evidenceConfidence === "number"
      ? meta.evidenceConfidence
      : selectionEvidence.evidenceConfidence;

  const localContextBlock =
    selectionEvidence.localContextBlock ?? pickString(sel, "localContextBlock");

  return {
    selectionEvidence,
    focusText,
    elementTypes,
    hasVisual,
    selectionShape,
    contextLens,
    localContextBlock,
    imageBase64: crop?.replace(/^data:image\/\w+;base64,/, ""),
    evidenceConfidence,
  };
}

export function buildAnswerPrompt(
  parsed: ParsedSelection,
  pageBlock: string
): string {
  const shapeBlock = SHAPE_INSTRUCTIONS[parsed.selectionShape];
  const candidatesBlock = formatCandidatesBlock(parsed.selectionEvidence.candidates);

  const sections = [
    BASE_INSTRUCTION,
    "",
    CANDIDATE_RESOLUTION_INSTRUCTION,
    "",
    shapeBlock,
    "",
    "Selection shape:",
    parsed.selectionShape,
    "",
    "Evidence confidence (mechanical extraction quality, not semantic):",
    String(parsed.evidenceConfidence.toFixed(2)),
    "",
    "Selection candidates (visualWeight = visual proximity, not importance):",
    candidatesBlock,
  ];

  const lensBlock = formatContextLensBlock(parsed.contextLens);
  if (lensBlock) {
    sections.push(
      "",
      "Context lens (domain background — not the main subject):",
      lensBlock
    );
  }

  const local =
    parsed.localContextBlock || parsed.selectionEvidence.localContextBlock;
  if (local) {
    sections.push("", "Local context (background only):", local);
  }

  if (pageBlock.trim()) {
    sections.push("", "Page context (background only):", pageBlock.trim());
  }

  if (parsed.evidenceConfidence < 0.45 && parsed.hasVisual) {
    sections.push(
      "",
      "Evidence confidence is low. Do not treat any single candidate text as authoritative. Infer the selected subject from the attached crop and local/page context."
    );
  } else if (parsed.evidenceConfidence < 0.65 && parsed.hasVisual) {
    sections.push(
      "",
      "Evidence confidence is medium. Use candidates as hints; verify against the crop and context before answering."
    );
  }

  if (
    parsed.hasVisual &&
    (parsed.selectionShape === "visual_selection" ||
      parsed.selectionShape === "mixed_selection")
  ) {
    sections.push("", FRAGMENT_AND_CROP_RULE);
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
