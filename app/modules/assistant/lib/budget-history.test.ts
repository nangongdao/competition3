import { describe, expect, it } from "vitest";

import {
  buildBudgetHistory,
  monthHistoryStatus,
  monthHistorySummary,
  type MonthUsageSummary,
  type BudgetHistoryMonth,
} from "./budget-history";

function month(
  monthKey: string,
  estimatedCostUsd: number,
  turnCount = 1,
): MonthUsageSummary {
  return {
    monthKey,
    turnCount,
    estimatedCostUsd,
    inputTokens: 0,
    outputTokens: 0,
  };
}

describe("monthHistoryStatus", () => {
  it("低于阈值 → normal", () => {
    expect(monthHistoryStatus(0)).toBe("normal");
    expect(monthHistoryStatus(50)).toBe("normal");
    expect(monthHistoryStatus(79.9)).toBe("normal");
  });

  it("达到阈值未超限 → high", () => {
    expect(monthHistoryStatus(80)).toBe("high");
    expect(monthHistoryStatus(99)).toBe("high");
  });

  it("≥100 → over", () => {
    expect(monthHistoryStatus(100)).toBe("over");
    expect(monthHistoryStatus(150)).toBe("over");
  });

  it("自定义阈值", () => {
    expect(monthHistoryStatus(70, 70)).toBe("high");
    expect(monthHistoryStatus(69, 70)).toBe("normal");
    // 非法阈值回退默认 80。
    expect(monthHistoryStatus(85, 0)).toBe("high");
  });

  it("非法使用率回退 0", () => {
    expect(monthHistoryStatus(Number.NaN)).toBe("normal");
    expect(monthHistoryStatus(Number.POSITIVE_INFINITY)).toBe("normal");
  });
});

describe("buildBudgetHistory", () => {
  it("空序列返回空", () => {
    expect(buildBudgetHistory([], 100)).toEqual([]);
  });

  it("按月份升序折叠并计算使用率与状态", () => {
    const months = buildBudgetHistory(
      [
        month("2026-06", 90),
        month("2026-08", 120),
        month("2026-07", 85),
      ],
      100,
      80,
    );
    expect(months.map((m) => m.monthKey)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(months[0]).toMatchObject({
      spentUsd: 90,
      usedPct: 90,
      status: "high",
      overBudget: false,
      monthLabel: "2026-06",
    });
    expect(months[1]).toMatchObject({
      spentUsd: 85,
      usedPct: 85,
      status: "high",
      overBudget: false,
    });
    expect(months[2]).toMatchObject({
      spentUsd: 120,
      usedPct: 120,
      status: "over",
      overBudget: true,
    });
  });

  it("预算为 0 时使用率为 0 且状态 normal", () => {
    const months = buildBudgetHistory([month("2026-08", 5)], 0, 80);
    expect(months[0].usedPct).toBe(0);
    expect(months[0].status).toBe("normal");
    expect(months[0].overBudget).toBe(false);
    expect(months[0].budgetUsd).toBe(0);
  });

  it("过滤非法行与非法金额", () => {
    const months = buildBudgetHistory(
      [month("2026-08", 5), { ...month("2026-07", 10), monthKey: "" }],
      100,
    );
    expect(months).toHaveLength(1);
    expect(months[0].monthKey).toBe("2026-08");
  });

  it("自定义阈值影响状态判定", () => {
    const months = buildBudgetHistory([month("2026-08", 50)], 100, 40);
    expect(months[0].status).toBe("high");
    expect(months[0].overBudget).toBe(false);
  });

  it("保留轮次与预算", () => {
    const months = buildBudgetHistory([month("2026-08", 30, 7)], 60, 80);
    expect(months[0].turnCount).toBe(7);
    expect(months[0].budgetUsd).toBe(60);
  });
});

describe("monthHistorySummary", () => {
  it("空历史返回全零", () => {
    const summary = monthHistorySummary([]);
    expect(summary).toEqual({
      monthCount: 0,
      totalSpentUsd: 0,
      overCount: 0,
      highCount: 0,
    });
  });

  it("统计总消费与超限/接近月份数", () => {
    const months: BudgetHistoryMonth[] = [
      {
        monthKey: "2026-06",
        monthLabel: "2026-06",
        spentUsd: 50,
        budgetUsd: 100,
        usedPct: 50,
        turnCount: 1,
        status: "normal",
        overBudget: false,
      },
      {
        monthKey: "2026-07",
        monthLabel: "2026-07",
        spentUsd: 90,
        budgetUsd: 100,
        usedPct: 90,
        turnCount: 1,
        status: "high",
        overBudget: false,
      },
      {
        monthKey: "2026-08",
        monthLabel: "2026-08",
        spentUsd: 150,
        budgetUsd: 100,
        usedPct: 150,
        turnCount: 1,
        status: "over",
        overBudget: true,
      },
    ];
    const summary = monthHistorySummary(months);
    expect(summary.monthCount).toBe(3);
    expect(summary.totalSpentUsd).toBeCloseTo(290, 6);
    expect(summary.overCount).toBe(1);
    expect(summary.highCount).toBe(1);
  });
});
