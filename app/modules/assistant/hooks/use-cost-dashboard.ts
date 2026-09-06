import { useEffect, useRef } from "react";
import { useSessions } from "@/modules/assistant/hooks/use-sessions";
import { useGlobalUsage } from "@/modules/assistant/hooks/use-global-usage";
import { useGlobalBudget } from "@/modules/assistant/hooks/use-global-budget";
import {
  CALIBRATION_WRITEBACK_STORAGE_KEY,
  parseStoredCalibrationWriteback,
} from "@/modules/assistant/lib/calibration-writeback";
import { useCalibratedCost } from "@/modules/assistant/hooks/use-calibrated-cost";
import type { UseGlobalUsageResult } from "@/modules/assistant/hooks/use-global-usage";
import type { UseGlobalBudgetResult } from "@/modules/assistant/hooks/use-global-budget";

/**
 * 成本驾驶舱页面聚合 hook。
 *
 * 自包含地组合「会话加载 → 全局用量 / 预算护栏 / 成本驾驶舱 / 预算历史」的
 * 取数与状态，供 `/costs` 驾驶舱页面复用，避免重复接线同一批成本数据。
 *
 * 驾驶舱只关心全局/跨会话视角，不依赖具体会话内容，故不引入会话消息恢复
 * 等 workspace 专属编排，仅以 `initialize` 建立会话列表以获取 `isLoaded`。
 *
 * 若已应用校准回写（localStorage 中的 `assistant.calibration-writeback`），
 * 返回的预算视图会按校正系数换算，使驾驶舱金额与实测账单一致。
 */
export type UseCostDashboardResult = {
  /** 是否已从后端完成会话加载（决定各成本数据何时拉取）。 */
  isLoaded: boolean;
  /** 全局跨会话累计用量 + 导出。 */
  globalUsage: Pick<
    UseGlobalUsageResult,
    "globalUsageTotals" | "globalUsageExport"
  >;
  /** 全局预算护栏 + 驾驶舱 + 预算历史 + 月度外推 + 跨会话对比。 */
  budget: Pick<
    UseGlobalBudgetResult,
    | "guardrail"
    | "monthSpentUsd"
    | "monthEndForecast"
    | "comparison"
    | "costCockpit"
    | "budgetHistory"
    | "saveBudget"
    | "isSavingBudget"
  >;
  /** 当前应用的校准回写系数（未回写为 1）。 */
  calibrationFactor: number;
};

export function useCostDashboard(): UseCostDashboardResult {
  const { sessionState, initialize, loadGlobalUsageTotals, restoreUsage } =
    useSessions();

  // 首次挂载时建立会话列表，使 isLoaded 就绪以触发成本数据拉取。
  // ref 防 StrictMode 双执行。
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;
    void initialize();
  }, [initialize]);

  const globalUsage = useGlobalUsage({
    isLoaded: sessionState.isLoaded,
    activeSessionId: sessionState.activeSessionId,
    loadGlobalUsageTotals,
    restoreUsage,
  });

  const budget = useGlobalBudget({
    isLoaded: sessionState.isLoaded,
  });

  // 读取已应用的校准回写系数（未回写或读取失败 → 1，即不校正）。
  const calibrationFactor = readPersistedCalibrationFactor();

  // 对全局成本视图应用校准回写系数，使驾驶舱金额与实测账单一致。
  const calibrated = useCalibratedCost(
    {
      guardrail: budget.guardrail,
      monthSpentUsd: budget.monthSpentUsd,
      monthEndForecast: budget.monthEndForecast,
      comparison: budget.comparison,
      costCockpit: budget.costCockpit,
      budgetHistory: budget.budgetHistory,
    },
    calibrationFactor,
    budget.guardrail.alertThresholdPct,
  );

  return {
    isLoaded: sessionState.isLoaded,
    globalUsage: {
      globalUsageTotals: globalUsage.globalUsageTotals,
      globalUsageExport: globalUsage.globalUsageExport,
    },
    budget: {
      guardrail: calibrated.guardrail,
      monthSpentUsd: calibrated.monthSpentUsd,
      monthEndForecast: calibrated.monthEndForecast,
      comparison: calibrated.comparison,
      costCockpit: calibrated.costCockpit,
      budgetHistory: calibrated.budgetHistory,
      saveBudget: budget.saveBudget,
      isSavingBudget: budget.isSavingBudget,
    },
    calibrationFactor,
  };
}

/** 从 localStorage 读取已应用的校准回写系数（未回写/读取失败 → 1）。 */
function readPersistedCalibrationFactor(): number {
  if (typeof window === "undefined") {
    return 1;
  }
  try {
    const stored = window.localStorage.getItem(
      CALIBRATION_WRITEBACK_STORAGE_KEY,
    );
    const writeback = parseStoredCalibrationWriteback(stored);
    return writeback.applied && Number.isFinite(writeback.factor)
      ? writeback.factor
      : 1;
  } catch {
    return 1;
  }
}
