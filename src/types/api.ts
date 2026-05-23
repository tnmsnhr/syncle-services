import { z } from "zod";

/** Opaque blobs from syncle-ui extraction — validated loosely for v1. */
export const pageContextSchema = z.record(z.unknown());
export const selectionSchema = z.record(z.unknown());

export const registerPageContextBodySchema = z.object({
  schemaVersion: z.string().min(1),
  extractorVersion: z.string().min(1),
  pageFingerprint: z.string().min(1),
  canonicalUrl: z.string().url(),
  pageContext: pageContextSchema,
  selection: selectionSchema,
});

export const registerSelectionContextBodySchema = z.object({
  schemaVersion: z.string().min(1),
  extractorVersion: z.string().min(1),
  pageContextId: z.string().regex(/^pc_[a-f0-9]+$/),
  pageFingerprint: z.string().min(1),
  selection: selectionSchema,
});

export const chatBodySchema = z.object({
  schemaVersion: z.string().min(1),
  extractorVersion: z.string().min(1),
  pageContextId: z.string().regex(/^pc_[a-f0-9]+$/),
  selectionContextId: z.string().regex(/^sel_[a-f0-9]+$/),
  message: z.string().min(1).max(32_000),
});

export type RegisterPageContextBody = z.infer<
  typeof registerPageContextBodySchema
>;
export type RegisterSelectionContextBody = z.infer<
  typeof registerSelectionContextBodySchema
>;
export type ChatBody = z.infer<typeof chatBodySchema>;

export interface RegisterPageContextResponse {
  pageContextId: string;
  selectionContextId: string;
}

export interface RegisterSelectionContextResponse {
  selectionContextId: string;
}

/** Stable chat response — same shape for every AI vendor. */
export interface ChatResponse {
  reply: string;
  pageContextId: string;
  selectionContextId: string;
  provider: string;
  model: string;
}
