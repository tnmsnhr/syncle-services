import OpenAI from "openai";
import { config, isOpenAiConfigured } from "../../lib/config.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ChatProvider,
} from "../types.js";

export class OpenAiChatProvider implements ChatProvider {
  readonly id = "openai";
  private client: OpenAI | null = null;

  isConfigured(): boolean {
    return isOpenAiConfigured();
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: config.openaiApiKey });
    }
    return this.client;
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    if (!this.isConfigured()) {
      throw new Error("OpenAI is not configured");
    }

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: request.userMessage },
    ];

    if (request.imageBase64) {
      const mime = request.imageMimeType ?? "image/jpeg";
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${mime};base64,${request.imageBase64}`,
          detail: "low",
        },
      });
    }

    const response = await this.getClient().chat.completions.create({
      model: config.openaiChatModel,
      max_tokens: config.openaiMaxTokens,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const reply = response.choices[0]?.message?.content?.trim();
    if (!reply) {
      throw new Error("OpenAI returned an empty response");
    }

    return {
      provider: this.id,
      model: response.model ?? config.openaiChatModel,
      reply,
    };
  }
}
