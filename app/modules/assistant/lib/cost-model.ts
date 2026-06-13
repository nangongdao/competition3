/**
 * Pure cost accounting for OpenAI Realtime usage.
 *
 * The Realtime API reports authoritative token usage in every
 * `response.done` server event. This module parses that usage into
 * modality buckets, accumulates session totals, and estimates USD cost.
 *
 * Realtime billing re-charges the whole conversation history as input on
 * every response, so `inputTokens` of later turns exposes the history
 * snowball that history-pruning work is verified against.
 */

import { isRecord } from "@/modules/assistant/lib/type-guards";

export type UsageBuckets = {
  /** Total billed input tokens for the turn, cached portion included. */
  inputTokens: number;
  inputTextTokens: number;
  inputAudioTokens: number;
  inputImageTokens: number;
  /** Input tokens served from the prompt cache at the cached rate. */
  cachedInputTokens: number;
  cachedTextTokens: number;
  cachedAudioTokens: number;
  cachedImageTokens: number;
  outputTokens: number;
  outputTextTokens: number;
  outputAudioTokens: number;
};

export type UsageReport = {
  turnCount: number;
  totals: UsageBuckets;
  lastTurn: UsageBuckets | null;
  estimatedCostUsd: number;
};

/**
 * Estimated gpt-realtime prices in USD per 1M tokens.
 *
 * Source: OpenAI API pricing page for gpt-realtime. Treat as an estimate
 * for in-app display only; billing truth lives in the OpenAI dashboard.
 */
export const REALTIME_PRICES_USD_PER_MILLION = {
  inputText: 4,
  cachedText: 0.4,
  inputAudio: 32,
  cachedAudio: 0.4,
  inputImage: 5,
  cachedImage: 0.5,
  outputText: 16,
  outputAudio: 64,
} as const;

export function createEmptyUsage(): UsageBuckets {
  return {
    inputTokens: 0,
    inputTextTokens: 0,
    inputAudioTokens: 0,
    inputImageTokens: 0,
    cachedInputTokens: 0,
    cachedTextTokens: 0,
    cachedAudioTokens: 0,
    cachedImageTokens: 0,
    outputTokens: 0,
    outputTextTokens: 0,
    outputAudioTokens: 0,
  };
}

export function createEmptyUsageReport(): UsageReport {
  return {
    turnCount: 0,
    totals: createEmptyUsage(),
    lastTurn: null,
    estimatedCostUsd: 0,
  };
}

function getTokenCount(value: Record<string, unknown>, fieldName: string): number {
  const fieldValue = value[fieldName];

  if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 0) {
    return 0;
  }

  return fieldValue;
}

/**
 * Parses the `usage` object from a `response.done` server event.
 *
 * Returns `null` when the event carries no usable usage payload. Missing
 * numeric fields read as 0 so partial payloads still produce a turn.
 */
export function parseResponseUsage(
  event: Record<string, unknown>,
): UsageBuckets | null {
  const responseValue = event.response;

  if (!isRecord(responseValue)) {
    return null;
  }

  const usageValue = responseValue.usage;

  if (!isRecord(usageValue)) {
    return null;
  }

  const inputDetails = isRecord(usageValue.input_token_details)
    ? usageValue.input_token_details
    : {};
  const cachedDetails = isRecord(inputDetails.cached_tokens_details)
    ? inputDetails.cached_tokens_details
    : {};
  const outputDetails = isRecord(usageValue.output_token_details)
    ? usageValue.output_token_details
    : {};

  return {
    inputTokens: getTokenCount(usageValue, "input_tokens"),
    inputTextTokens: getTokenCount(inputDetails, "text_tokens"),
    inputAudioTokens: getTokenCount(inputDetails, "audio_tokens"),
    inputImageTokens: getTokenCount(inputDetails, "image_tokens"),
    cachedInputTokens: getTokenCount(inputDetails, "cached_tokens"),
    cachedTextTokens: getTokenCount(cachedDetails, "text_tokens"),
    cachedAudioTokens: getTokenCount(cachedDetails, "audio_tokens"),
    cachedImageTokens: getTokenCount(cachedDetails, "image_tokens"),
    outputTokens: getTokenCount(usageValue, "output_tokens"),
    outputTextTokens: getTokenCount(outputDetails, "text_tokens"),
    outputAudioTokens: getTokenCount(outputDetails, "audio_tokens"),
  };
}

export function accumulateUsage(
  totals: UsageBuckets,
  turn: UsageBuckets,
): UsageBuckets {
  return {
    inputTokens: totals.inputTokens + turn.inputTokens,
    inputTextTokens: totals.inputTextTokens + turn.inputTextTokens,
    inputAudioTokens: totals.inputAudioTokens + turn.inputAudioTokens,
    inputImageTokens: totals.inputImageTokens + turn.inputImageTokens,
    cachedInputTokens: totals.cachedInputTokens + turn.cachedInputTokens,
    cachedTextTokens: totals.cachedTextTokens + turn.cachedTextTokens,
    cachedAudioTokens: totals.cachedAudioTokens + turn.cachedAudioTokens,
    cachedImageTokens: totals.cachedImageTokens + turn.cachedImageTokens,
    outputTokens: totals.outputTokens + turn.outputTokens,
    outputTextTokens: totals.outputTextTokens + turn.outputTextTokens,
    outputAudioTokens: totals.outputAudioTokens + turn.outputAudioTokens,
  };
}

function uncached(modalityTokens: number, cachedTokens: number): number {
  return Math.max(0, modalityTokens - cachedTokens);
}

/**
 * Estimates USD cost from bucketed usage.
 *
 * Cached tokens are billed at the cached rate; the uncached remainder of
 * each input modality is billed at the full input rate.
 */
export function estimateCostUsd(usage: UsageBuckets): number {
  const prices = REALTIME_PRICES_USD_PER_MILLION;
  const perMillion =
    uncached(usage.inputTextTokens, usage.cachedTextTokens) * prices.inputText +
    usage.cachedTextTokens * prices.cachedText +
    uncached(usage.inputAudioTokens, usage.cachedAudioTokens) * prices.inputAudio +
    usage.cachedAudioTokens * prices.cachedAudio +
    uncached(usage.inputImageTokens, usage.cachedImageTokens) * prices.inputImage +
    usage.cachedImageTokens * prices.cachedImage +
    usage.outputTextTokens * prices.outputText +
    usage.outputAudioTokens * prices.outputAudio;

  return perMillion / 1_000_000;
}

export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.0001) {
    return "<$0.0001";
  }

  return `$${amount.toFixed(4)}`;
}

export function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }

  return String(count);
}
