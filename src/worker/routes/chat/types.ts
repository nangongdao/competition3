import { z } from "zod";

export const chatResponseBudgetSchema = z.enum([
  "brief",
  "standard",
  "detailed",
]);

export const chatCompletionInputSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  imageDataUrl: z
    .string()
    .trim()
    .startsWith("data:image/")
    .max(8_000_000)
    .optional(),
  /** 场景记忆：历史关键帧的文字摘要，作为低成本文本上下文注入。 */
  sceneContext: z.string().trim().max(4000).optional(),
  /** 文本历史摘要：客户端构建的更早对话轮次的紧凑摘要，作为低成本文本上下文注入。 */
  historyContext: z.string().trim().max(4000).optional(),
  responseBudget: chatResponseBudgetSchema.default("standard"),
  instructions: z.string().trim().min(1).max(1200).optional(),
  stream: z.boolean().optional(),
});

export type ChatCompletionInput = z.infer<typeof chatCompletionInputSchema>;
export type ChatResponseBudget = ChatCompletionInput["responseBudget"];

export type ChatCompletionSuccessResponse = {
  success: true;
  answer: string;
  model: string;
  /**
   * Authoritative token usage reported by the provider for **non-streaming**
   * completions. Streaming requests (`stream: true`) do not expose a usable
   * `usage` payload, so this field is only present when the caller opted out
   * of streaming. When present, the front-end should prefer it over any
   * heuristic token estimate for cost metering.
   */
  usage?: ChatUsage;
};

/**
 * Token usage reported by an OpenAI-compatible Chat Completions endpoint.
 * Mirrors the `usage` object of a non-streaming completion response.
 */
export type ChatUsage = {
  /** Tokens consumed by the prompt (message + injected context + image). */
  promptTokens: number;
  /** Tokens produced by the completion. */
  completionTokens: number;
  /** promptTokens + completionTokens. */
  totalTokens: number;
};

export type ChatApiErrorResponse = {
  success: false;
  error: string;
  code: string;
};

export type ChatStreamDelta = {
  success: true;
  delta: string;
};

export type ChatStreamDone = {
  success: true;
  done: true;
  model?: string;
};

export type ChatStreamEvent = ChatStreamDelta | ChatStreamDone;