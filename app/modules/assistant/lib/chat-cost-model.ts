/**
 * Live cost measurement for Chat Completions mode.
 *
 * Realtime mode receives authoritative token usage in every `response.done`
 * server event (see `cost-model.ts`). Chat Completions mode, in contrast,
 * exposes no per-turn usage when streaming (`stream: true` is the default for
 * the in-app Chat turn), so this module provides a lightweight **front-end
 * estimate** built from the inputs we already control:
 *
 *   - input tokens  ≈ message characters / 4
 *                   + injected scene-memory context
 *                   + injected text-history summary
 *                   + image tokens (OpenAI-compatible tiling, shared with
 *                     the Realtime cost model)
 *   - output tokens ≈ assistant answer characters / 4
 *
 * The estimated USD cost uses a configurable vision-chat price table. This is
 * an in-app estimate only; billing truth lives in the provider console.
 */

import {
  createEmptyUsage,
  estimateImageTokens,
  type UsageBuckets,
  type UsageReport,
} from "@/modules/assistant/lib/cost-model";

/** Average characters per token for mixed CJK + latin text estimation. */
const CHARACTERS_PER_TOKEN = 4;

/** Estimated vision-chat prices in USD per 1M tokens. */
export const CHAT_PRICES_USD_PER_MILLION = {
  inputText: 2.5,
  inputImage: 5,
  outputText: 10,
} as const;

export type ChatUsageTurn = {
  index: number;
  recordedAt: number;
  inputTokens: number;
  inputTextTokens: number;
  inputImageTokens: number;
  outputTokens: number;
  outputTextTokens: number;
  estimatedCostUsd: number;
  cumulativeEstimatedCostUsd: number;
};

export type ChatUsageReport = {
  turnCount: number;
  totals: {
    inputTokens: number;
    inputTextTokens: number;
    inputImageTokens: number;
    outputTokens: number;
    outputTextTokens: number;
  };
  lastTurn: ChatUsageTurn | null;
  estimatedCostUsd: number;
  turns: readonly ChatUsageTurn[];
};

export function createEmptyChatUsageReport(): ChatUsageReport {
  return {
    turnCount: 0,
    totals: {
      inputTokens: 0,
      inputTextTokens: 0,
      inputImageTokens: 0,
      outputTokens: 0,
      outputTextTokens: 0,
    },
    lastTurn: null,
    estimatedCostUsd: 0,
    turns: [],
  };
}

function safeNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

/** Estimates text token count from a character count. */
export function estimateTextTokens(text: string): number {
  if (typeof text !== "string" || text.length === 0) {
    return 0;
  }

  return Math.max(1, Math.ceil(text.length / CHARACTERS_PER_TOKEN));
}

export type ChatTurnEstimateInput = {
  /** The user's latest message. */
  message: string;
  /** Serialized scene-memory context injected as low-cost text. */
  sceneContext?: string;
  /** Serialized text-history summary injected as low-cost text. */
  historyContext?: string;
  /** Base-64 image data URL of the sampled frame (if any). */
  imageDataUrl?: string;
  /** Sampled frame width in pixels (for image-token estimation). */
  frameWidth?: number;
  /** Sampled frame height in pixels (for image-token estimation). */
  frameHeight?: number;
  /** The assistant's complete answer text. */
  answer: string;
  /**
   * Authoritative token usage reported by the provider for a non-streaming
   * completion. When present, the metering uses these exact token counts
   * instead of the character-count heuristic estimate.
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type ChatTurnEstimate = {
  inputTokens: number;
  inputTextTokens: number;
  inputImageTokens: number;
  outputTokens: number;
  outputTextTokens: number;
  estimatedCostUsd: number;
};

/**
 * Estimates one Chat turn's token usage and USD cost from the inputs the
 * front-end already controls. Pure and side-effect free.
 */
export function estimateChatTurnCost(
  input: ChatTurnEstimateInput,
): ChatTurnEstimate {
  const messageTokens = estimateTextTokens(input.message);
  const sceneTokens = estimateTextTokens(input.sceneContext ?? "");
  const historyTokens = estimateTextTokens(input.historyContext ?? "");
  const inputTextTokens = messageTokens + sceneTokens + historyTokens;

  const imageDataUrl = input.imageDataUrl;
  const hasImage =
    typeof imageDataUrl === "string" &&
    imageDataUrl.startsWith("data:image/") &&
    imageDataUrl.length > 0;
  const inputImageTokens =
    hasImage &&
    Number.isFinite(input.frameWidth) &&
    Number.isFinite(input.frameHeight) &&
    (input.frameWidth ?? 0) > 0 &&
    (input.frameHeight ?? 0) > 0
      ? estimateImageTokens(input.frameWidth ?? 0, input.frameHeight ?? 0)
      : 0;

  const inputTokens = inputTextTokens + inputImageTokens;
  const outputTextTokens = estimateTextTokens(input.answer);
  const outputTokens = outputTextTokens;

  const prices = CHAT_PRICES_USD_PER_MILLION;
  const costUsd =
    (inputTextTokens * prices.inputText +
      inputImageTokens * prices.inputImage +
      outputTextTokens * prices.outputText) /
    1_000_000;

  return {
    inputTokens,
    inputTextTokens,
    inputImageTokens,
    outputTokens,
    outputTextTokens,
    estimatedCostUsd: safeNonNegative(costUsd),
  };
}

/**
 * Builds a Chat turn estimate from authoritative provider usage.
 *
 * Used when a non-streaming Chat completion exposes its real `usage` object
 * (see `ChatTurnEstimateInput.usage`). The input/output split of the provider
 * usage is coarse (no per-modality breakdown), so the image-token portion is
 * carried over from the heuristic estimate while text tokens are corrected to
 * the authoritative totals. Pure and side-effect free.
 */
export function estimateChatTurnCostFromUsage(
  input: ChatTurnEstimateInput,
): ChatTurnEstimate {
  const estimate = estimateChatTurnCost(input);
  const usage = input.usage;

  if (usage === undefined) {
    return estimate;
  }

  const safePrompt = safeNonNegative(usage.promptTokens);
  const safeCompletion = safeNonNegative(usage.completionTokens);

  // 图像 token 保持估算值（上游 usage 无分模态明细）；文本部分用权威总量校正。
  const inputImageTokens = estimate.inputImageTokens;
  const inputTextTokens = Math.max(0, safePrompt - inputImageTokens);
  const outputTextTokens = safeCompletion;

  const prices = CHAT_PRICES_USD_PER_MILLION;
  const costUsd =
    (inputTextTokens * prices.inputText +
      inputImageTokens * prices.inputImage +
      outputTextTokens * prices.outputText) /
    1_000_000;

  return {
    inputTokens: safePrompt,
    inputTextTokens,
    inputImageTokens,
    outputTokens: safeCompletion,
    outputTextTokens,
    estimatedCostUsd: safeNonNegative(costUsd),
  };
}

/**
 * Appends a completed Chat turn to the session report, folding in the
 * estimated usage and cumulative cost. Pure.
 */
export function appendChatUsageTurn(
  report: ChatUsageReport,
  estimate: ChatTurnEstimate,
  recordedAt: number,
): ChatUsageReport {
  const nextTotals = {
    inputTokens: report.totals.inputTokens + estimate.inputTokens,
    inputTextTokens: report.totals.inputTextTokens + estimate.inputTextTokens,
    inputImageTokens: report.totals.inputImageTokens + estimate.inputImageTokens,
    outputTokens: report.totals.outputTokens + estimate.outputTokens,
    outputTextTokens:
      report.totals.outputTextTokens + estimate.outputTextTokens,
  };
  const cumulativeEstimatedCostUsd = safeNonNegative(
    report.estimatedCostUsd + estimate.estimatedCostUsd,
  );
  const nextTurn: ChatUsageTurn = {
    index: report.turnCount + 1,
    recordedAt,
    inputTokens: estimate.inputTokens,
    inputTextTokens: estimate.inputTextTokens,
    inputImageTokens: estimate.inputImageTokens,
    outputTokens: estimate.outputTokens,
    outputTextTokens: estimate.outputTextTokens,
    estimatedCostUsd: estimate.estimatedCostUsd,
    cumulativeEstimatedCostUsd,
  };

  return {
    turnCount: nextTurn.index,
    totals: nextTotals,
    lastTurn: nextTurn,
    estimatedCostUsd: cumulativeEstimatedCostUsd,
    turns: [...report.turns, nextTurn],
  };
}

/**
 * Maps a Chat usage turn onto the shared `UsageBuckets` shape so the existing
 * Realtime cost panel rendering can display Chat tokens uniformly.
 */
export function chatTurnToUsageBuckets(turn: ChatUsageTurn): UsageBuckets {
  return {
    inputTokens: turn.inputTokens,
    inputTextTokens: turn.inputTextTokens,
    inputAudioTokens: 0,
    inputImageTokens: turn.inputImageTokens,
    cachedInputTokens: 0,
    cachedTextTokens: 0,
    cachedAudioTokens: 0,
    cachedImageTokens: 0,
    outputTokens: turn.outputTokens,
    outputTextTokens: turn.outputTextTokens,
    outputAudioTokens: 0,
  };
}

/**
 * Builds an empty `UsageReport` (all-zero buckets) so the shared cost panel
 * can render an empty Chat meter before any turn has completed.
 */
export function createEmptyChatUsageAsUsageReport(): UsageReport {
  return {
    turnCount: 0,
    totals: createEmptyUsage(),
    lastTurn: null,
    estimatedCostUsd: 0,
    turns: [],
  };
}

/**
 * Maps a Chat usage report onto the shared `UsageReport` shape used by the
 * unified cost panel. Per-turn buckets are converted through
 * `chatTurnToUsageBuckets`; totals are mapped directly. Pure.
 */
export function chatUsageToUsageReport(
  chatReport: ChatUsageReport,
): UsageReport {
  return {
    turnCount: chatReport.turnCount,
    totals: {
      inputTokens: chatReport.totals.inputTokens,
      inputTextTokens: chatReport.totals.inputTextTokens,
      inputAudioTokens: 0,
      inputImageTokens: chatReport.totals.inputImageTokens,
      cachedInputTokens: 0,
      cachedTextTokens: 0,
      cachedAudioTokens: 0,
      cachedImageTokens: 0,
      outputTokens: chatReport.totals.outputTokens,
      outputTextTokens: chatReport.totals.outputTextTokens,
      outputAudioTokens: 0,
    },
    lastTurn:
      chatReport.lastTurn === null
        ? null
        : chatTurnToUsageBuckets(chatReport.lastTurn),
    estimatedCostUsd: chatReport.estimatedCostUsd,
    turns: chatReport.turns.map((turn) => ({
      index: turn.index,
      recordedAt: turn.recordedAt,
      usage: chatTurnToUsageBuckets(turn),
      estimatedCostUsd: turn.estimatedCostUsd,
      cumulativeEstimatedCostUsd: turn.cumulativeEstimatedCostUsd,
    })),
  };
}
