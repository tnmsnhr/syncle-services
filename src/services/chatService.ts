import { buildChatCompletionRequest } from "../ai/buildAnswerPrompt.js";
import { getChatProvider } from "../ai/factory.js";
import { ECHO_EXTRACTION_ONLY } from "../lib/aiMode.js";
import type { ChatBody } from "../types/api.js";
import type {
  PageContextRecord,
  SelectionContextRecord,
} from "./contextStore.js";
import { formatExtractedReply } from "./formatExtractedReply.js";

export interface ChatResponse {
  reply: string;
  pageContextId: string;
  selectionContextId: string;
  provider: string;
  model: string;
}

export async function runChat(
  body: ChatBody,
  page: PageContextRecord,
  selection: SelectionContextRecord
): Promise<ChatResponse> {
  if (ECHO_EXTRACTION_ONLY) {
    return {
      reply: formatExtractedReply(page, selection, body.message),
      pageContextId: body.pageContextId,
      selectionContextId: body.selectionContextId,
      provider: "echo",
      model: "extraction-only",
    };
  }

  const provider = getChatProvider();
  const completionRequest = buildChatCompletionRequest(
    body.message,
    page,
    selection
  );
  const result = await provider.complete(completionRequest);

  return {
    reply: result.reply,
    pageContextId: body.pageContextId,
    selectionContextId: body.selectionContextId,
    provider: result.provider,
    model: result.model,
  };
}
