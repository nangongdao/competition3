import { useCallback, useState } from "react";

import { isRecord } from "@/modules/assistant/lib/type-guards";
import type {
  ChatApiErrorResponse,
  ChatCompletionInput,
  ChatCompletionSuccessResponse,
} from "../../../../src/worker/routes/chat/types";

type SendChatCompletionInput = Pick<
  ChatCompletionInput,
  "message" | "imageDataUrl" | "responseBudget" | "instructions"
>;

type ChatCompletionState = {
  isSending: boolean;
  errorMessage?: string;
};

type UseChatCompletionResult = {
  chatState: ChatCompletionState;
  sendChatCompletion: (
    input: SendChatCompletionInput,
  ) => Promise<ChatCompletionSuccessResponse | null>;
};

function isChatCompletionSuccessResponse(
  value: unknown,
): value is ChatCompletionSuccessResponse {
  return (
    isRecord(value) &&
    value.success === true &&
    typeof value.answer === "string" &&
    typeof value.model === "string"
  );
}

function isChatApiErrorResponse(value: unknown): value is ChatApiErrorResponse {
  return (
    isRecord(value) &&
    value.success === false &&
    typeof value.error === "string" &&
    typeof value.code === "string"
  );
}

function getLocalizedApiErrorMessage(errorResponse: ChatApiErrorResponse): string {
  if (errorResponse.code === "missing_openai_api_key") {
    return "Worker ???? OPENAI_API_KEY????? Chat Completions?";
  }

  if (errorResponse.code === "missing_chat_model") {
    return "Worker ???? OPENAI_CHAT_MODEL??????????????????? ID?";
  }

  if (errorResponse.code === "invalid_chat_provider_config") {
    return "Chat Completions API ?????????? OPENAI_BASE_URL ? OPENAI_CHAT_COMPLETIONS_URL?";
  }

  if (errorResponse.code === "invalid_request") {
    return "Chat Completions ???????";
  }

  if (errorResponse.code === "chat_completion_failed") {
    return `Chat Completions ?????${errorResponse.error}`;
  }

  return errorResponse.error;
}

async function readChatError(response: Response): Promise<string> {
  try {
    const value = (await response.json()) as unknown;

    if (isChatApiErrorResponse(value)) {
      return getLocalizedApiErrorMessage(value);
    }
  } catch {
    return `Chat Completions ???????? ${response.status}?`;
  }

  return `Chat Completions ???????? ${response.status}?`;
}

export function useChatCompletion(): UseChatCompletionResult {
  const [chatState, setChatState] = useState<ChatCompletionState>({
    isSending: false,
  });

  const sendChatCompletion = useCallback(
    async (
      input: SendChatCompletionInput,
    ): Promise<ChatCompletionSuccessResponse | null> => {
      setChatState({ isSending: true });

      try {
        const requestBody: SendChatCompletionInput = {
          message: input.message,
          responseBudget: input.responseBudget,
        };

        if (input.imageDataUrl !== undefined) {
          requestBody.imageDataUrl = input.imageDataUrl;
        }

        if (input.instructions !== undefined) {
          requestBody.instructions = input.instructions;
        }

        const response = await fetch("/api/chat/completion", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(await readChatError(response));
        }

        const value = (await response.json()) as unknown;

        if (!isChatCompletionSuccessResponse(value)) {
          throw new Error("Chat Completions ??????????");
        }

        setChatState({ isSending: false });
        return value;
      } catch (error: unknown) {
        setChatState({
          isSending: false,
          errorMessage:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Chat Completions ?????",
        });

        return null;
      }
    },
    [],
  );

  return {
    chatState,
    sendChatCompletion,
  };
}