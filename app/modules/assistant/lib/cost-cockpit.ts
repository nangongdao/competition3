/**
 * ④ 全局成本看板（成本驾驶舱）的纯数据层。
 *
 * 把成本护栏的既有局部能力聚合成一站式驾驶舱：
 *   - 全局预算护栏（月度预算 / 当月已用 / 剩余 / 使用率 / 告警级别）；
 *   - 逐会话成本对比（按成本降序，标注哪些会话已超限 / 接近阈值）；
 *   - 成本趋势外推（基于全局按会话聚合的估算成本做线性外推，给出
 *     「本月末 / 下月」的预测与增量）。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用。
 */

import { computeBudgetGuardrail } from "@/modules/assistant/lib/budget-model";
import type { BudgetGuardrailState } from "@/modules/assistant/lib/budget-model";
import {
  buildMonthSpendSeries,
  projectMonthEndSpend,
  type MonthEndForecast,
  type MonthUsageDay,
} from "@/modules/assistant/lib/global-budget-forecast";
import { buildSessionComparisonSeries } from "@/modules/assistant/lib/session-comparison";
import type {
  SessionComparisonPoint,
  SessionUsageSummary,
} from "@/modules/assistant/lib/session-comparison";

/** 驾驶舱里逐会话条目的超限状态。 */
export type CockpitSessionStatus =
  | "normal"
  | "over-budget"
  | "approaching";

/** 驾驶舱的逐会话成本条目。 */
export type CockpitSessionPoint = SessionComparisonPoint & {
  /** 该会话是否已超限（全局预算阈值判断下的超支会话）。 */
  status: CockpitSessionStatus;
};

/** 驾驶舱趋势外推统计。 */
export type CockpitForecastStats = {
  /** 是否有足够样本做外推（≥ MIN_FIT_POINTS 个会话点）。 */
  valid: boolean;
  /** 拟合点（会话）数。 */
  fitPointCount: number;
  /** 外推天数。 */
  horizonDays: number;
  /** 预测到 horizon 末的累计成本（USD）。 */
  projectedTotalUsd: number;
  /** 当前累计成本（USD）。 */
  currentTotalUsd: number;
  /** 预测增量（USD）。 */
  projectedDeltaUsd: number;
};

/** 驾驶舱聚合结果。 */
export type CostCockpit = {
  /** 全局预算护栏状态。 */
  guardrail: BudgetGuardrailState;
  /** 逐会话成本对比序列（带超限标注）。 */
  comparison: {
    points: readonly CockpitSessionPoint[];
    peakCostUsd: number;
    totalCostUsd: number;
    sessionCount: number;
    totalTurnCount: number;
  };
  /** 已超限会话数。 */
  overBudgetCount: number;
  /** 接近阈值（≥ warn 但未超限）会话数。 */
  approachingBudgetCount: number;
  /** 趋势外推统计（基于会话成本分布）。 */
  forecast: CockpitForecastStats;
  /** 全局月度成本外推 vs 预算（基于当月逐日消费序列，样本不足时 `valid` 为 false）。 */
  monthForecast: MonthEndForecast;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 对逐会话估算成本序列做线性外推（最小二乘），预测未来成本。
 *
 * 会话通常数量有限（≤ 数十个），把「会话序号 → 累计成本」视为时间序列，
 * 用线性回归外推未来 N 天（默认 30 天）的累计成本，用于驾驶舱顶部给出
 * 「若按当前成本节奏，下月预计花费」的粗估。
 *
 * @param sortedCosts 按成本降序的会话估算成本（USD，非负）。
 * @param horizonDays 外推天数。
 * @returns 外推统计；样本 < 3 时 `valid` 为 false。
 */
export function forecastCockpitCosts(
  sortedCosts: readonly number[],
  horizonDays = 30,
): CockpitForecastStats {
  const n = sortedCosts.length;

  if (n < 3) {
    return {
      valid: false,
      fitPointCount: n,
      horizonDays,
      projectedTotalUsd: sortedCosts.reduce((s, c) => s + c, 0),
      currentTotalUsd: sortedCosts.reduce((s, c) => s + c, 0),
      projectedDeltaUsd: 0,
    };
  }

  const cumulative: number[] = [];
  let running = 0;
  for (const cost of sortedCosts) {
    running += clampNonNegative(cost);
    cumulative.push(running);
  }

  const currentTotalUsd = running;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += cumulative[i];
    sumXY += i * cumulative[i];
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;

  if (denom === 0 || !Number.isFinite(denom)) {
    return {
      valid: false,
      fitPointCount: n,
      horizonDays,
      projectedTotalUsd: currentTotalUsd,
      currentTotalUsd,
      projectedDeltaUsd: 0,
    };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  if (!Number.isFinite(slope)) {
    return {
      valid: false,
      fitPointCount: n,
      horizonDays,
      projectedTotalUsd: currentTotalUsd,
      currentTotalUsd,
      projectedDeltaUsd: 0,
    };
  }

  const anchorUsd = Math.max(currentTotalUsd, slope * (n - 1));
  const projectedTotalUsd = clampNonNegative(anchorUsd + slope * horizonDays);
  const projectedDeltaUsd = clampNonNegative(
    projectedTotalUsd - currentTotalUsd,
  );

  return {
    valid: true,
    fitPointCount: n,
    horizonDays,
    projectedTotalUsd,
    currentTotalUsd,
    projectedDeltaUsd,
  };
}

function resolveSessionStatus(
  sessionCostUsd: number,
  guardrail: BudgetGuardrailState,
  sessionCount: number,
): CockpitSessionStatus {
  if (!guardrail.enabled || sessionCount <= 0) {
    return "normal";
  }

  // 单个会话的「预算份额」= 预算按会话数均摊的粗估，仅用于驾驶舱标注。
  const share = guardrail.budgetUsd / sessionCount;

  if (share > 0 && sessionCostUsd >= share) {
    return "over-budget";
  }

  if (share > 0 && sessionCostUsd >= share * (guardrail.alertThresholdPct / 100)) {
    return "approaching";
  }

  return "normal";
}

/**
 * 聚合成本驾驶舱。
 *
 * @param monthlyBudgetUsd 月度预算（USD；0 视为未启用护栏）。
 * @param monthSpentUsd 当月已用（USD）。
 * @param sessions 按会话聚合的用量汇总（来自 `GET /api/sessions/usage/by-session`）。
 * @param alertThresholdPct 告警阈值百分比（默认 80）。
 * @param forecastHorizonDays 趋势外推天数（默认 30）。
 * @param monthSeries 当月逐日消费序列（来自 `GET /api/sessions/usage/budget` 的 `monthSeries`，
 *                    可选；提供时计算全局月度外推 `monthForecast`）。
 * @param now 当前时间戳（ms，用于计算距月末剩余天数；默认 `Date.now()`）。
 * @returns 驾驶舱聚合结果。
 */
export function buildCostCockpit(
  monthlyBudgetUsd: number,
  monthSpentUsd: number,
  sessions: readonly SessionUsageSummary[],
  alertThresholdPct = 80,
  forecastHorizonDays = 30,
  monthSeries?: readonly MonthUsageDay[],
  now: number = Date.now(),
): CostCockpit {
  const guardrail = computeBudgetGuardrail(
    monthlyBudgetUsd,
    monthSpentUsd,
    alertThresholdPct,
  );
  const comparison = buildSessionComparisonSeries(sessions);

  const points: CockpitSessionPoint[] = comparison.points.map((point) => ({
    ...point,
    status: resolveSessionStatus(
      point.estimatedCostUsd,
      guardrail,
      comparison.sessionCount,
    ),
  }));

  const overBudgetCount = points.filter(
    (p) => p.status === "over-budget",
  ).length;
  const approachingBudgetCount = points.filter(
    (p) => p.status === "approaching",
  ).length;

  const forecast = forecastCockpitCosts(
    points.map((p) => p.estimatedCostUsd),
    forecastHorizonDays,
  );

  // 全局月度成本外推：基于当月逐日消费序列做线性回归外推到月末。
  const monthForecast = projectMonthEndSpend(
    buildMonthSpendSeries(monthSeries ?? []),
    monthlyBudgetUsd,
    now,
    { alertThresholdPct },
  );

  return {
    guardrail,
    comparison: {
      points,
      peakCostUsd: comparison.peakCostUsd,
      totalCostUsd: comparison.totalCostUsd,
      sessionCount: comparison.sessionCount,
      totalTurnCount: comparison.totalTurnCount,
    },
    overBudgetCount,
    approachingBudgetCount,
    forecast,
    monthForecast,
  };
}

/** 便捷别名：供文档 / i18n 引用。 */
export const COCKPIT_MIN_FORECAST_POINTS = 3;
export { MS_PER_DAY };
