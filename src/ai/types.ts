/** Vendor-neutral request passed to any ChatProvider implementation. */
export interface ChatCompletionRequest {
  systemPrompt: string;
  userMessage: string;
  /** Raw base64 JPEG/PNG (no data: URL prefix). */
  imageBase64?: string;
  imageMimeType?: "image/jpeg" | "image/png" | "image/webp";
}

export interface ChatCompletionResult {
  reply: string;
  /** Provider slug, e.g. openai, stub */
  provider: string;
  /** Model id used for this reply */
  model: string;
}

export interface ChatProvider {
  readonly id: string;
  isConfigured(): boolean;
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
}
