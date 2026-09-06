import type { UsageEntry } from "@/modules/assistant/lib/session-client";

/**
 * 会话级用量趋势可视化的纯数据层。
 *
 * 把会话持久化的逐轮用量记录（`UsageEntry[]`，按时间顺序）折叠为可供
 * 轻量 SVG 图表渲染的趋势序列：
 *   - 每轮独立成本 / 累计成本（USD）；
 *   - 每轮输入 / 输出 token；
 *   - 峰值为图表 y 轴归一化提供依据。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用。
 */
export type UsageTrendPoint = {
  /** 1-based 轮次序号（也是 x 轴刻度）。 */
  index: number;
  /** 该轮记录的时间戳（ms）。 */
  recordedAt: number;
  /** 该轮估算成本（USD）。 */
  estimatedCostUsd: number;
  /** 到该轮为止的累计估算成本（USD）。 */
  cumulativeCostUsd: number;
  /** 该轮输入 token。 */
  inputTokens: number;
  /** 该轮输出 token。 */
  outputTokens: number;
};

export type UsageTrendSeries = {
  points: readonly UsageTrendPoint[];
  /** 单轮峰值成本（用于 y 轴归一化；无记录时为 0）。 */
  peakCostUsd: number;
  /** 累计成本（= 末点累计成本）。 */
  totalCostUsd: number;
  /** 累计输入 token。 */
  totalInputTokens: number;
  /** 累计输出 token。 */
  totalOutputTokens: number;
  /** 峰值 token 数（用于 token 柱状图的归一化）。 */
  peakTokens: number;
};

function clampPositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 按时间顺序把逐轮用量记录折叠为趋势序列。
 *
 * @param entries 会话级用量记录（应按 recorded_at 升序）。未排序时按
 *   recordedAt 升序重排，保证累计成本正确。
 * @returns 趋势序列；无记录时返回空 points 且各总量为 0。
 */
export function buildUsageTrendSeries(
  entries: readonly UsageEntry[],
): UsageTrendSeries {
  const sorted = [...entries].sort((a, b) => a.recordedAt - b.recordedAt);
  let cumulative = 0;
  let totalInput = 0;
  let totalOutput = 0;

  const points = sorted.map((entry, i) => {
    const cost = clampPositive(entry.estimatedCostUsd);
    const input = clampPositive(entry.inputTokens);
    const output = clampPositive(entry.outputTokens);
    cumulative += cost;
    totalInput += input;
    totalOutput += output;

    return {
      index: i + 1,
      recordedAt: entry.recordedAt,
      estimatedCostUsd: cost,
      cumulativeCostUsd: cumulative,
      inputTokens: input,
      outputTokens: output,
    };
  });

  const peakCostUsd = points.reduce(
    (peak, point) => Math.max(peak, point.estimatedCostUsd),
    0,
  );
  const peakTokens = points.reduce(
    (peak, point) => Math.max(peak, point.inputTokens, point.outputTokens),
    0,
  );

  return {
    points,
    peakCostUsd,
    totalCostUsd: cumulative,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    peakTokens,
  };
}
