/**
 * ③ 跨会话成本对比的纯数据层。
 *
 * 把「按会话聚合的用量汇总」（`SessionUsageSummaryRecord`，来自
 * `GET /api/sessions/usage/by-session`）折叠为可供横向对比图表渲染的序列：
 *   - 按估算成本降序的会话条目；
 *   - 为条形图提供归一化依据的峰值成本；
 *   - 总量（总成本 / 总轮次 / 会话数）。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用。
 */

export type SessionUsageSummary = {
  sessionId: string;
  title: string;
  providerMode: "chat" | "realtime";
  turnCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  lastRecordedAt: number;
};

export type SessionComparisonPoint = {
  sessionId: string;
  title: string;
  providerMode: "chat" | "realtime";
  turnCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  /** 占峰值成本的比例（0–1，供条形图归一化）。 */
  costRatio: number;
};

export type SessionComparisonSeries = {
  /** 按估算成本降序排列的会话条目。 */
  points: readonly SessionComparisonPoint[];
  /** 峰值会话成本（用于 y 轴/条形归一化；无数据时为 0）。 */
  peakCostUsd: number;
  /** 跨会话总成本（USD）。 */
  totalCostUsd: number;
  /** 参与对比的会话数。 */
  sessionCount: number;
  /** 总轮次。 */
  totalTurnCount: number;
};

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 构建跨会话成本对比序列。
 *
 * @param sessions 按会话聚合的用量汇总（来自后端，按估算成本降序）。
 * @returns 对比序列；无数据时返回空 points 且各总量为 0。
 */
export function buildSessionComparisonSeries(
  sessions: readonly SessionUsageSummary[],
): SessionComparisonSeries {
  const sorted = [...sessions].sort(
    (a, b) => b.estimatedCostUsd - a.estimatedCostUsd,
  );
  const peakCostUsd = sorted.reduce(
    (peak, item) => Math.max(peak, clampNonNegative(item.estimatedCostUsd)),
    0,
  );

  const points = sorted.map((item) => {
    const cost = clampNonNegative(item.estimatedCostUsd);
    return {
      sessionId: item.sessionId,
      title: item.title,
      providerMode: item.providerMode,
      turnCount: item.turnCount,
      inputTokens: clampNonNegative(item.inputTokens),
      outputTokens: clampNonNegative(item.outputTokens),
      estimatedCostUsd: cost,
      costRatio: peakCostUsd > 0 ? cost / peakCostUsd : 0,
    };
  });

  const totalCostUsd = points.reduce((sum, p) => sum + p.estimatedCostUsd, 0);
  const totalTurnCount = points.reduce((sum, p) => sum + p.turnCount, 0);

  return {
    points,
    peakCostUsd,
    totalCostUsd,
    sessionCount: points.length,
    totalTurnCount,
  };
}
