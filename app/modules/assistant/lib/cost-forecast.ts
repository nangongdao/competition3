/**
 * ② 成本趋势外推/预测的纯数据层。
 *
 * 基于既有趋势序列（`UsageTrendSeries`）的累计成本或单轮成本序列，用
 * 最小二乘线性回归外推未来成本，估算「本月剩余 / 下月 / 指定天数后」的
 * 预测成本，并把外推线与历史累计成本叠加，供轻量 SVG 图表渲染。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用。
 */

import type { UsageTrendSeries } from "@/modules/assistant/lib/usage-trend";

export type ForecastHorizon = "remaining-month" | "next-month" | "fixed-days";

export type CostForecast = {
  /** 拟合斜率（USD / 记录点）。 */
  slopeUsdPerPoint: number;
  /** 拟合截距（USD）。 */
  interceptUsd: number;
  /** 已用历史点数（不足拟合最小样本时为 0）。 */
  fitPointCount: number;
  /** 是否为有效预测（样本数足够且斜率有限）。 */
  valid: boolean;
  /** 预测目标：天数。 */
  horizonDays: number;
  /** 预测到 horizon 末的累计成本（USD）。 */
  projectedTotalUsd: number;
  /** 当前累计成本（USD）。 */
  currentTotalUsd: number;
  /** 预测增量（= projectedTotalUsd - currentTotalUsd）。 */
  projectedDeltaUsd: number;
  /**
   * 外推折线（用于在历史累计成本折线上叠加虚线延伸）。
   * 第一个点为当前累计成本锚点，后续点为未来预测锚点。
   */
  projectionPoints: readonly {
    recordedAt: number;
    cumulativeCostUsd: number;
  }[];
};

/** 线性拟合所需的最少点数（低于该值不作外推，避免过度外推噪声）。 */
export const MIN_FIT_POINTS = 3;

/**
 * 对序列做最小二乘线性回归，返回斜率与截距。
 * x = 0..n-1（按时间顺序的索引），y = 各点累计成本。
 */
function fitLinear(
  cumulativeCosts: readonly number[],
): { slope: number; intercept: number } {
  const n = cumulativeCosts.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += cumulativeCosts[i];
    sumXY += i * cumulativeCosts[i];
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;

  if (denom === 0) {
    return { slope: 0, intercept: n > 0 ? sumY / n : 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 计算某 horizon 对应的外推天数（从最近一个记录点起算）。
 */
export function resolveHorizonDays(
  horizon: ForecastHorizon,
  now: number,
  lastRecordedAt: number,
  fixedDays = 7,
): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const elapsedDays = clampNonNegative((now - lastRecordedAt) / MS_PER_DAY);

  if (horizon === "fixed-days") {
    return Math.max(1, Math.round(fixedDays));
  }

  if (horizon === "next-month") {
    // 从最近记录点到下月同日（或月底）的估算天数 ≈ 剩余天数 + 30。
    return Math.round(elapsedDays + 30);
  }

  // remaining-month：距离月末的天数。
  const endOfMonth = new Date(now);
  endOfMonth.setUTCDate(1);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1);
  endOfMonth.setUTCDate(0);
  endOfMonth.setUTCHours(0, 0, 0, 0);
  const remainingDays = clampNonNegative(
    (endOfMonth.getTime() - now) / MS_PER_DAY,
  );

  return Math.max(1, Math.round(remainingDays));
}

/**
 * 把历史累计成本序列外推，预测 horizon 结束时的累计成本。
 *
 * 用最近 `points.length` 个累计成本做线性回归，按日均增量乘以外推天数
 * 得到未来累计成本（以最近记录点锚定）。
 *
 * @param series 会话/全局趋势序列。
 * @param horizon 预测 horizon。
 * @param now 当前时间戳（ms）。
 * @param options.fixedDays horizon 为 `fixed-days` 时的外推天数。
 * @returns 预测结果；样本不足或数据无效时 `valid` 为 false。
 */
export function forecastCost(
  series: UsageTrendSeries,
  horizon: ForecastHorizon,
  now: number,
  options?: { fixedDays?: number },
): CostForecast {
  const points = series.points;

  if (points.length < MIN_FIT_POINTS) {
    return {
      slopeUsdPerPoint: 0,
      interceptUsd: 0,
      fitPointCount: points.length,
      valid: false,
      horizonDays: 0,
      projectedTotalUsd: series.totalCostUsd,
      currentTotalUsd: series.totalCostUsd,
      projectedDeltaUsd: 0,
      projectionPoints: [],
    };
  }

  const cumulativeCosts = points.map((point) =>
    clampNonNegative(point.cumulativeCostUsd),
  );
  const { slope, intercept } = fitLinear(cumulativeCosts);
  const lastRecordedAt = points[points.length - 1]?.recordedAt ?? now;

  if (!Number.isFinite(slope)) {
    return {
      slopeUsdPerPoint: 0,
      interceptUsd: 0,
      fitPointCount: points.length,
      valid: false,
      horizonDays: 0,
      projectedTotalUsd: series.totalCostUsd,
      currentTotalUsd: series.totalCostUsd,
      projectedDeltaUsd: 0,
      projectionPoints: [],
    };
  }

  const horizonDays = resolveHorizonDays(horizon, now, lastRecordedAt, options?.fixedDays);
  const currentTotalUsd = series.totalCostUsd;
  // 用回归线在最近点处的值作为锚点，外推 horizonDays 天的日均增量。
  const anchorUsd = Math.max(
    currentTotalUsd,
    slope * (points.length - 1) + intercept,
  );
  const projectedTotalUsd = clampNonNegative(
    anchorUsd + slope * horizonDays,
  );
  const projectedDeltaUsd = clampNonNegative(projectedTotalUsd - currentTotalUsd);

  // 外推折线：当前点 → 未来 horizon 终点。
  const projectionPoints = [
    {
      recordedAt: lastRecordedAt,
      cumulativeCostUsd: anchorUsd,
    },
    {
      recordedAt: lastRecordedAt + horizonDays * 24 * 60 * 60 * 1000,
      cumulativeCostUsd: projectedTotalUsd,
    },
  ];

  return {
    slopeUsdPerPoint: slope,
    interceptUsd: intercept,
    fitPointCount: points.length,
    valid: true,
    horizonDays,
    projectedTotalUsd,
    currentTotalUsd,
    projectedDeltaUsd,
    projectionPoints,
  };
}
