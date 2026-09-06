/**
 * 成本告警通知的纯数据层。
 *
 * 把「预算护栏（warn/over）+ 全局月度外推（at-risk/over-budget）+ 预算历史审计
 * （high/over）」等既有成本治理信号折叠为可去重、可归档的**通知项**，供
 * `use-cost-alert-notifications` / `CostAlertCenter` 消费：
 *   - 每次只对「新出现的告警」生成一条通知（同源同级别去重）；
 *   - 每条通知带稳定 key（source + level），便于「已读/已忽略」去重；
 *   - 支持 severity 排序与轻量文案派生。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用。
 */

import type { BudgetGuardrailState } from "@/modules/assistant/lib/budget-model";
import type { MonthEndForecast } from "@/modules/assistant/lib/global-budget-forecast";
import type { BudgetHistoryMonth } from "@/modules/assistant/lib/budget-history";
import type { CalibrationWriteback } from "@/modules/assistant/lib/calibration-writeback";

/** 通知严重级别：低（info）/ 中（warning）/ 高（critical）。 */
export type CostAlertSeverity = "info" | "warning" | "critical";

/** 告警来源：预算护栏 / 全局月度外推 / 预算历史审计 / 成本驾驶舱 / 成本校准回写。 */
export type CostAlertSource =
  | "budget"
  | "forecast"
  | "history"
  | "cockpit"
  | "calibration";

/** 一条成本告警通知项。 */
export type CostAlertItem = {
  /** 稳定唯一键（source + level），用于去重与归档。 */
  key: string;
  /** 来源。 */
  source: CostAlertSource;
  /** 严重级别。 */
  severity: CostAlertSeverity;
  /** i18n 标题键（形如 `costAlert.budgetWarnTitle`）。 */
  titleKey: string;
  /** i18n 描述键（形如 `costAlert.budgetOverDesc`）；可含 `{pct}` 等插值。 */
  descriptionKey: string;
  /** 关联数值（用于 i18n 插值，如使用率 / 预计花费）。 */
  metricUsd?: number;
  /** 关联百分比（用于 i18n 插值，如使用率 / 预计使用率）。 */
  metricPct?: number;
};

/** 派生成本告警的输入（来自 `useGlobalBudget` / `useGlobalUsage`）。 */
export type CostAlertInput = {
  /** 全局预算护栏状态。 */
  guardrail: BudgetGuardrailState;
  /** 全局月度成本外推 vs 预算（`valid` 为 false 时忽略预测类告警）。 */
  monthEndForecast?: MonthEndForecast | null;
  /** 预算历史审计序列（最近 N 个月 vs 月度预算）。 */
  budgetHistory?: readonly BudgetHistoryMonth[];
  /** 成本校准回写状态（已回写系数时提示估算单价被校正；需校准未回写时提示）。 */
  calibrationWriteback?: CalibrationWriteback | null;
  /** 当前校准视图是否「需校准」（偏差超阈值）。 */
  calibrationNeedsWriteback?: boolean;
};

const MAX_HISTORY_ALERTS = 1;

function severityRank(severity: CostAlertSeverity): number {
  switch (severity) {
    case "critical":
      return 3;
    case "warning":
      return 2;
    default:
      return 1;
  }
}

/**
 * 根据护栏告警级别派生一条通知项（warn → warning，over → critical）。
 * 未启用护栏或级别 normal 时返回 null。
 */
function guardrailAlert(
  guardrail: BudgetGuardrailState,
): CostAlertItem | null {
  if (!guardrail.enabled) {
    return null;
  }

  if (guardrail.alertLevel === "over") {
    return {
      key: "budget:over",
      source: "budget",
      severity: "critical",
      titleKey: "usage.costAlert.budgetOverTitle",
      descriptionKey: "usage.costAlert.budgetOverDesc",
      metricPct: guardrail.usedPct,
    };
  }

  if (guardrail.alertLevel === "warn") {
    return {
      key: "budget:warn",
      source: "budget",
      severity: "warning",
      titleKey: "usage.costAlert.budgetWarnTitle",
      descriptionKey: "usage.costAlert.budgetWarnDesc",
      metricPct: guardrail.usedPct,
    };
  }

  return null;
}

/**
 * 根据全局月度外推状态派生一条通知项（at-risk → warning，over-budget → critical）。
 * 预算未启用 / 预测无效时返回 null。
 */
function forecastAlert(
  forecast: MonthEndForecast | null | undefined,
): CostAlertItem | null {
  if (forecast === null || forecast === undefined || !forecast.valid) {
    return null;
  }

  if (forecast.status === "over-budget") {
    return {
      key: "forecast:over-budget",
      source: "forecast",
      severity: "critical",
      titleKey: "usage.costAlert.forecastOverTitle",
      descriptionKey: "usage.costAlert.forecastOverDesc",
      metricUsd: forecast.projectedMonthEndUsd,
      metricPct: forecast.projectedUtilizationPct,
    };
  }

  if (forecast.status === "at-risk") {
    return {
      key: "forecast:at-risk",
      source: "forecast",
      severity: "warning",
      titleKey: "usage.costAlert.forecastRiskTitle",
      descriptionKey: "usage.costAlert.forecastRiskDesc",
      metricUsd: forecast.projectedMonthEndUsd,
      metricPct: forecast.projectedUtilizationPct,
    };
  }

  return null;
}

/**
 * 根据预算历史审计序列派生通知项。仅对**最近月份**（序列末尾）的超限 / 趋紧
 * 生成一条通知，避免把历史每个超限月都刷成一堆通知。最多输出 1 条。
 */
function historyAlert(
  history: readonly BudgetHistoryMonth[] | undefined,
): CostAlertItem | null {
  if (history === undefined || history.length === 0) {
    return null;
  }

  const latest = history[history.length - 1];
  if (latest === undefined || latest === null) {
    return null;
  }

  if (latest.status === "over") {
    return {
      key: "history:over",
      source: "history",
      severity: "warning",
      titleKey: "usage.costAlert.historyOverTitle",
      descriptionKey: "usage.costAlert.historyOverDesc",
      metricPct: latest.usedPct,
    };
  }

  if (latest.status === "high") {
    return {
      key: "history:high",
      source: "history",
      severity: "info",
      titleKey: "usage.costAlert.historyHighTitle",
      descriptionKey: "usage.costAlert.historyHighDesc",
      metricPct: latest.usedPct,
    };
  }

  return null;
}

/**
 * 根据成本校准回写状态派生一条通知项。
 *   - 已回写系数时 → info（提示估算单价已按校准系数校正）；
 *   - 偏差超阈值但尚未回写 → warning（建议自动回写校正估算单价）。
 * 无回写且不需校准 → null。
 */
function calibrationAlert(
  writeback: CalibrationWriteback | null | undefined,
  needsWriteback: boolean | undefined,
): CostAlertItem | null {
  if (writeback?.applied === true) {
    return {
      key: "calibration:writeback-applied",
      source: "calibration",
      severity: "info",
      titleKey: "usage.costAlert.calibrationWritebackTitle",
      descriptionKey: "usage.costAlert.calibrationWritebackDesc",
      metricPct: Number.isFinite(writeback.totalRelativeDeltaPct)
        ? Math.abs(writeback.totalRelativeDeltaPct)
        : 0,
    };
  }

  if (needsWriteback === true) {
    return {
      key: "calibration:needs-writeback",
      source: "calibration",
      severity: "warning",
      titleKey: "usage.costAlert.calibrationNeedsWritebackTitle",
      descriptionKey: "usage.costAlert.calibrationNeedsWritebackDesc",
    };
  }

  return null;
}

/**
 * 折叠成本治理信号为一条按严重级别降序排列的去重通知列表。
 *
 * 同一来源同一级别只保留一条（源模块本身已聚合到单一状态）。
 *
 * @param input 成本告警输入。
 * @returns 按严重级别（critical > warning > info）降序的通知项。
 */
export function deriveCostAlerts(input: CostAlertInput): CostAlertItem[] {
  const items: CostAlertItem[] = [];

  const fromGuardrail = guardrailAlert(input.guardrail);
  if (fromGuardrail !== null) {
    items.push(fromGuardrail);
  }

  const fromForecast = forecastAlert(input.monthEndForecast);
  if (fromForecast !== null) {
    items.push(fromForecast);
  }

  const fromHistory = historyAlert(input.budgetHistory);
  if (fromHistory !== null) {
    items.push(fromHistory);
  }

  const fromCalibration = calibrationAlert(
    input.calibrationWriteback,
    input.calibrationNeedsWriteback,
  );
  if (fromCalibration !== null) {
    items.push(fromCalibration);
  }

  const seen = new Set<string>();
  const deduped: CostAlertItem[] = [];
  for (const item of items) {
    if (seen.has(item.key)) {
      continue;
    }
    seen.add(item.key);
    deduped.push(item);
  }

  // 按严重级别降序，同级保持来源稳定顺序。
  deduped.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  // 超出可展示上限时只保留最严重的若干条。
  return deduped.slice(0, MAX_HISTORY_ALERTS + 2);
}
