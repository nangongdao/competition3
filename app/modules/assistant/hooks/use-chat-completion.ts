import { useCallback, useState } from "react";

import { withClientAccessToken } from "@/modules/assistant/lib/api-client";
import { createSseParser } from "@/modules/assistant/lib/sse-parser";
import { isRecord } from "@/modules/assistant/lib/type-guards";
import type {
  ChatApiErrorResponse,
  ChatCompletionInput,
  ChatCompletionSuccessResponse,
} from "../../../../src/worker/routes/chat/types";

type SendChatCompletionInput = Pick<
  ChatCompletionInput,
  "message" | "imageDataUrl" | "responseBudget" | "instructions" | "sceneContext" | "historyContext"
>;

type SendChatCompletionOptions = {
  /** 流式输出：每次收到增量内容时调用。传入后走 SSE 流式路径。 */
  onDelta?: (delta: string) => void;
};

type ChatCompletionState = {
  isSending: boolean;
  errorMessage?: string;
};

type UseChatCompletionResult = {
  chatState: ChatCompletionState;
  sendChatCompletion: (
    input: SendChatCompletionInput,
    options?: SendChatCompletionOptions,
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

/**
 * Picks the optional `usage` object out of a non-streaming Chat response.
 * Returns `undefined` when absent or malformed so metering can fall back to
 * the front-end token estimate.
 */
function readChatUsage(value: Record<string, unknown>): ChatCompletionSuccessResponse["usage"] {
  const usage = value.usage;

  if (!isRecord(usage)) {
    return undefined;
  }

  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens = usage.total_tokens;

  if (
    typeof promptTokens !== "number" ||
    typeof completionTokens !== "number" ||
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
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

  if (errorResponse.code === "chat_completion_timeout") {
    return "Chat Completions 服务响应超时，请稍后重试。";
  }

  if (errorResponse.code === "chat_completion_rate_limited") {
    return "Chat Completions 服务当前请求过多，请稍后重试。";
  }

  if (errorResponse.code === "chat_stream_failed") {
    return "Chat Completions 服务返回的流式响应异常。";
  }

  if (
    errorResponse.code === "chat_completion_circuit_open" ||
    errorResponse.code === "chat_completion_unavailable"
  ) {
    return "Chat Completions 服务暂时不可用，请稍后重试。";
  }

  if (errorResponse.code === "request_cancelled") {
    return "Chat Completions 请求已取消。";
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

  // 非流式响应：透传上游权威 `usage`（若提供），供计量替代估算。
  const usage = readChatUsage(value as Record<string, unknown>);

  return usage === undefined ? value : { ...value, usage };
}

async function consumeChatStream(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<{ answer: string; model?: string }> {
  if (response.body === null) {
    throw new Error("Chat Completions 流式响应没有可读取的 body。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  let answer = "";
  let model: string | undefined;
  let finished = false;
  let sawDelta = false;
  let rawText = "";

  while (!finished) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    const decoded = decoder.decode(result.value, { stream: true });
    rawText += decoded;

    for (const event of parser.push(decoded)) {
      if (event.done) {
        finished = true;
        break;
      }

      const data = event.data;

      if (!isRecord(data) || data.success !== true) {
        continue;
      }

      if (typeof data.delta === "string" && data.delta.length > 0) {
        answer += data.delta;
        sawDelta = true;
        onDelta(data.delta);
      }

      if (typeof data.model === "string" && data.model.trim().length > 0) {
        model = data.model.trim();
      }
    }
  }

  // 兜底：若上游忽略 stream 标志而返回普通 JSON，尝试从缓存文本中提取完整答案。
  if (!sawDelta) {
    const fallback = readChatSuccessFallbackFromText(rawText);

    if (fallback !== null) {
      return fallback;
    }
  }

  return { answer, model };
}

/**
 * 当流式路径未产生任何增量时，尝试把缓存的上游文本作为普通 JSON 读取并提取答案。
 * 覆盖“上游忽略 stream:true 但返回完整 choices”的兼容场景。
 */
function readChatSuccessFallbackFromText(
  text: string,
): ChatCompletionSuccessResponse | null {
  if (text.trim().length === 0) {
    return null;
  }

  try {
    const value = JSON.parse(text) as unknown;

    if (!isChatCompletionSuccessResponse(value)) {
      return null;
    }

    const usage = readChatUsage(value as Record<string, unknown>);

    return usage === undefined ? value : { ...value, usage };
  } catch {
    return null;
  }
}

export function useChatCompletion(): UseChatCompletionResult {
  const [chatState, setChatState] = useState<ChatCompletionState>({
    isSending: false,
  });

  const sendChatCompletion = useCallback(
    async (
      input: SendChatCompletionInput,
      options?: SendChatCompletionOptions,
    ): Promise<ChatCompletionSuccessResponse | null> => {
      const wantsStream = options?.onDelta !== undefined;
      setChatState({ isSending: true });

      try {
        const requestBody: SendChatCompletionInput & { stream?: boolean } = {
          message: input.message,
          responseBudget: input.responseBudget,
        };

        if (input.imageDataUrl !== undefined) {
          requestBody.imageDataUrl = input.imageDataUrl;
        }

        if (input.instructions !== undefined) {
          requestBody.instructions = input.instructions;
        }

        if (input.sceneContext !== undefined) {
          requestBody.sceneContext = input.sceneContext;
        }

        if (input.historyContext !== undefined) {
          requestBody.historyContext = input.historyContext;
        }

        if (wantsStream) {
          requestBody.stream = true;
        }

        const response = await fetch(
          "/api/chat/completion",
          withClientAccessToken({
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }),
        );

        if (!response.ok) {
          throw new Error(await readChatError(response));
        }

        if (wantsStream) {
          const onDelta = options?.onDelta;

          if (onDelta === undefined) {
            throw new Error("Chat Completions 流式回调缺失。");
          }

          const { answer, model } = await consumeChatStream(response, onDelta);
          const successResponse: ChatCompletionSuccessResponse = {
            success: true,
            answer,
            model: model ?? "",
          };

          setChatState({ isSending: false });
          return successResponse;
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
