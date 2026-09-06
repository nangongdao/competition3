import { useEffect, useMemo, useState } from "react";

import {
  buildCalibratedGlobalUsageExport,
  buildCalibratedSessionUsageExport,
  type UsageExportBundle,
} from "@/modules/assistant/lib/usage-export";
import { buildUsageTrendSeries, type UsageTrendSeries } from "@/modules/assistant/lib/usage-trend";
import type { UsageTotals } from "@/modules/assistant/lib/session-client";
import { parseBudgetInput } from "@/modules/assistant/lib/budget-guard";

/** localStorage 中会话成本预算的存储键。 */
export const SESSION_BUDGET_STORAGE_KEY = "assistant.session-budget-usd";

export type UseGlobalUsageOptions = {
  /** 会话列表是否已从后端加载完成（决定何时拉取全局累计）。 */
  isLoaded: boolean;
  /** 当前会话 id（无则 null）。 */
  activeSessionId: string | null;
  /** 读取跨会话累计用量汇总。 */
  loadGlobalUsageTotals: () => Promise<UsageTotals | null>;
  /** 读取当前会话的持久化用量记录与汇总。 */
  restoreUsage: () => Promise<{
    entries: readonly {
      id: string;
      sessionId: string;
      mode: "chat" | "realtime";
      inputTokens: number;
      inputTextTokens: number;
      inputAudioTokens: number;
      inputImageTokens: number;
      cachedInputTokens: number;
      cachedTextTokens: number;
      cachedAudioTokens: number;
      cachedImageTokens: number;
      outputTokens: number;
      outputTextTokens: number;
      outputAudioTokens: number;
      estimatedCostUsd: number;
      recordedAt: number;
    }[];
    totals: UsageTotals;
  } | null>;
  /** 已应用的校准回写系数（未回写为 1）；用于把导出的估算成本换算为实测口径。 */
  calibrationFactor?: number;
};

export type UseGlobalUsageResult = {
  /** 跨会话累计用量汇总；null 表示未加载成功。 */
  globalUsageTotals: UsageTotals | null;
  /** 全局累计用量导出 bundle（JSON/CSV）。 */
  globalUsageExport: UsageExportBundle | null;
  /** 会话级用量导出 bundle（当前会话持久化用量记录）。 */
  sessionUsageExport: UsageExportBundle | null;
  /**
   * 会话级用量趋势序列（② 功能增量）。
   * 当前会话有持久化用量记录时产出，供用量面板渲染趋势图表。
   */
  sessionUsageTrend: UsageTrendSeries | null;
  /**
   * 会话级成本预算上限（USD）；null 表示未设置。
   * 作为 UI 偏好持久化到 localStorage，会话切换/刷新后保留。
   */
  budgetUsd: number | null;
  /** 设置（>0）/清除（null）会话成本预算。 */
  setBudget: (usd: number | null) => void;
};

/**
 * ②③ 用量视图状态 hook。
 *
 * 收敛 `assistant-workspace` 中「全局累计用量 + 会话级用量导出」的两段
 * useEffect / useMemo 状态逻辑：
 *   - 会话加载完成后拉取全局跨会话累计用量（`GET /api/sessions/usage/totals`）；
 *   - 当前会话切换/恢复后读取持久化用量记录，构建会话级导出 bundle；
 *   - 全局导出 bundle 由 `buildGlobalUsageExport` 纯函数构建。
 */
export function useGlobalUsage({
  isLoaded,
  activeSessionId,
  loadGlobalUsageTotals,
  restoreUsage,
  calibrationFactor = 1,
}: UseGlobalUsageOptions): UseGlobalUsageResult {
  const [globalUsageTotals, setGlobalUsageTotals] = useState<UsageTotals | null>(
    null,
  );
  const [sessionUsageExport, setSessionUsageExport] =
    useState<UsageExportBundle | null>(null);
  const [sessionUsageTrend, setSessionUsageTrend] =
    useState<UsageTrendSeries | null>(null);
  // 会话成本预算：作为 UI 偏好持久化到 localStorage（惰性初始化 + 校验）。
  const [budgetUsd, setBudgetUsd] = useState<number | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      return parseBudgetInput(
        window.localStorage.getItem(SESSION_BUDGET_STORAGE_KEY),
      );
    } catch {
      return null;
    }
  });

  const setBudget = (usd: number | null): void => {
    const next = parseBudgetInput(usd);
    setBudgetUsd(next);
    if (typeof window === "undefined") {
      return;
    }
    try {
      if (next === null) {
        window.localStorage.removeItem(SESSION_BUDGET_STORAGE_KEY);
      } else {
        window.localStorage.setItem(SESSION_BUDGET_STORAGE_KEY, String(next));
      }
    } catch {
      // localStorage 不可用（隐私模式等）时忽略，仅内存态生效。
    }
  };

  // ② 全局累计用量：会话加载完成后读取跨会话累计汇总（供侧边栏视图展示）。
  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    void loadGlobalUsageTotals().then((totals) => {
      if (totals !== null) {
        setGlobalUsageTotals(totals);
      }
    });
  }, [isLoaded, loadGlobalUsageTotals]);

  // ② 全局累计用量导出 bundle（JSON/CSV），按校准回写系数换算为实测口径。
  const globalUsageExport = useMemo(() => {
    if (globalUsageTotals === null) {
      return null;
    }

    return buildCalibratedGlobalUsageExport(
      globalUsageTotals,
      calibrationFactor,
    );
  }, [globalUsageTotals, calibrationFactor]);

  // ③ 会话级用量导出：当前会话有持久化用量时构建导出 bundle。
  useEffect(() => {
    if (!isLoaded || activeSessionId === null) {
      setSessionUsageExport(null);
      return;
    }

    void restoreUsage().then((usage) => {
      if (usage === null || usage.entries.length === 0) {
        setSessionUsageExport(null);
        setSessionUsageTrend(null);
        return;
      }
      setSessionUsageExport(
        buildCalibratedSessionUsageExport(
          activeSessionId,
          usage.entries,
          usage.totals,
          calibrationFactor,
        ),
      );
      setSessionUsageTrend(buildUsageTrendSeries(usage.entries));
    });
  }, [isLoaded, activeSessionId, restoreUsage, calibrationFactor]);

  return {
    globalUsageTotals,
    globalUsageExport,
    sessionUsageExport,
    sessionUsageTrend,
    budgetUsd,
    setBudget,
  };
}
