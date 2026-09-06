import { useMemo } from "react";

import {
  scaleBudgetGuardrail,
  scaleBudgetHistory,
  scaleCostCockpit,
  scaleCostValue,
  scaleMonthEndForecast,
  scaleSessionComparison,
} from "@/modules/assistant/lib/calibration-scaling";
import type { BudgetGuardrailState } from "@/modules/assistant/lib/budget-model";
import type { BudgetHistoryMonth } from "@/modules/assistant/lib/budget-history";
import type { CostCockpit } from "@/modules/assistant/lib/cost-cockpit";
import type { MonthEndForecast } from "@/modules/assistant/lib/global-budget-forecast";
import type { SessionComparisonSeries } from "@/modules/assistant/lib/session-comparison";

/** `useGlobalBudget` 结果中受校准系数影响的成本视图。 */
export type CalibratableBudgetViews = {
  guardrail: BudgetGuardrailState;
  monthSpentUsd: number;
  monthEndForecast: MonthEndForecast;
  comparison: SessionComparisonSeries;
  costCockpit: CostCockpit | null;
  budgetHistory: readonly BudgetHistoryMonth[];
};

/**
 * 把校准回写系数应用到全局成本视图。
 *
 * 接收 `useGlobalBudget` / `useGlobalUsage` 折叠出的原始成本视图，并依据给定的
 * 校准系数（`factor`）换算各金额字段。该 hook 是纯派生层：不改原始数据，
 * 仅返回按系数校正后的新视图对象；`factor` 非法或等于 1（未回写）时原样返回。
 *
 * 各字段换算委托给 `lib/calibration-scaling.ts` 的纯函数，本 hook 只负责组合与
 * memo 化，便于在驾驶舱 / 侧边栏等全局成本展示处复用同一套校准逻辑。
 *
 * @param views 原始全局成本视图（未校准）。
 * @param factor 校准回写系数（>0 且 ≠1 才有意义；否则视为未回写）。
 * @param alertThresholdPct 预算历史判定 high 的阈值（默认 80）。
 * @returns 校准后的全局成本视图。
 */
export function useCalibratedCost(
  views: CalibratableBudgetViews,
  factor: number,
  alertThresholdPct = 80,
): CalibratableBudgetViews {
  return useMemo(() => {
    const guardrail = scaleBudgetGuardrail(views.guardrail, factor);
    return {
      guardrail,
      monthSpentUsd: scaleCostValue(views.monthSpentUsd, factor),
      monthEndForecast: scaleMonthEndForecast(
        views.monthEndForecast,
        factor,
        views.guardrail.budgetUsd,
      ),
      comparison: scaleSessionComparison(views.comparison, factor),
      costCockpit:
        views.costCockpit !== null
          ? scaleCostCockpit(views.costCockpit, factor)
          : null,
      budgetHistory: scaleBudgetHistory(
        views.budgetHistory,
        factor,
        alertThresholdPct,
      ),
    };
  }, [views, factor, alertThresholdPct]);
}
