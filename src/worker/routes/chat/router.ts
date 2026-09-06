import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import { streamSSE } from "hono/streaming";

import {
  executeUpstreamRequest,
  UpstreamRequestError,
} from "../../lib/upstream/resilience";
import { readJsonResponseBounded } from "../../lib/upstream/response";
import { createChatStreamParser } from "../../lib/chat-stream";
import type { AppEnv } from "../../types";
import {
  chatCompletionInputSchema,
  type ChatApiErrorResponse,
  type ChatCompletionSuccessResponse,
  type ChatResponseBudget,
  type ChatUsage,
} from "./types";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CHAT_COMPLETIONS_PATH = "/chat/completions";
const DEFAULT_CHAT_TOKEN_LIMIT_PARAMETER = "max_tokens";
const DEFAULT_CHAT_VISION_INPUT = "enabled";
const CHAT_UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_CHAT_INSTRUCTIONS =
  "You are a concise Chinese visual dialogue assistant. Answer the user's latest message using the supplied camera frame only when an image is included.";
const BRIEF_RESPONSE_INSTRUCTION =
  "Keep each answer brief: use one or two short sentences unless the user explicitly asks for detail.";
const RESPONSE_BUDGET_OUTPUT_TOKENS: Record<ChatResponseBudget, number> = {
  brief: 300,
  standard: 800,
  detailed: 1600,
};

type ChatProviderConfig = {
  completionsUrl: string;
  model: string;
  tokenLimitParameter: ChatTokenLimitParameter;
  visionInput: ChatVisionInputMode;
};

type ChatTextContentPart = {
  type: "text";
  text: string;
};

type ChatImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

type ChatMessage = {
  role: "system" | "user";
  content: string | (ChatTextContentPart | ChatImageContentPart)[];
};

type ChatCompletionPayload = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  stream?: boolean;
};

type ChatTokenLimitParameter =
  | "max_tokens"
  | "max_completion_tokens"
  | "none";

type ChatVisionInputMode = "enabled" | "disabled";

export const chatRoutes = new Hono<AppEnv>();

chatRoutes.post("/completion", async (c) => {
  const apiKey = c.env.OPENAI_API_KEY;

  if (!apiKey) {
    return c.json(createErrorResponse(
      "OPENAI_API_KEY is not configured for this Worker.",
      "missing_openai_api_key",
    ), 503);
  }

  const providerConfig = resolveChatProviderConfig(c.env);

  if (providerConfig === "missing-model") {
    return c.json(createErrorResponse(
      "OPENAI_CHAT_MODEL is required for Chat Completions mode.",
      "missing_chat_model",
    ), 503);
  }

  if (providerConfig === null) {
    return c.json(createErrorResponse(
      "Chat Completions provider URL configuration is invalid.",
      "invalid_chat_provider_config",
    ), 503);
  }

  const rawBody = await readJsonBody(c);
  const parseResult = chatCompletionInputSchema.safeParse(rawBody);

  if (!parseResult.success) {
    return c.json(createErrorResponse(
      parseResult.error.issues[0]?.message ?? "Invalid request body.",
      "invalid_request",
    ), 400);
  }

  const input = parseResult.data;
  const wantsStream = input.stream === true;
  const payload = buildChatCompletionPayload({
    model: providerConfig.model,
    instructions: input.instructions,
    responseBudget: input.responseBudget,
    message: input.message,
    imageDataUrl:
      providerConfig.visionInput === "enabled" ? input.imageDataUrl : undefined,
    sceneContext: input.sceneContext,
    historyContext: input.historyContext,
    tokenLimitParameter: providerConfig.tokenLimitParameter,
    stream: wantsStream,
  });

  let upstreamResponse: Response;

  try {
    upstreamResponse = await executeUpstreamRequest({
      env: c.env,
      operation: "chat",
      url: providerConfig.completionsUrl,
      requestId: c.get("requestId"),
      requestSignal: c.req.raw.signal,
      policy: {
        timeoutMs: CHAT_UPSTREAM_TIMEOUT_MS,
        maxAttempts: 2,
      },
      buildRequestInit: (idempotencyKey): RequestInit => ({
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Request-Id": c.get("requestId"),
        },
        body: JSON.stringify(payload),
      }),
    });
  } catch (error: unknown) {
    return createUpstreamFailureResponse(c, error);
  }

  if (!upstreamResponse.ok) {
    return c.json(createErrorResponse(
      "Chat Completions provider rejected the request.",
      "chat_completion_failed",
    ), 502);
  }

  if (wantsStream) {
    return streamChatCompletion(c, upstreamResponse);
  }

  const upstreamBody = await readJsonResponseBounded(upstreamResponse);

  const answer = getChatAnswer(upstreamBody.value);

  if (answer === null) {
    return c.json(createErrorResponse(
      "Chat Completions provider response did not include choices[0].message.content text.",
      "invalid_chat_completion_response",
    ), 502);
  }

  const model = getResponseModel(upstreamBody.value) ?? providerConfig.model;
  const usage = getChatUsage(upstreamBody.value);

  // 非流式响应：若上游带 `usage` 字段则透传到前端，供权威计量替代估算。
  const response: ChatCompletionSuccessResponse = {
    success: true,
    answer,
    model,
    ...(usage === null ? {} : { usage }),
  };

  return c.json(response);
});

function createErrorResponse(error: string, code: string): ChatApiErrorResponse {
  return {
    success: false,
    error,
    code,
  };
}

async function streamChatCompletion(
  c: Context<AppEnv>,
  upstreamResponse: Response,
): Promise<Response> {
  if (upstreamResponse.body === null) {
    return c.json(createErrorResponse(
      "Chat Completions provider returned an empty stream.",
      "chat_stream_failed",
    ), 502);
  }

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  const parser = createChatStreamParser();
  let model: string | undefined;

  return streamSSE(c, async (stream) => {
    try {
      while (true) {
        const result = await reader.read();

        if (result.done) {
          break;
        }

        const events = parser.push(decoder.decode(result.value, { stream: true }));

        for (const event of events) {
          if (event.done) {
            break;
          }

          if (event.model !== undefined) {
            model = event.model;
          }

          if (event.delta.length > 0) {
            await stream.writeSSE({
              data: JSON.stringify({ success: true, delta: event.delta }),
            });
          }
        }
      }

      await stream.writeSSE({
        data: JSON.stringify({ success: true, done: true, ...(model === undefined ? {} : { model }) }),
      });
    } catch (error: unknown) {
      if (c.req.raw.signal.aborted) {
        await reader.cancel();
        return;
      }

      await reader.cancel();

      if (error instanceof Error && error.name === "TimeoutError") {
        throw error;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // reader 已关闭
      }
    }
  });
}

function resolveChatProviderConfig(
  env: AppEnv["Bindings"],
): ChatProviderConfig | "missing-model" | null {
  const model = env.OPENAI_CHAT_MODEL?.trim();

  if (model === undefined || model.length === 0) {
    return "missing-model";
  }

  const chatBaseUrl = normalizeUrl(
    env.OPENAI_CHAT_BASE_URL ?? env.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL,
  );

  if (chatBaseUrl === null) {
    return null;
  }

  const completionsUrl =
    normalizeUrl(env.OPENAI_CHAT_COMPLETIONS_URL) ??
    buildUrl(
      chatBaseUrl,
      env.OPENAI_CHAT_COMPLETIONS_PATH ?? DEFAULT_CHAT_COMPLETIONS_PATH,
    );

  if (completionsUrl === null) {
    return null;
  }

  return {
    completionsUrl,
    model,
    tokenLimitParameter: resolveChatTokenLimitParameter(
      env.OPENAI_CHAT_TOKEN_LIMIT_PARAMETER,
    ),
    visionInput: resolveChatVisionInput(env.OPENAI_CHAT_VISION_INPUT),
  };
}

function resolveChatTokenLimitParameter(
  value: string | undefined,
): ChatTokenLimitParameter {
  const normalizedValue = value?.trim().toLowerCase();

  if (normalizedValue === "max_completion_tokens") {
    return "max_completion_tokens";
  }

  if (normalizedValue === "none") {
    return "none";
  }

  return DEFAULT_CHAT_TOKEN_LIMIT_PARAMETER;
}

function resolveChatVisionInput(value: string | undefined): ChatVisionInputMode {
  return value?.trim().toLowerCase() === "disabled"
    ? "disabled"
    : DEFAULT_CHAT_VISION_INPUT;
}

function normalizeUrl(value: string | undefined): string | null {
  const trimmedValue = value?.trim();

  if (trimmedValue === undefined || trimmedValue.length === 0) {
    return null;
  }

  try {
    return new URL(trimmedValue).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function buildUrl(baseUrl: string, path: string): string | null {
  const trimmedPath = path.trim();

  if (trimmedPath.length === 0) {
    return null;
  }

  try {
    return new URL(trimmedPath.replace(/^\/+/, ""), `${baseUrl}/`).toString();
  } catch {
    return null;
  }
}

function buildChatInstructions(
  instructions: string | undefined,
  responseBudget: ChatResponseBudget,
): string {
  const baseInstructions = instructions ?? DEFAULT_CHAT_INSTRUCTIONS;

  if (responseBudget !== "brief") {
    return baseInstructions;
  }

  return `${baseInstructions}\n${BRIEF_RESPONSE_INSTRUCTION}`;
}

function buildChatCompletionPayload(input: {
  model: string;
  instructions: string | undefined;
  responseBudget: ChatResponseBudget;
  message: string;
  imageDataUrl: string | undefined;
  sceneContext: string | undefined;
  historyContext: string | undefined;
  tokenLimitParameter: ChatTokenLimitParameter;
  stream: boolean;
}): ChatCompletionPayload {
  const payload: ChatCompletionPayload = {
    model: input.model,
    messages: [
      {
        role: "system",
        content: buildChatInstructions(input.instructions, input.responseBudget),
      },
      {
        role: "user",
        content: buildUserContent(
          input.message,
          input.imageDataUrl,
          input.sceneContext,
          input.historyContext,
        ),
      },
    ],
  };
  const outputTokenLimit = RESPONSE_BUDGET_OUTPUT_TOKENS[input.responseBudget];

  if (input.tokenLimitParameter === "max_tokens") {
    payload.max_tokens = outputTokenLimit;
  }

  if (input.tokenLimitParameter === "max_completion_tokens") {
    payload.max_completion_tokens = outputTokenLimit;
  }

  if (input.stream) {
    payload.stream = true;
  }

  return payload;
}

function buildUserContent(
  message: string,
  imageDataUrl: string | undefined,
  sceneContext: string | undefined,
  historyContext: string | undefined,
): ChatMessage["content"] {
  // 场景记忆 + 文本历史摘要：历史上下文（帧摘要 + 更早对话摘要）注入为文本部分。
  const contexts: string[] = [];
  if (sceneContext !== undefined && sceneContext.length > 0) {
    contexts.push(sceneContext);
  }
  if (historyContext !== undefined && historyContext.length > 0) {
    contexts.push(historyContext);
  }
  const contextualizedMessage =
    contexts.length > 0
      ? `${message}\n\n${contexts.join("\n\n")}`
      : message;

  if (imageDataUrl === undefined) {
    return contextualizedMessage;
  }

  return [
    {
      type: "text",
      text: contextualizedMessage,
    },
    {
      type: "image_url",
      image_url: {
        url: imageDataUrl,
      },
    },
  ];
}

async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  const contentType = c.req.header("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    return await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body." });
  }
}

function createUpstreamFailureResponse(
  c: Context<AppEnv>,
  error: unknown,
): Response {
  if (!(error instanceof UpstreamRequestError)) {
    throw error;
  }

  if (error.retryAfterSeconds !== undefined) {
    c.header("Retry-After", String(error.retryAfterSeconds));
  }

  if (error.kind === "timeout") {
    return c.json(createErrorResponse(
      "Chat Completions provider timed out.",
      "chat_completion_timeout",
    ), 504);
  }

  if (error.kind === "rate-limited") {
    return c.json(createErrorResponse(
      "Chat Completions provider is temporarily rate limited.",
      "chat_completion_rate_limited",
    ), 503);
  }

  if (error.kind === "circuit-open") {
    return c.json(createErrorResponse(
      "Chat Completions provider is temporarily unavailable.",
      "chat_completion_circuit_open",
    ), 503);
  }

  if (error.kind === "cancelled") {
    return c.json(createErrorResponse(
      "Chat Completions request was cancelled.",
      "request_cancelled",
    ), 408);
  }

  return c.json(createErrorResponse(
    "Chat Completions provider is temporarily unavailable.",
    "chat_completion_unavailable",
  ), 502);
}

function getChatAnswer(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("choices" in value)) {
    return null;
  }

  if (!Array.isArray(value.choices)) {
    return null;
  }

  const firstChoice = value.choices[0];

  if (
    typeof firstChoice !== "object" ||
    firstChoice === null ||
    !("message" in firstChoice)
  ) {
    return null;
  }

  const message = firstChoice.message;

  if (
    typeof message !== "object" ||
    message === null ||
    !("content" in message)
  ) {
    return null;
  }

  return typeof message.content === "string" && message.content.trim().length > 0
    ? message.content
    : null;
}

function getResponseModel(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("model" in value)) {
    return null;
  }

  return typeof value.model === "string" && value.model.trim().length > 0
    ? value.model
    : null;
}

function readTokenCount(value: Record<string, unknown>, fieldName: string): number | null {
  const fieldValue = value[fieldName];

  if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 0) {
    return null;
  }

  return fieldValue;
}

/**
 * Extracts the `usage` object from a non-streaming Chat Completions response.
 * Returns `null` when the payload carries no usable usage (streaming responses
 * typically omit it). Individual missing counts fall back to the sum or 0 so
 * partial payloads still produce a usable usage object.
 */
function getChatUsage(value: unknown): ChatUsage | null {
  if (typeof value !== "object" || value === null || !("usage" in value)) {
    return null;
  }

  const usageValue = value.usage;

  if (typeof usageValue !== "object" || usageValue === null) {
    return null;
  }

  const usageRecord = usageValue as Record<string, unknown>;
  const promptTokens = readTokenCount(usageRecord, "prompt_tokens");
  const completionTokens = readTokenCount(usageRecord, "completion_tokens");
  const totalTokens = readTokenCount(usageRecord, "total_tokens");

  if (promptTokens === null && completionTokens === null && totalTokens === null) {
    return null;
  }

  const resolvedPrompt = promptTokens ?? 0;
  const resolvedCompletion = completionTokens ?? 0;
  const resolvedTotal =
    totalTokens ?? resolvedPrompt + resolvedCompletion;

  return {
    promptTokens: resolvedPrompt,
    completionTokens: resolvedCompletion,
    totalTokens: resolvedTotal,
  };
}
