/**
 * 会话级成本预算守护（spending budget guard）纯函数层。
 *
 * 在既有「成本计量 + 价格表 + 趋势」之上补齐「事前/实时防超支」一环：
 * 用户为会话设定一个成本预算上限（USD），用量面板实时展示累计成本占预算的
 * 进度，达到警告阈值时给出 warning、达到/超过上限时给出 exceeded 告警。
 *
 * 本模块只做纯决策（解析输入、计算进度、派生告警级别），无副作用，
 * 便于单测与在 hook / 组件间复用。预算本身的存储（localStorage 持久化）
 * 由调用方负责，本模块不触碰存储。
 */

/** 进度低于该比例时视为正常（无告警）。 */
export const BUDGET_WARN_RATIO = 0.8;

/** 告警级别：none（未达阈值）/ warning（≥80%）/ exceeded（≥100%）。 */
export type BudgetAlertLevel = "none" | "warning" | "exceeded";

/** 预算进度计算的结果。 */
export type BudgetProgress = {
  /** 累计成本占预算的比例（0..1；无预算/预算为 0 时为 0）。 */
  ratio: number;
  /** 百分比（0..100，向上取整展示）。 */
  percent: number;
  /** 告警级别。 */
  alertLevel: BudgetAlertLevel;
};

/**
 * 解析用户输入的预算值。
 *
 * 接受数字或字符串（可能来自 input 的 value / localStorage）。规则：
 * - `null` / `undefined` / 空串 → `null`（视为未设置预算）。
 * - 非法值（NaN、负数、非有限数）→ `null`。
 * - 0 → `null`（预算为 0 无意义，等同于未设置，避免除零）。
 *
 * @param raw 待解析的输入。
 * @returns 有效预算（USD，>0）或 `null`（无效/未设置）。
 */
export function parseBudgetInput(raw: unknown): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const value =
    typeof raw === "string" ? Number(raw.trim()) : typeof raw === "number" ? raw : NaN;

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

/**
 * 派生告警级别。
 *
 * @param ratio 累计成本 / 预算（非有限或负值时视为 0）。
 * @returns 达到预算（≥100%）→ exceeded；达到警告阈值（≥80%）→ warning；否则 none。
 */
export function budgetAlertLevel(ratio: number): BudgetAlertLevel {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return "none";
  }
  if (ratio >= 1) {
    return "exceeded";
  }
  if (ratio >= BUDGET_WARN_RATIO) {
    return "warning";
  }
  return "none";
}

/**
 * 计算预算进度。
 *
 * @param costUsd 当前累计成本（USD）。
 * @param budgetUsd 预算上限（USD）；无效值按未设置处理。
 * @returns 进度对象；无预算时 ratio/percent 为 0、alertLevel 为 none。
 */
export function computeBudgetProgress(
  costUsd: number,
  budgetUsd: number | null | undefined,
): BudgetProgress {
  const budget = parseBudgetInput(budgetUsd);
  if (budget === null) {
    return { ratio: 0, percent: 0, alertLevel: "none" };
  }

  const cost = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;
  const ratio = cost / budget;
  const percent = Math.ceil(ratio * 100);

  return {
    ratio,
    percent,
    alertLevel: budgetAlertLevel(ratio),
  };
}
