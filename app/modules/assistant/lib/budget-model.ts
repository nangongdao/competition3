/**
 * ① 全局预算护栏（跨会话成本护栏）的纯数据层。
 *
 * 把「预算配置 + 当月用量」折叠为可供 UI 渲染的护栏状态：
 *   - 已用金额 / 剩余金额 / 使用率；
 *   - 告警状态（normal / warn / over），并给出是否已触发阈值。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用。
 */

export type BudgetAlertLevel = "normal" | "warn" | "over";

export type BudgetGuardrailState = {
  /** 是否启用了护栏（预算 > 0）。 */
  enabled: boolean;
  /** 预算金额（USD）。 */
  budgetUsd: number;
  /** 当月已用金额（USD）。 */
  spentUsd: number;
  /** 剩余金额（USD）。 */
  remainingUsd: number;
  /** 使用率（0–100+，可超过 100）。 */
  usedPct: number;
  /** 告警阈值百分比（0–100）。 */
  alertThresholdPct: number;
  /** 告警级别。 */
  alertLevel: BudgetAlertLevel;
  /** 是否达到/超过告警阈值。 */
  exceededAlertThreshold: boolean;
};

/**
 * 计算预算护栏状态。
 *
 * @param monthlyBudgetUsd 预算金额（USD）；0 视为未启用护栏。
 * @param spentUsd 当月已用金额（USD）。
 * @param alertThresholdPct 告警阈值百分比（1–100，默认 80）。
 * @returns 护栏状态。预算为 0 或非法值时返回未启用状态。
 */
export function computeBudgetGuardrail(
  monthlyBudgetUsd: number,
  spentUsd: number,
  alertThresholdPct = 80,
): BudgetGuardrailState {
  const budget =
    Number.isFinite(monthlyBudgetUsd) && monthlyBudgetUsd > 0
      ? monthlyBudgetUsd
      : 0;
  const spent =
    Number.isFinite(spentUsd) && spentUsd > 0 ? spentUsd : 0;
  const threshold =
    Number.isFinite(alertThresholdPct) &&
    alertThresholdPct >= 1 &&
    alertThresholdPct <= 100
      ? alertThresholdPct
      : 80;

  if (budget <= 0) {
    return {
      enabled: false,
      budgetUsd: 0,
      spentUsd: spent,
      remainingUsd: 0,
      usedPct: 0,
      alertThresholdPct: threshold,
      alertLevel: "normal",
      exceededAlertThreshold: false,
    };
  }

  const usedPct = (spent / budget) * 100;
  const remainingUsd = Math.max(0, budget - spent);
  const exceededAlertThreshold = usedPct >= threshold;
  const alertLevel: BudgetAlertLevel =
    usedPct >= 100 ? "over" : exceededAlertThreshold ? "warn" : "normal";

  return {
    enabled: true,
    budgetUsd: budget,
    spentUsd: spent,
    remainingUsd,
    usedPct,
    alertThresholdPct: threshold,
    alertLevel,
    exceededAlertThreshold,
  };
}

/**
 * 计算预算进度条的填充百分比（封顶在 100，供进度条视觉使用）。
 * 超预算时仍显示满格，但通过颜色/告警级别区分。
 */
export function budgetProgressPct(guardrail: BudgetGuardrailState): number {
  return Math.min(100, guardrail.usedPct);
}
