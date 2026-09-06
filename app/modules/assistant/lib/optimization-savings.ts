/**
 * Pure cost-optimization savings aggregation.
 *
 * The project has several independent cost-saving mechanisms that each
 * report their own token savings (frame-diff skipped uploads, scene-memory
 * history substitution, text-history summarization, and multimodal fusion).
 * These are currently shown in isolation in the visual-context panel. This
 * module consolidates them into a single structured summary so the user can
 * see "your optimizations saved ≈ X tokens / ≈ $Y across N mechanisms" at a
 * glance -- turning scattered per-mechanism counters into one actionable
 * cost narrative (the roadmap's "translate savings into money" goal).
 *
 * Price model: each mechanism's token savings are priced with the shared
 * OpenAI-compatible input token prices from `cost-model.ts`, so the USD
 * estimate is consistent with the usage meter. No rounding is performed
 * here; callers format with `formatUsd` / `formatTokens`.
 */

import {
  estimateImageTokens,
  estimateSkippedFramesSavings,
  REALTIME_PRICES_USD_PER_MILLION,
} from "@/modules/assistant/lib/cost-model";

/** A single cost-saving mechanism's contribution to the summary. */
export type OptimizationSavingsItem = {
  /** Stable machine id (also used as the i18n key suffix). */
  readonly id: "frame-diff" | "scene-memory" | "text-history" | "fusion";
  /** Estimated input tokens avoided by this mechanism. */
  readonly savedTokens: number;
  /** Estimated USD saved by this mechanism (input-token price model). */
  readonly savedUsd: number;
};

/** Aggregated cost-optimization savings across all active mechanisms. */
export type OptimizationSavingsSummary = {
  /** Individual per-mechanism contributions, active mechanisms first. */
  readonly items: readonly OptimizationSavingsItem[];
  /** Number of mechanisms that reported nonzero savings. */
  readonly activeMechanismCount: number;
  /** Total estimated input tokens avoided across all mechanisms. */
  readonly totalSavedTokens: number;
  /** Total estimated USD saved across all mechanisms. */
  readonly totalSavedUsd: number;
};

/** Inputs required to price each mechanism's savings. */
export type OptimizationSavingsInput = {
  /** Auto-skipped frames from frame-difference gating (count). */
  readonly skippedFrameCount: number;
  /** Sampling frame width (px), used to price a skipped frame. */
  readonly sampleWidth: number;
  /** Sampling frame height (px), used to price a skipped frame. */
  readonly sampleHeight: number;
  /** Scene-memory history substitution savings (input image tokens). */
  readonly sceneMemorySavingsTokens: number;
  /** Text-history summarization savings (input text tokens). */
  readonly textHistorySavedTextTokens: number;
  /** Multimodal fusion merged-frame image tokens (avoided round-trip). */
  readonly fusionImageTokens: number;
};

const IMAGE_INPUT_PRICE = REALTIME_PRICES_USD_PER_MILLION.inputImage;
const TEXT_INPUT_PRICE = REALTIME_PRICES_USD_PER_MILLION.inputText;

function tokensToUsd(tokens: number, pricePerMillion: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return 0;
  }
  return (tokens * pricePerMillion) / 1_000_000;
}

/**
 * Aggregates the four cost-optimization mechanisms into a single summary.
 *
 * Mechanism pricing:
 * - `frame-diff`: each skipped upload would have billed an image input token
 *   block; reuse `estimateSkippedFramesSavings` (image input price).
 * - `scene-memory`: history frames replaced by low-cost text summaries;
 *   savings are already in input image tokens (image input price).
 * - `text-history`: earlier turns compressed to a short summary; savings are
 *   in input text tokens (text input price).
 * - `fusion`: merging a concurrent frame into the same request avoids a
 *   separate frame round-trip; the fused frame's image tokens are counted as
 *   the avoided re-send (image input price).
 *
 * Mechanisms with zero/non-finite savings are dropped from `items` and do not
 * contribute to the total, so the summary stays honest and only reports
 * genuinely active optimizations.
 */
export function buildOptimizationSavings(
  input: OptimizationSavingsInput,
): OptimizationSavingsSummary {
  const frameDiffUsd = estimateSkippedFramesSavings(
    input.skippedFrameCount,
    input.sampleWidth,
    input.sampleHeight,
  );
  const frameDiffTokens =
    input.skippedFrameCount > 0
      ? estimateImageTokens(input.sampleWidth, input.sampleHeight) *
        input.skippedFrameCount
      : 0;

  const sceneMemoryUsd = tokensToUsd(
    input.sceneMemorySavingsTokens,
    IMAGE_INPUT_PRICE,
  );
  const textHistoryUsd = tokensToUsd(
    input.textHistorySavedTextTokens,
    TEXT_INPUT_PRICE,
  );
  const fusionUsd = tokensToUsd(input.fusionImageTokens, IMAGE_INPUT_PRICE);

  const candidates: readonly OptimizationSavingsItem[] = [
    {
      id: "frame-diff",
      savedTokens: frameDiffTokens,
      savedUsd: frameDiffUsd,
    },
    {
      id: "scene-memory",
      savedTokens: input.sceneMemorySavingsTokens,
      savedUsd: sceneMemoryUsd,
    },
    {
      id: "text-history",
      savedTokens: input.textHistorySavedTextTokens,
      savedUsd: textHistoryUsd,
    },
    {
      id: "fusion",
      savedTokens: input.fusionImageTokens,
      savedUsd: fusionUsd,
    },
  ];

  const items = candidates.filter(
    (item) => item.savedTokens > 0 && item.savedUsd > 0,
  );

  const totalSavedTokens = items.reduce(
    (sum, item) => sum + item.savedTokens,
    0,
  );
  const totalSavedUsd = items.reduce((sum, item) => sum + item.savedUsd, 0);

  return {
    items,
    activeMechanismCount: items.length,
    totalSavedTokens,
    totalSavedUsd,
  };
}
