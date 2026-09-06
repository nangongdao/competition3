/**
 * 全局月度成本外推 vs 月度预算的纯数据层。
 *
 * 把「当月逐日消费序列」折叠为可用于 UI 渲染的预测状态：
 *   - 基于累计成本的日趋势做最小二乘线性回归，外推到月末；
 *   - 给出预计月底花费 / 较当前增量 / 对月度预算的预计使用率；
 *   - 派生预测状态（on-track / at-risk / over-budget），供用户判断
 *     「按当前趋势这个月会不会超预算」。
 *
 * 纯函数、无副作用，便于单测与在 hook / 组件间复用。
 */

/** 某自然月某天的消费（来自 `GET /api/sessions/usage/budget` 的 `monthSeries`）。 */
export type MonthUsageDay = {
  dayKey: string;
  spentUsd: number;
};

/** 按天折叠后的月度消费序列（累计成本逐天累加）。 */
export type MonthSpendSeries = {
  /** 按天排序的累计成本点（x = dayOffset 0..n-1）。 */
  points: readonly {
    /** 距当月 1 号的偏移天数（0 起）。 */
    dayOffset: number;
    /** 当日消费（USD）。 */
    spentUsd: number;
    /** 截至当日的累计成本（USD）。 */
    cumulativeUsd: number;
  }[];
  /** 当月累计总成本（USD）。 */
  totalUsd: number;
  /** 有消费记录的天数。 */
  dayCount: number;
};

/** 预测状态：按当前趋势月底是否会在预算内。 */
export type BudgetProjectionStatus = "on-track" | "at-risk" | "over-budget";

/** 月末成本外推结果。 */
export type MonthEndForecast = {
  /** 是否有效（样本不足或序列非法时为 false）。 */
  valid: boolean;
  /** 拟合斜率（USD / 天）。 */
  slopeUsdPerDay: number;
  /** 已用消费天数（用于拟合的样本数）。 */
  fitPointCount: number;
  /** 距月底的剩余天数。 */
  remainingDays: number;
  /** 当前累计成本（USD）。 */
  currentTotalUsd: number;
  /** 预计月底累计成本（USD）。 */
  projectedMonthEndUsd: number;
  /** 预测增量（= projectedMonthEndUsd - currentTotalUsd）。 */
  projectedDeltaUsd: number;
  /** 对月度预算的预计使用率（0–100+；预算 0 时为 0）。 */
  projectedUtilizationPct: number;
  /** 预测状态。 */
  status: BudgetProjectionStatus;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 把当月逐日消费行折叠为累计成本序列。
 *
 * @param days 逐日消费（`dayKey` 形如 `YYYY-MM-DD`，无需有序）。
 * @returns 按天排序的累计成本序列；无数据返回空序列。
 */
export function buildMonthSpendSeries(
  days: readonly MonthUsageDay[],
): MonthSpendSeries {
  const sorted = [...days]
    .filter((day) => {
      if (
        typeof day?.dayKey !== "string" ||
        day.dayKey.length === 0 ||
        !Number.isFinite(day?.spentUsd) ||
        day.spentUsd <= 0
      ) {
        return false;
      }
      return parseDayOffset(day.dayKey) >= 0;
    })
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  let cumulative = 0;
  const points = sorted.map((day) => {
    const dayOffset = parseDayOffset(day.dayKey);
    cumulative += day.spentUsd;
    return {
      dayOffset,
      spentUsd: day.spentUsd,
      cumulativeUsd: cumulative,
    };
  });

  return {
    points,
    totalUsd: cumulative,
    dayCount: points.length,
  };
}

/** 把 `YYYY-MM-DD` 解析为当月 1 号起的天偏移；解析失败返回 -1。 */
function parseDayOffset(dayKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (match === null) {
    return -1;
  }
  const day = Number(match[3]);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return -1;
  }
  return day - 1;
}

/** 计算某 `now` 距当月结束的剩余天数（含今天，最小 1）。 */
export function remainingMonthDays(now: number): number {
  const endOfMonth = new Date(now);
  endOfMonth.setUTCDate(1);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1);
  endOfMonth.setUTCDate(0);
  endOfMonth.setUTCHours(23, 59, 59, 999);
  const days = (endOfMonth.getTime() - now) / MS_PER_DAY;
  return Math.max(1, Math.round(days));
}

/** 对累计成本序列做最小二乘线性回归，返回斜率与截距（USD/天）。 */
function fitLinear(
  cumulativeCosts: readonly number[],
): { slope: number; intercept: number } {
  const n = cumulativeCosts.length;
  if (n === 0) {
    return { slope: 0, intercept: 0 };
  }
  if (n === 1) {
    return { slope: 0, intercept: cumulativeCosts[0] };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += cumulativeCosts[i];
    sumXY += i * cumulativeCosts[i];
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) {
    return { slope: 0, intercept: n > 0 ? sumY / n : 0 };
  }
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/**
 * 基于当月累计成本趋势，外推月末累计成本，并与月度预算对比。
 *
 * 用最近消费天的累计成本做线性回归，以最近点锚定 + 日斜率 × 剩余天数，
 * 得到预计月底累计成本；再除以月度预算得到预计使用率，派生预测状态。
 *
 * @param series 当月累计成本序列（`buildMonthSpendSeries` 产出）。
 * @param monthlyBudgetUsd 月度预算（USD）；0 视为未启用护栏。
 * @param now 当前时间戳（ms），用于计算距月末剩余天数。
 * @param options.alertThresholdPct 判定 at-risk 的使用率阈值（默认 80）。
 * @returns 外推结果；样本不足 2 天或序列为空时 `valid` 为 false。
 */
export function projectMonthEndSpend(
  series: MonthSpendSeries,
  monthlyBudgetUsd: number,
  now: number,
  options?: { alertThresholdPct?: number },
): MonthEndForecast {
  const points = series.points;
  const currentTotalUsd = clampNonNegative(series.totalUsd);
  const remainingDays = remainingMonthDays(now);
  const threshold = options?.alertThresholdPct ?? 80;

  if (points.length < 2) {
    return {
      valid: false,
      slopeUsdPerDay: 0,
      fitPointCount: points.length,
      remainingDays,
      currentTotalUsd,
      projectedMonthEndUsd: currentTotalUsd,
      projectedDeltaUsd: 0,
      projectedUtilizationPct:
        monthlyBudgetUsd > 0
          ? (currentTotalUsd / monthlyBudgetUsd) * 100
          : 0,
      status: projectStatus(
        monthlyBudgetUsd > 0
          ? (currentTotalUsd / monthlyBudgetUsd) * 100
          : 0,
        threshold,
      ),
    };
  }

  const cumulativeCosts = points.map((point) =>
    clampNonNegative(point.cumulativeUsd),
  );
  const { slope, intercept } = fitLinear(cumulativeCosts);

  if (!Number.isFinite(slope)) {
    return {
      valid: false,
      slopeUsdPerDay: 0,
      fitPointCount: points.length,
      remainingDays,
      currentTotalUsd,
      projectedMonthEndUsd: currentTotalUsd,
      projectedDeltaUsd: 0,
      projectedUtilizationPct:
        monthlyBudgetUsd > 0
          ? (currentTotalUsd / monthlyBudgetUsd) * 100
          : 0,
      status: projectStatus(
        monthlyBudgetUsd > 0
          ? (currentTotalUsd / monthlyBudgetUsd) * 100
          : 0,
        threshold,
      ),
    };
  }

  // 以回归线最近点锚定（不低于当前累计），外推剩余天数。
  const anchorUsd = Math.max(
    currentTotalUsd,
    slope * (points.length - 1) + intercept,
  );
  const projectedMonthEndUsd = clampNonNegative(
    anchorUsd + slope * remainingDays,
  );
  const projectedDeltaUsd = clampNonNegative(
    projectedMonthEndUsd - currentTotalUsd,
  );
  const projectedUtilizationPct =
    monthlyBudgetUsd > 0
      ? (projectedMonthEndUsd / monthlyBudgetUsd) * 100
      : 0;

  return {
    valid: true,
    slopeUsdPerDay: slope,
    fitPointCount: points.length,
    remainingDays,
    currentTotalUsd,
    projectedMonthEndUsd,
    projectedDeltaUsd,
    projectedUtilizationPct,
    status: projectStatus(projectedUtilizationPct, threshold),
  };
}

/**
 * 由预计使用率派生预测状态。
 *
 * @param utilizationPct 对预算的预计使用率（0–100+）。
 * @param thresholdPct 告警阈值（1–100，默认 80）。
 * @returns `on-track`(< threshold) / `at-risk`(≥ threshold 且 < 100) / `over-budget`(≥ 100)。
 */
export function projectStatus(
  utilizationPct: number,
  thresholdPct = 80,
): BudgetProjectionStatus {
  const used = Number.isFinite(utilizationPct) ? utilizationPct : 0;
  const threshold =
    Number.isFinite(thresholdPct) && thresholdPct >= 1 && thresholdPct <= 100
      ? thresholdPct
      : 80;

  if (used >= 100) {
    return "over-budget";
  }
  if (used >= threshold) {
    return "at-risk";
  }
  return "on-track";
}
