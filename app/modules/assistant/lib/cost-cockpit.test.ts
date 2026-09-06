import { describe, expect, it } from "vitest";

import { buildCostCockpit, forecastCockpitCosts } from "./cost-cockpit";
import type { SessionUsageSummary } from "./session-comparison";

function makeSession(overrides: Partial<SessionUsageSummary>): SessionUsageSummary {
  return {
    sessionId: "s",
    title: "S",
    providerMode: "chat",
    turnCount: 1,
    inputTokens: 100,
    outputTokens: 50,
    estimatedCostUsd: 0.01,
    lastRecordedAt: 1000,
    ...overrides,
  };
}

describe("forecastCockpitCosts", () => {
  it("returns invalid for fewer than 3 samples", () => {
    const stats = forecastCockpitCosts([1, 2], 30);
    expect(stats.valid).toBe(false);
    expect(stats.fitPointCount).toBe(2);
    expect(stats.horizonDays).toBe(30);
    expect(stats.projectedTotalUsd).toBe(3);
    expect(stats.currentTotalUsd).toBe(3);
    expect(stats.projectedDeltaUsd).toBe(0);
  });

  it("extrapolates an upward linear trend", () => {
    // 累计成本 1,3,6,10,15 → 斜率为正，外推 30 天后预测高于当前。
    const stats = forecastCockpitCosts([1, 2, 3, 4, 5], 30);
    expect(stats.valid).toBe(true);
    expect(stats.fitPointCount).toBe(5);
    expect(stats.currentTotalUsd).toBe(15);
    expect(stats.projectedDeltaUsd).toBeGreaterThan(0);
    expect(stats.projectedTotalUsd).toBeGreaterThan(15);
  });

  it("clamps negative / non-finite costs to zero", () => {
    const stats = forecastCockpitCosts([1, -1, Number.NaN, 2], 10);
    expect(stats.valid).toBe(true);
    // 参与累计的是 [1,0,0,2] → 累计 [1,1,1,3]，总成本 3
    expect(stats.currentTotalUsd).toBe(3);
  });

  it("flat zero-cost series yields zero projection", () => {
    // 全部成本为 0 → 累计全 0，斜率为 0，预测仍为 0
    const stats = forecastCockpitCosts([0, 0, 0], 30);
    expect(stats.valid).toBe(true);
    expect(stats.currentTotalUsd).toBe(0);
    expect(stats.projectedTotalUsd).toBe(0);
    expect(stats.projectedDeltaUsd).toBe(0);
  });
});

describe("buildCostCockpit", () => {
  it("aggregates guardrail + comparison + forecast for no sessions", () => {
    const cockpit = buildCostCockpit(10, 2, [], 80, 30);

    expect(cockpit.guardrail.enabled).toBe(true);
    expect(cockpit.guardrail.spentUsd).toBe(2);
    expect(cockpit.guardrail.usedPct).toBeCloseTo(20, 6);
    expect(cockpit.comparison.points).toHaveLength(0);
    expect(cockpit.comparison.sessionCount).toBe(0);
    expect(cockpit.overBudgetCount).toBe(0);
    expect(cockpit.approachingBudgetCount).toBe(0);
    expect(cockpit.forecast.valid).toBe(false);
  });

  it("marks sessions over/approaching budget share", () => {
    const sessions = [
      makeSession({ sessionId: "a", estimatedCostUsd: 6 }), // > 5 share → over
      makeSession({ sessionId: "b", estimatedCostUsd: 4 }), // 80%*5=4 → approaching
      makeSession({ sessionId: "c", estimatedCostUsd: 1 }), // < 4 → normal
    ];
    const cockpit = buildCostCockpit(15, 11, sessions, 80, 30);

    const byId = new Map(
      cockpit.comparison.points.map((p) => [p.sessionId, p]),
    );
    expect(byId.get("a")?.status).toBe("over-budget");
    expect(byId.get("b")?.status).toBe("approaching");
    expect(byId.get("c")?.status).toBe("normal");
    expect(cockpit.overBudgetCount).toBe(1);
    expect(cockpit.approachingBudgetCount).toBe(1);
    expect(cockpit.comparison.totalCostUsd).toBeCloseTo(11, 6);
  });

  it("treats all sessions as normal when guardrail disabled", () => {
    const sessions = [
      makeSession({ sessionId: "a", estimatedCostUsd: 6 }),
      makeSession({ sessionId: "b", estimatedCostUsd: 4 }),
    ];
    const cockpit = buildCostCockpit(0, 10, sessions, 80, 30);

    expect(cockpit.guardrail.enabled).toBe(false);
    expect(cockpit.comparison.points.every((p) => p.status === "normal")).toBe(
      true,
    );
    expect(cockpit.overBudgetCount).toBe(0);
    expect(cockpit.approachingBudgetCount).toBe(0);
  });

  it("builds forecast from session costs", () => {
    const sessions = [1, 2, 3, 4, 5].map((cost) =>
      makeSession({
        sessionId: `s${cost}`,
        estimatedCostUsd: cost,
      }),
    );
    const cockpit = buildCostCockpit(100, 15, sessions, 80, 30);

    expect(cockpit.forecast.valid).toBe(true);
    expect(cockpit.forecast.fitPointCount).toBe(5);
    expect(cockpit.forecast.currentTotalUsd).toBeCloseTo(15, 6);
    expect(cockpit.forecast.projectedDeltaUsd).toBeGreaterThan(0);
  });

  it("sorts points by cost descending with status preserved", () => {
    const sessions = [
      makeSession({ sessionId: "low", estimatedCostUsd: 1 }),
      makeSession({ sessionId: "high", estimatedCostUsd: 8 }),
      makeSession({ sessionId: "mid", estimatedCostUsd: 4 }),
    ];
    const cockpit = buildCostCockpit(18, 13, sessions, 80, 30);

    expect(cockpit.comparison.points.map((p) => p.sessionId)).toEqual([
      "high",
      "mid",
      "low",
    ]);
  });

  it("builds a month-end forecast when monthSeries is provided", () => {
    // 当月逐日消费：前 5 天每天 +2 USD，上升趋势明显。
    const monthSeries = [1, 2, 3, 4, 5].map((day) => ({
      dayKey: `2026-08-0${day}`,
      spentUsd: 2,
    }));
    // 固定 now 为 8 月 5 日，距月末约 26 天。
    const now = new Date(Date.UTC(2026, 7, 5)).getTime();

    const cockpit = buildCostCockpit(100, 10, [], 80, 30, monthSeries, now);

    expect(cockpit.monthForecast.valid).toBe(true);
    expect(cockpit.monthForecast.fitPointCount).toBe(5);
    expect(cockpit.monthForecast.currentTotalUsd).toBeCloseTo(10, 6);
    // 上升趋势 → 预计月底花费高于当前，增量 > 0。
    expect(cockpit.monthForecast.projectedMonthEndUsd).toBeGreaterThan(10);
    expect(cockpit.monthForecast.projectedDeltaUsd).toBeGreaterThan(0);
    expect(cockpit.monthForecast.projectedUtilizationPct).toBeGreaterThan(
      (10 / 100) * 100,
    );
    expect(cockpit.monthForecast.status).toBe("on-track");
  });

  it("flags month-end forecast at-risk by utilization", () => {
    // 当前累计已达预算 85%（≥ 80% 阈值），但后续日消费平缓（斜率 0.5 USD/天）
    // 且 now 接近月末（剩余约 3 天），预计月底使用率落在 80–100 → at-risk。
    const monthSeries = [
      { dayKey: "2026-08-01", spentUsd: 84.5 },
      { dayKey: "2026-08-02", spentUsd: 0.5 }, // 累计 85
    ];
    const now = new Date(Date.UTC(2026, 7, 28)).getTime(); // 月末前约 3 天
    const cockpit = buildCostCockpit(100, 85, [], 80, 30, monthSeries, now);
    expect(cockpit.monthForecast.valid).toBe(true);
    expect(cockpit.monthForecast.currentTotalUsd).toBeCloseTo(85, 6);
    expect(cockpit.monthForecast.projectedUtilizationPct).toBeGreaterThanOrEqual(80);
    expect(cockpit.monthForecast.projectedUtilizationPct).toBeLessThan(100);
    expect(cockpit.monthForecast.status).toBe("at-risk");
  });

  it("flags month-end forecast over-budget when projected exceeds budget", () => {
    // 高斜率 + 剩余天数多 → 预计月底使用率 ≥ 100 → over-budget。
    const monthSeries = [1, 2, 3].map((day) => ({
      dayKey: `2026-08-0${day}`,
      spentUsd: 25,
    }));
    const now = new Date(Date.UTC(2026, 7, 3)).getTime();
    const cockpit = buildCostCockpit(100, 75, [], 80, 30, monthSeries, now);
    expect(cockpit.monthForecast.valid).toBe(true);
    expect(cockpit.monthForecast.projectedUtilizationPct).toBeGreaterThanOrEqual(100);
    expect(cockpit.monthForecast.status).toBe("over-budget");
  });

  it("marks month-end forecast invalid when monthSeries is empty", () => {
    const cockpit = buildCostCockpit(100, 10, [], 80, 30, [], Date.now());
    expect(cockpit.monthForecast.valid).toBe(false);
    expect(cockpit.monthForecast.fitPointCount).toBe(0);
    expect(cockpit.monthForecast.status).toBe("on-track");
  });
});
