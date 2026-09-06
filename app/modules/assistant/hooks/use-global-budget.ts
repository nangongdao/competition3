import { useCallback, useEffect, useState } from "react";

import {
  computeBudgetGuardrail,
  type BudgetGuardrailState,
} from "@/modules/assistant/lib/budget-model";
import { buildCostCockpit, type CostCockpit } from "@/modules/assistant/lib/cost-cockpit";
import {
  buildMonthSpendSeries,
  projectMonthEndSpend,
  type MonthEndForecast,
} from "@/modules/assistant/lib/global-budget-forecast";
import {
  buildBudgetHistory,
  type BudgetHistoryMonth,
} from "@/modules/assistant/lib/budget-history";
import {
  buildSessionComparisonSeries,
  type SessionComparisonSeries,
  type SessionUsageSummary,
} from "@/modules/assistant/lib/session-comparison";
import {
  getGlobalBudgetView,
  getSessionUsageSummaries,
  updateGlobalBudget,
  type BudgetView,
} from "@/modules/assistant/lib/session-client";

export type UseGlobalBudgetOptions = {
  /** 会话列表是否已从后端加载完成（决定何时拉取预算/对比）。 */
  isLoaded: boolean;
};

export type UseGlobalBudgetResult = {
  /** 预算护栏状态（未加载或未启用时为 disabled）。 */
  guardrail: BudgetGuardrailState;
  /** 当月用量汇总（未加载为 null）。 */
  monthSpentUsd: number;
  /** 全局月度成本外推 vs 预算（样本不足或未启用预算时 `valid` 为 false）。 */
  monthEndForecast: MonthEndForecast;
  /** 跨会话成本对比序列。 */
  comparison: SessionComparisonSeries;
  /** ④ 全局成本看板（成本驾驶舱）聚合结果。 */
  costCockpit: CostCockpit | null;
  /** ⑤ 预算历史审计序列（最近 N 个月 vs 月度预算）。 */
  budgetHistory: readonly BudgetHistoryMonth[];
  /** 保存预算配置（写入成功后刷新护栏视图）。 */
  saveBudget: (params: {
    monthlyBudgetUsd: number;
    alertThresholdPct: number;
  }) => Promise<void>;
  /** 是否正在保存预算配置。 */
  isSavingBudget: boolean;
};

/**
 * ①③ 全局成本护栏 + 跨会话成本对比状态 hook。
 *
 * 收敛「预算护栏 + 按会话成本对比」两段状态：
 *   - 会话加载完成后拉取 `GET /api/sessions/usage/budget`（预算 + 当月用量）
 *     与 `GET /api/sessions/usage/by-session`（按会话聚合）；
 *   - 用纯函数 `computeBudgetGuardrail` / `buildSessionComparisonSeries` 折叠。
 */
export function useGlobalBudget({
  isLoaded,
}: UseGlobalBudgetOptions): UseGlobalBudgetResult {
  const [budgetView, setBudgetView] = useState<BudgetView | null>(null);
  const [sessionSummaries, setSessionSummaries] = useState<
    SessionUsageSummary[] | null
  >(null);
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    void getGlobalBudgetView().then((view) => {
      if (view !== null) {
        setBudgetView(view);
      }
    });
    void getSessionUsageSummaries().then((summaries) => {
      if (summaries !== null) {
        setSessionSummaries(summaries);
      }
    });
  }, [isLoaded]);

  const guardrail = computeBudgetGuardrail(
    budgetView?.budget.monthlyBudgetUsd ?? 0,
    budgetView?.month.estimatedCostUsd ?? 0,
    budgetView?.budget.alertThresholdPct ?? 80,
  );

  const monthEndForecast = projectMonthEndSpend(
    buildMonthSpendSeries(budgetView?.monthSeries ?? []),
    budgetView?.budget.monthlyBudgetUsd ?? 0,
    Date.now(),
    { alertThresholdPct: budgetView?.budget.alertThresholdPct ?? 80 },
  );

  const comparison = buildSessionComparisonSeries(sessionSummaries ?? []);

  // ⑤ 预算历史审计：最近 N 个月逐月消费 vs 月度预算。
  const budgetHistory = buildBudgetHistory(
    budgetView?.monthHistory ?? [],
    budgetView?.budget.monthlyBudgetUsd ?? 0,
    budgetView?.budget.alertThresholdPct ?? 80,
  );

  // ④ 成本驾驶舱：聚合预算护栏 + 按会话成本 + 趋势外推 + 全局月度外推。
  const costCockpit =
    budgetView !== null || (sessionSummaries ?? []).length > 0
      ? buildCostCockpit(
          budgetView?.budget.monthlyBudgetUsd ?? 0,
          budgetView?.month.estimatedCostUsd ?? 0,
          sessionSummaries ?? [],
          budgetView?.budget.alertThresholdPct ?? 80,
          30,
          budgetView?.monthSeries,
          Date.now(),
        )
      : null;

  const saveBudget = useCallback(
    async (params: {
      monthlyBudgetUsd: number;
      alertThresholdPct: number;
    }): Promise<void> => {
      setIsSavingBudget(true);
      try {
        const view = await updateGlobalBudget(params);
        if (view !== null) {
          setBudgetView(view);
        }
      } finally {
        setIsSavingBudget(false);
      }
    },
    [],
  );

  return {
    guardrail,
    monthSpentUsd: budgetView?.month.estimatedCostUsd ?? 0,
    monthEndForecast,
    comparison,
    costCockpit,
    budgetHistory,
    saveBudget,
    isSavingBudget,
  };
}
