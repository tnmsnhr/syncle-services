import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ChatProvider,
} from "../types.js";

export class StubChatProvider implements ChatProvider {
  readonly id = "stub";

  isConfigured(): boolean {
    return true;
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const hasImage = Boolean(request.imageBase64);
    return {
      provider: this.id,
      model: "stub",
      reply: [
        "[Syncle stub] AI provider not configured.",
        `Your question: ${request.userMessage.slice(0, 500)}`,
        hasImage ? "A selection image was included." : "Text-only selection.",
        "Set OPENAI_API_KEY and AI_PROVIDER=openai in syncle-services/.env",
      ].join("\n\n"),
    };
  }
}
