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

export type UsageTurn = {
  index: number;
  recordedAt: number;
  usage: UsageBuckets;
  estimatedCostUsd: number;
  cumulativeEstimatedCostUsd: number;
};

export type UsageReport = {
  turnCount: number;
  totals: UsageBuckets;
  lastTurn: UsageBuckets | null;
  estimatedCostUsd: number;
  turns: readonly UsageTurn[];
};

export type UsageReportExport = {
  metadata: {
    schemaVersion: 1;
    generatedAt: number;
    source: "openai-realtime-response-done";
    pricesUsdPerMillion: typeof REALTIME_PRICES_USD_PER_MILLION;
  };
  summary: {
    turnCount: number;
    estimatedCostUsd: number;
  };
  totals: UsageBuckets;
  lastTurn: UsageBuckets | null;
  turns: readonly UsageTurn[];
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
    turns: [],
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

function copyUsageBuckets(usage: UsageBuckets): UsageBuckets {
  return {
    inputTokens: usage.inputTokens,
    inputTextTokens: usage.inputTextTokens,
    inputAudioTokens: usage.inputAudioTokens,
    inputImageTokens: usage.inputImageTokens,
    cachedInputTokens: usage.cachedInputTokens,
    cachedTextTokens: usage.cachedTextTokens,
    cachedAudioTokens: usage.cachedAudioTokens,
    cachedImageTokens: usage.cachedImageTokens,
    outputTokens: usage.outputTokens,
    outputTextTokens: usage.outputTextTokens,
    outputAudioTokens: usage.outputAudioTokens,
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

export function appendUsageTurn(
  report: UsageReport,
  turnUsage: UsageBuckets,
  recordedAt: number,
): UsageReport {
  const usage = copyUsageBuckets(turnUsage);
  const totals = accumulateUsage(report.totals, usage);
  const cumulativeEstimatedCostUsd = estimateCostUsd(totals);
  const nextTurn: UsageTurn = {
    index: report.turnCount + 1,
    recordedAt,
    usage,
    estimatedCostUsd: estimateCostUsd(usage),
    cumulativeEstimatedCostUsd,
  };

  return {
    turnCount: nextTurn.index,
    totals,
    lastTurn: usage,
    estimatedCostUsd: cumulativeEstimatedCostUsd,
    turns: [...report.turns, nextTurn],
  };
}

function copyUsageTurn(turn: UsageTurn): UsageTurn {
  return {
    index: turn.index,
    recordedAt: turn.recordedAt,
    usage: copyUsageBuckets(turn.usage),
    estimatedCostUsd: turn.estimatedCostUsd,
    cumulativeEstimatedCostUsd: turn.cumulativeEstimatedCostUsd,
  };
}

export function buildUsageReportExport(
  report: UsageReport,
  generatedAt: number = Date.now(),
): UsageReportExport {
  return {
    metadata: {
      schemaVersion: 1,
      generatedAt,
      source: "openai-realtime-response-done",
      pricesUsdPerMillion: REALTIME_PRICES_USD_PER_MILLION,
    },
    summary: {
      turnCount: report.turnCount,
      estimatedCostUsd: report.estimatedCostUsd,
    },
    totals: copyUsageBuckets(report.totals),
    lastTurn:
      report.lastTurn === null ? null : copyUsageBuckets(report.lastTurn),
    turns: report.turns.map(copyUsageTurn),
  };
}

export function serializeUsageReportJson(
  report: UsageReport,
  generatedAt: number = Date.now(),
): string {
  return `${JSON.stringify(buildUsageReportExport(report, generatedAt), null, 2)}\n`;
}

function csvCell(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  const text = String(value);

  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function usageCsvCells(usage: UsageBuckets): readonly number[] {
  return [
    usage.inputTokens,
    usage.inputTextTokens,
    usage.inputAudioTokens,
    usage.inputImageTokens,
    usage.cachedInputTokens,
    usage.cachedTextTokens,
    usage.cachedAudioTokens,
    usage.cachedImageTokens,
    usage.outputTokens,
    usage.outputTextTokens,
    usage.outputAudioTokens,
  ];
}

function usageCsvRow(
  rowType: "turn" | "totals",
  turnIndex: number | null,
  recordedAt: number,
  usage: UsageBuckets,
  estimatedCostUsd: number,
  cumulativeEstimatedCostUsd: number,
): string {
  return [
    rowType,
    turnIndex,
    recordedAt,
    ...usageCsvCells(usage),
    estimatedCostUsd,
    cumulativeEstimatedCostUsd,
  ]
    .map(csvCell)
    .join(",");
}

export function serializeUsageReportCsv(
  report: UsageReport,
  generatedAt: number = Date.now(),
): string {
  const header = [
    "row_type",
    "turn_index",
    "recorded_at_ms",
    "input_tokens",
    "input_text_tokens",
    "input_audio_tokens",
    "input_image_tokens",
    "cached_input_tokens",
    "cached_text_tokens",
    "cached_audio_tokens",
    "cached_image_tokens",
    "output_tokens",
    "output_text_tokens",
    "output_audio_tokens",
    "estimated_cost_usd",
    "cumulative_estimated_cost_usd",
  ].join(",");
  const turnRows = report.turns.map((turn) =>
    usageCsvRow(
      "turn",
      turn.index,
      turn.recordedAt,
      turn.usage,
      turn.estimatedCostUsd,
      turn.cumulativeEstimatedCostUsd,
    ),
  );
  const totalsRow = usageCsvRow(
    "totals",
    null,
    generatedAt,
    report.totals,
    report.estimatedCostUsd,
    report.estimatedCostUsd,
  );

  return [header, ...turnRows, totalsRow].join("\n") + "\n";
}

export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.0001) {
    return "<$0.0001";
  }

  return `$${amount.toFixed(4)}`;
}

/**
 * 成本换算的实际账单来源标注。
 *
 * 用量面板展示的「估算成本」本质上是把 token 用量按某套单价换算成 USD，
 * 而 token 用量的来源（Realtime `response.done` 权威载荷 vs Chat 前端估算）
 * 与所用单价集决定了这笔换算的可信度。此类型把两者编码为可展示的标注，
 * 用于对用户动态说明「成本依据哪个来源、是否为权威计量」，并给出
 * provider 账单核对提示（真实账单以 provider 控制台为准）。
 */
export type BillSource =
  | {
      kind: "realtime-response-done";
      /** token 用量来自 Realtime `response.done` usage 载荷，属权威计量。 */
      usageAuthority: "authoritative";
      /** 单价基于 gpt-realtime 定价集。 */
      priceSet: "gpt-realtime-pricing";
      /** 供 i18n 使用的标注 key 前缀。 */
      key: "realtime";
    }
  | {
      kind: "chat-frontend-estimate";
      /** token 用量为前端按输入/输出文本与图像平铺规则估算，非权威。 */
      usageAuthority: "estimated";
      /** 单价基于 Chat Completions 定价集。 */
      priceSet: "chat-pricing";
      /** 供 i18n 使用的标注 key 前缀。 */
      key: "chat";
    };

/**
 * 根据 provider 模式映射出成本换算的账单来源标注。
 *
 * @param isChatMode 是否为 Chat 模式（用量为前端估算）。false 视为
 *   Realtime 模式（用量来自 `response.done` 权威载荷）。
 * @returns 账单来源标注；未知模式回退为 Chat 估算。
 */
export function describeBillSource(isChatMode: boolean): BillSource {
  return isChatMode
    ? {
        kind: "chat-frontend-estimate",
        usageAuthority: "estimated",
        priceSet: "chat-pricing",
        key: "chat",
      }
    : {
        kind: "realtime-response-done",
        usageAuthority: "authoritative",
        priceSet: "gpt-realtime-pricing",
        key: "realtime",
      };
}

/** 视觉 token 计算参数（OpenAI 兼容规范）。 */
const VISION_BASE_TOKENS = 85;
const VISION_TILE_TOKENS = 170;
const VISION_TILE_SIZE = 512;

export type ResolutionCost = {
  width: number;
  height: number;
  tokens: number;
  savingPercent: number;
};

/**
 * 估算一张图片消耗的 input token（OpenAI 兼容分块规则）。
 *
 * ```
 * base_tokens = 85
 * tile_tokens = 170 × ceil(width/512) × ceil(height/512)
 * ```
 *
 * 640×360 → ceil(640/512)=2, ceil(360/512)=1 → 85 + 170×2×1 = 425 token/帧。
 * 512×288 → 1×1 分块 → 85 + 170 = 255 token/帧（省 40%）。
 *
 * @param width 图片宽度（像素）
 * @param height 图片高度（像素）
 */
export function estimateImageTokens(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 0;
  }

  const tilesX = Math.ceil(width / VISION_TILE_SIZE);
  const tilesY = Math.ceil(height / VISION_TILE_SIZE);

  return VISION_BASE_TOKENS + VISION_TILE_TOKENS * tilesX * tilesY;
}

/**
 * 计算不同分辨率下的成本，用于向用户展示降分辨率的收益。
 */
export function compareResolutionCosts(
  sourceWidth: number,
  sourceHeight: number,
): readonly ResolutionCost[] {
  const baseline = estimateImageTokens(sourceWidth, sourceHeight);
  const candidates = [1280, 1024, 768, 640, 512];

  return candidates
    .filter((width) => width < sourceWidth)
    .map((width) => {
      const scale = width / sourceWidth;
      const height = Math.round(sourceHeight * scale);
      const tokens = estimateImageTokens(width, height);

      return {
        width,
        height,
        tokens,
        savingPercent:
          baseline === 0 ? 0 : Math.round((1 - tokens / baseline) * 100),
      };
    });
}

export function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }

  return String(count);
}

/**
 * 估算被自动跳过的帧在未跳转情况下会产生的图像 input token 成本。
 *
 * 用于把"跳过 N 帧"翻译为可感知的"≈节省 ¥X.XX"，强化用户对成本节省的体感。
 *
 * @param skippedFrameCount 已自动跳过的帧数
 * @param width 采样帧宽度（像素）
 * @param height 采样帧高度（像素）
 * @returns 估算的节省金额（USD）
 */
export function estimateSkippedFramesSavings(
  skippedFrameCount: number,
  width: number,
  height: number,
): number {
  if (!Number.isFinite(skippedFrameCount) || skippedFrameCount <= 0) {
    return 0;
  }

  const tokensPerFrame = estimateImageTokens(width, height);
  const pricePerToken =
    REALTIME_PRICES_USD_PER_MILLION.inputImage / 1_000_000;

  return skippedFrameCount * tokensPerFrame * pricePerToken;
}
