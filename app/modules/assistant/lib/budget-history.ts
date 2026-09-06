/**
 * 预算历史审计的纯数据层。
 *
 * 把「最近 N 个自然月逐月用量汇总」与「月度预算」折叠为可审计的历史序列：
 *   - 逐月消费金额 vs 月度预算 → 使用率 + 状态徽标（normal / high / over）；
 *   - 给出「总历史消费 / 超限月份数 / 接近阈值月份数」的摘要。
 *
 * 与 `global-budget-forecast.ts`（未来前瞻）互补，本模块回答「过去花得怎么样」，
 * 为预算决策提供审计依据。纯函数、无副作用，便于单测与在 hook / 组件间复用。
 */

/** 某自然月的用量汇总（来自 `GET /api/sessions/usage/budget` 的 `monthHistory`）。 */
export type MonthUsageSummary = {
  monthKey: string;
  turnCount: number;
  estimatedCostUsd: number;
  inputTokens: number;
  outputTokens: number;
};

/** 预算历史中单月的审计条目。 */
export type BudgetHistoryMonth = {
  /** 自然月键，形如 `YYYY-MM`。 */
  monthKey: string;
  /** 用户可读月份标签（形如 `2026-08`）。 */
  monthLabel: string;
  /** 当月消费（USD）。 */
  spentUsd: number;
  /** 月度预算（USD）；未设置（0）时为 0。 */
  budgetUsd: number;
  /** 当月对预算的使用率（0–100+；预算 0 时为 0）。 */
  usedPct: number;
  /** 当月轮次数。 */
  turnCount: number;
  /** 审计状态徽标。 */
  status: BudgetHistoryStatus;
  /** 是否超限（usedPct ≥ 100）。 */
  overBudget: boolean;
};

/** 单月预算使用状态：normal / high（≥阈值未超限）/ over（超限）。 */
export type BudgetHistoryStatus = "normal" | "high" | "over";

/** 预算历史摘要。 */
export type BudgetHistorySummary = {
  /** 覆盖的自然月数（含当前）。 */
  monthCount: number;
  /** 覆盖月份总消费（USD）。 */
  totalSpentUsd: number;
  /** 超限月份数。 */
  overCount: number;
  /** 接近阈值（≥阈值未超限）月份数。 */
  highCount: number;
};

/** 由使用率派生历史状态。 */
export function monthHistoryStatus(
  usedPct: number,
  thresholdPct = 80,
): BudgetHistoryStatus {
  const used = Number.isFinite(usedPct) ? usedPct : 0;
  const threshold =
    Number.isFinite(thresholdPct) && thresholdPct >= 1 && thresholdPct <= 100
      ? thresholdPct
      : 80;

  if (used >= 100) {
    return "over";
  }
  if (used >= threshold) {
    return "high";
  }
  return "normal";
}

/** 把 `YYYY-MM` 转为展示标签（原样保留，供前端直接显示）。 */
function toMonthLabel(monthKey: string): string {
  return typeof monthKey === "string" && /^\d{4}-\d{2}$/.test(monthKey)
    ? monthKey
    : monthKey;
}

/**
 * 把最近 N 个自然月用量折叠为预算历史审计序列（按月份升序）。
 *
 * @param history 后端返回的逐月用量（无需有序）。
 * @param monthlyBudgetUsd 月度预算（USD）；0 视为未启用护栏。
 * @param alertThresholdPct 判定 high 的使用率阈值（默认 80）。
 * @returns 升序排列的逐月审计条目；无数据返回空数组。
 */
export function buildBudgetHistory(
  history: readonly MonthUsageSummary[],
  monthlyBudgetUsd: number,
  alertThresholdPct = 80,
): BudgetHistoryMonth[] {
  const budget = Number.isFinite(monthlyBudgetUsd)
    ? Math.max(0, monthlyBudgetUsd)
    : 0;

  return [...history]
    .filter(
      (row) =>
        row !== null &&
        typeof row?.monthKey === "string" &&
        row.monthKey.length > 0,
    )
    .map((row) => {
      const spentUsd = Number.isFinite(row.estimatedCostUsd)
        ? Math.max(0, row.estimatedCostUsd)
        : 0;
      const usedPct = budget > 0 ? (spentUsd / budget) * 100 : 0;
      const status = monthHistoryStatus(usedPct, alertThresholdPct);
      return {
        monthKey: row.monthKey,
        monthLabel: toMonthLabel(row.monthKey),
        spentUsd,
        budgetUsd: budget,
        usedPct,
        turnCount: Number.isFinite(row.turnCount)
          ? Math.max(0, row.turnCount)
          : 0,
        status,
        overBudget: status === "over",
      };
    })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

/** 汇总预算历史序列（总消费 / 超限月份数 / 接近阈值月份数）。 */
export function monthHistorySummary(
  months: readonly BudgetHistoryMonth[],
): BudgetHistorySummary {
  let totalSpentUsd = 0;
  let overCount = 0;
  let highCount = 0;

  for (const month of months) {
    totalSpentUsd += month.spentUsd;
    if (month.status === "over") {
      overCount += 1;
    } else if (month.status === "high") {
      highCount += 1;
    }
  }

  return {
    monthCount: months.length,
    totalSpentUsd,
    overCount,
    highCount,
  };
}
