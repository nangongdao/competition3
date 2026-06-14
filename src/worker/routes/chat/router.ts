import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../../types";
import {
  chatCompletionInputSchema,
  type ChatApiErrorResponse,
  type ChatCompletionSuccessResponse,
  type ChatResponseBudget,
} from "./types";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_CHAT_COMPLETIONS_PATH = "/chat/completions";
const DEFAULT_CHAT_TOKEN_LIMIT_PARAMETER = "max_tokens";
const DEFAULT_CHAT_VISION_INPUT = "enabled";
const MAX_UPSTREAM_ERROR_SNIPPET_CHARS = 600;
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
};

type ChatTokenLimitParameter =
  | "max_tokens"
  | "max_completion_tokens"
  | "none";

type ChatVisionInputMode = "enabled" | "disabled";

type UpstreamResponseBody = {
  value: unknown;
  textSnippet: string | null;
};

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
  const payload = buildChatCompletionPayload({
    model: providerConfig.model,
    instructions: input.instructions,
    responseBudget: input.responseBudget,
    message: input.message,
    imageDataUrl:
      providerConfig.visionInput === "enabled" ? input.imageDataUrl : undefined,
    tokenLimitParameter: providerConfig.tokenLimitParameter,
  });

  const upstreamResponse = await fetch(providerConfig.completionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const upstreamBody = await readUpstreamBody(upstreamResponse);

  if (!upstreamResponse.ok) {
    return c.json(createErrorResponse(
      getUpstreamErrorMessage(upstreamBody) ??
        `Chat Completions provider request failed with status ${upstreamResponse.status}.`,
      "chat_completion_failed",
    ), 502);
  }

  const answer = getChatAnswer(upstreamBody.value);

  if (answer === null) {
    return c.json(createErrorResponse(
      "Chat Completions provider response did not include choices[0].message.content text.",
      "invalid_chat_completion_response",
    ), 502);
  }

  const response: ChatCompletionSuccessResponse = {
    success: true,
    answer,
    model: getResponseModel(upstreamBody.value) ?? providerConfig.model,
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
  tokenLimitParameter: ChatTokenLimitParameter;
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
        content: buildUserContent(input.message, input.imageDataUrl),
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

  return payload;
}

function buildUserContent(
  message: string,
  imageDataUrl: string | undefined,
): ChatMessage["content"] {
  if (imageDataUrl === undefined) {
    return message;
  }

  return [
    {
      type: "text",
      text: message,
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

async function readUpstreamBody(response: Response): Promise<UpstreamResponseBody> {
  const text = await response.text();

  if (text.trim().length === 0) {
    return {
      value: null,
      textSnippet: null,
    };
  }

  try {
    return {
      value: JSON.parse(text) as unknown,
      textSnippet: createTextSnippet(text),
    };
  } catch {
    return {
      value: null,
      textSnippet: createTextSnippet(text),
    };
  }
}

function createTextSnippet(value: string): string | null {
  const collapsedValue = value.replace(/\s+/g, " ").trim();

  if (collapsedValue.length === 0) {
    return null;
  }

  if (collapsedValue.length <= MAX_UPSTREAM_ERROR_SNIPPET_CHARS) {
    return collapsedValue;
  }

  return `${collapsedValue.slice(0, MAX_UPSTREAM_ERROR_SNIPPET_CHARS)}...`;
}

function getUpstreamErrorMessage(body: UpstreamResponseBody): string | undefined {
  const structuredMessage = getStructuredUpstreamErrorMessage(body.value);

  if (structuredMessage !== undefined) {
    return structuredMessage;
  }

  return body.textSnippet === null
    ? undefined
    : `Provider returned ${body.textSnippet}`;
}

function getStructuredUpstreamErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  if ("error" in value) {
    const errorValue = value.error;

    if (
      typeof errorValue === "object" &&
      errorValue !== null &&
      "message" in errorValue &&
      typeof errorValue.message === "string"
    ) {
      return errorValue.message;
    }

    if (typeof errorValue === "string") {
      return errorValue;
    }
  }

  if ("message" in value && typeof value.message === "string") {
    return value.message;
  }

  return undefined;
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
