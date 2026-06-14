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
    return "Worker 尚未配置 OPENAI_API_KEY，无法调用 Chat Completions。";
  }

  if (errorResponse.code === "missing_chat_model") {
    return "Worker 尚未配置 OPENAI_CHAT_MODEL，请设置可用的视觉聊天模型 ID。";
  }

  if (errorResponse.code === "invalid_chat_provider_config") {
    return "Chat Completions API 地址配置无效，请检查 OPENAI_BASE_URL 或 OPENAI_CHAT_COMPLETIONS_URL。";
  }

  if (errorResponse.code === "invalid_request") {
    return "Chat Completions 请求内容无效。";
  }

  if (errorResponse.code === "chat_completion_failed") {
    return `Chat Completions 调用失败：${errorResponse.error}`;
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
    return `Chat Completions 请求失败，状态码 ${response.status}。`;
  }

  return `Chat Completions 请求失败，状态码 ${response.status}。`;
}

async function readChatSuccess(
  response: Response,
): Promise<ChatCompletionSuccessResponse> {
  let value: unknown;

  try {
    value = (await response.json()) as unknown;
  } catch {
    throw new Error(
      "Chat Completions 返回格式不符合预期，请确认当前访问的是 Worker 地址。",
    );
  }

  if (!isChatCompletionSuccessResponse(value)) {
    throw new Error("Chat Completions 返回格式不符合预期。");
  }

  return value;
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

        const value = await readChatSuccess(response);

        setChatState({ isSending: false });
        return value;
      } catch (error: unknown) {
        setChatState({
          isSending: false,
          errorMessage:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Chat Completions 请求失败。",
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
