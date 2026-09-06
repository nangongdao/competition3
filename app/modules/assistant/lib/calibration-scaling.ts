/**
 * 校准回写系数应用到全局成本展示（calibration scaling）。
 *
 * PR #106 落地的校准偏差自动回写（`lib/calibration-writeback.ts`）目前只作用于
 * 会话侧边栏内 `calibration-panel` 展示的「当前会话估算成本」。全局视角的成本展示
 * ——预算护栏 / 成本驾驶舱 / 月度外推 / 预算历史审计 / 跨会话成本对比——仍沿用
 * 未经校准的估算成本（token 用量 × 硬编码单价）。
 *
 * 本模块把已应用的**校准回写系数**（`factor = measured/estimated`）一致地作用到这些
 * 全局成本视图模型上，使校准闭环从「单会话面板」升级为「全局一致」：一旦用户应用
 * 回写，驾驶舱 / 护栏 / 预测 / 历史 / 对比的金额都按校正系数换算，成本治理数据与
 * 实测账单保持一致。
 *
 * 由于前端所有成本都是「估算成本 × 同一系数」，换算遵循一个统一原则：
 *   - 纯成本金额字段：`value × factor`；
 *   - 相对量（使用率 / 占比 / 状态徽标）：基于换算后的金额**重算**；
 *   - 系数非法（非有限 / ≤0 / =1）时退化为原值，保证回写关闭或不合理时不改变展示。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用。
 */

import { computeBudgetGuardrail } from "@/modules/assistant/lib/budget-model";
import type { BudgetGuardrailState } from "@/modules/assistant/lib/budget-model";
import { monthHistoryStatus } from "@/modules/assistant/lib/budget-history";
import type { BudgetHistoryMonth } from "@/modules/assistant/lib/budget-history";
import type {
  CockpitForecastStats,
  CockpitSessionPoint,
  CostCockpit,
} from "@/modules/assistant/lib/cost-cockpit";
import type { MonthEndForecast } from "@/modules/assistant/lib/global-budget-forecast";
import type { SessionComparisonSeries } from "@/modules/assistant/lib/session-comparison";

/**
 * 把金额按校准系数换算。
 *
 * 仅当 `factor` 有效（有限且 ≠1）且金额为正时缩放；否则原样返回（回写关闭或
 * 系数不合理时不改变金额）。
 *
 * @param usd 原始金额（USD）。
 * @param factor 校准系数（>0，≠1 才有意义）。
 * @returns 换算后金额（USD）。
 */
export function scaleCostValue(usd: number, factor: number): number {
  if (!Number.isFinite(usd) || usd <= 0) {
    return 0;
  }
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
    return usd;
  }
  const scaled = usd * factor;
  return Number.isFinite(scaled) && scaled > 0 ? scaled : 0;
}

/** 判断校准系数是否需要应用到成本展示（有效且 ≠1）。 */
export function isCalibrationActive(factor: number): boolean {
  return Number.isFinite(factor) && factor > 0 && factor !== 1;
}

/**
 * 驾驶舱趋势图上的一段「实测区间」标注。
 *
 * 把「原始估算」与「按校准系数换算后的实测口径」同时呈现：
 * `low` = min(估算, 实测)，`high` = max(估算, 实测)，区间两端即估算与实测
 * 两种口径的边界。当校准系数 >1（实测高估）时 low 为估算、high 为实测；
 * 系数 <1（实测低估）时反之。这使评审一眼看出「估算 vs 实测」的漂移范围。
 */
export type MeasuredInterval = {
  /** 区间下界（USD，两种口径的较小值）。 */
  lowUsd: number;
  /** 区间上界（USD，两种口径的较大值）。 */
  highUsd: number;
  /** 当前累计成本的实测口径（USD）。 */
  measuredCurrentUsd: number;
  /** 预测累计成本的实测口径（USD）。 */
  measuredProjectedUsd: number;
};

function intervalFor(costUsd: number, factor: number): {
  lowUsd: number;
  highUsd: number;
} {
  const measured = scaleCostValue(costUsd, factor);
  return {
    lowUsd: Math.min(costUsd, measured),
    highUsd: Math.max(costUsd, measured),
  };
}

/**
 * 为驾驶舱趋势外推标注「实测区间」。
 *
 * 基于当前 / 预测累计成本，结合校准系数，计算「估算 vs 实测」的漂移区间。
 * 系数非法或等于 1（未校准）时返回 null，表示无需标注。
 *
 * @param forecast 驾驶舱趋势外推统计（当前 / 预测累计成本）。
 * @param factor 校准系数。
 * @returns 实测区间标注；未校准或外推无效时返回 null。
 */
export function annotateMeasuredInterval(
  forecast: CockpitForecastStats,
  factor: number,
): MeasuredInterval | null {
  if (!isCalibrationActive(factor) || !forecast.valid) {
    return null;
  }
  const current = intervalFor(forecast.currentTotalUsd, factor);
  const projected = intervalFor(forecast.projectedTotalUsd, factor);
  return {
    lowUsd: current.lowUsd,
    highUsd: projected.highUsd,
    measuredCurrentUsd: scaleCostValue(
      forecast.currentTotalUsd,
      factor,
    ),
    measuredProjectedUsd: scaleCostValue(
      forecast.projectedTotalUsd,
      factor,
    ),
  };
}

/**
 * 对预算护栏状态应用校准系数。
 *
 * 预算金额不随校准变化；受校准影响的是「当月已用」及其派生的剩余 / 使用率 /
 * 告警级别。重算逻辑与 `computeBudgetGuardrail` 一致。
 *
 * @param guardrail 原始护栏状态。
 * @param factor 校准系数。
 * @returns 校准后的护栏状态。
 */
export function scaleBudgetGuardrail(
  guardrail: BudgetGuardrailState,
  factor: number,
): BudgetGuardrailState {
  if (!isCalibrationActive(factor)) {
    return guardrail;
  }
  const scaledSpent = scaleCostValue(guardrail.spentUsd, factor);
  return computeBudgetGuardrail(
    guardrail.budgetUsd,
    scaledSpent,
    guardrail.alertThresholdPct,
  );
}

/**
 * 对跨会话成本对比序列应用校准系数。
 *
 * 所有会话成本按同一系数缩放，因此峰值 / 总额同步缩放，而各点的 `costRatio`
 * （占峰值比例）不变；会话数 / 轮次等非金额字段不变。
 *
 * @param comparison 原始对比序列。
 * @param factor 校准系数。
 * @returns 校准后的对比序列。
 */
export function scaleSessionComparison(
  comparison: SessionComparisonSeries,
  factor: number,
): SessionComparisonSeries {
  if (!isCalibrationActive(factor)) {
    return comparison;
  }
  const points = comparison.points.map((point) => ({
    ...point,
    estimatedCostUsd: scaleCostValue(point.estimatedCostUsd, factor),
  }));
  return {
    ...comparison,
    points,
    peakCostUsd: scaleCostValue(comparison.peakCostUsd, factor),
    totalCostUsd: scaleCostValue(comparison.totalCostUsd, factor),
  };
}

/**
 * 对全局月度成本外推应用校准系数。
 *
 * 换算 `current / projected / delta`，并基于给定月度预算重算「对预算的使用率」
 * （预算不随校准变化）；斜率 / 天数 / 有效标记等非金额字段不变。
 *
 * @param forecast 原始外推结果。
 * @param factor 校准系数。
 * @param monthlyBudgetUsd 月度预算（USD），用于重算使用率；0 或非法时使用率归零。
 * @returns 校准后的外推结果。
 */
export function scaleMonthEndForecast(
  forecast: MonthEndForecast,
  factor: number,
  monthlyBudgetUsd = 0,
): MonthEndForecast {
  if (!isCalibrationActive(factor)) {
    return forecast;
  }
  const currentTotalUsd = scaleCostValue(forecast.currentTotalUsd, factor);
  const projectedMonthEndUsd = scaleCostValue(
    forecast.projectedMonthEndUsd,
    factor,
  );
  const projectedDeltaUsd = Math.max(
    0,
    projectedMonthEndUsd - currentTotalUsd,
  );
  const budget = Number.isFinite(monthlyBudgetUsd)
    ? Math.max(0, monthlyBudgetUsd)
    : 0;
  const projectedUtilizationPct =
    budget > 0 ? (projectedMonthEndUsd / budget) * 100 : 0;

  return {
    ...forecast,
    currentTotalUsd,
    projectedMonthEndUsd,
    projectedDeltaUsd,
    projectedUtilizationPct,
  };
}

/**
 * 对预算历史审计序列应用校准系数。
 *
 * 换算逐月 `spentUsd`，并基于给定告警阈值重算 `usedPct / status / overBudget`；
 * 预算金额不变。
 *
 * @param months 原始历史序列（升序）。
 * @param factor 校准系数。
 * @param alertThresholdPct 判定 high 的使用率阈值（默认 80）。
 * @returns 校准后的历史序列。
 */
export function scaleBudgetHistory(
  months: readonly BudgetHistoryMonth[],
  factor: number,
  alertThresholdPct = 80,
): BudgetHistoryMonth[] {
  if (!isCalibrationActive(factor)) {
    return months as BudgetHistoryMonth[];
  }
  const threshold =
    Number.isFinite(alertThresholdPct) &&
    alertThresholdPct >= 1 &&
    alertThresholdPct <= 100
      ? alertThresholdPct
      : 80;

  return months.map((month) => {
    const spentUsd = scaleCostValue(month.spentUsd, factor);
    const usedPct = month.budgetUsd > 0 ? (spentUsd / month.budgetUsd) * 100 : 0;
    const status = monthHistoryStatus(usedPct, threshold);
    return {
      ...month,
      spentUsd,
      usedPct,
      status,
      overBudget: status === "over",
    };
  });
}

/**
 * 对成本驾驶舱聚合结果应用校准系数。
 *
 * 组合换算护栏 / 对比 / 趋势外推 / 月度外推，并重算「超限 / 接近阈值会话数」。
 *
 * @param cockpit 原始驾驶舱聚合结果。
 * @param factor 校准系数。
 * @returns 校准后的驾驶舱聚合结果。
 */
export function scaleCostCockpit(
  cockpit: CostCockpit,
  factor: number,
): CostCockpit {
  if (!isCalibrationActive(factor)) {
    return cockpit;
  }

  const guardrail = scaleBudgetGuardrail(cockpit.guardrail, factor);
  const comparison = scaleSessionComparison(cockpit.comparison, factor);
  const scaledCurrent = scaleCostValue(cockpit.forecast.currentTotalUsd, factor);
  const scaledProjected = scaleCostValue(
    cockpit.forecast.projectedTotalUsd,
    factor,
  );
  const forecast = {
    ...cockpit.forecast,
    currentTotalUsd: scaledCurrent,
    projectedTotalUsd: scaledProjected,
    projectedDeltaUsd: Math.max(0, scaledProjected - scaledCurrent),
  };
  const monthForecast = scaleMonthEndForecast(
    cockpit.monthForecast,
    factor,
    guardrail.budgetUsd,
  );

  // 重算逐会话超限 / 接近阈值状态（与 cost-cockpit.ts 的 resolveSessionStatus 一致）。
  const points: CockpitSessionPoint[] = comparison.points.map((point) => ({
    ...point,
    status: resolveCockpitSessionStatus(
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

  return {
    ...cockpit,
    guardrail,
    comparison: { ...comparison, points },
    overBudgetCount,
    approachingBudgetCount,
    forecast,
    monthForecast,
  };
}

/** 逐会话「预算份额」判定（与 cost-cockpit.ts 内部逻辑保持一致）。 */
function resolveCockpitSessionStatus(
  sessionCostUsd: number,
  guardrail: BudgetGuardrailState,
  sessionCount: number,
): "normal" | "over-budget" | "approaching" {
  if (!guardrail.enabled || sessionCount <= 0) {
    return "normal";
  }
  const share = guardrail.budgetUsd / sessionCount;
  if (share > 0 && sessionCostUsd >= share) {
    return "over-budget";
  }
  if (
    share > 0 &&
    sessionCostUsd >= share * (guardrail.alertThresholdPct / 100)
  ) {
    return "approaching";
  }
  return "normal";
}
