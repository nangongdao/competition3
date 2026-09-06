import { describe, expect, it } from "vitest";

import { buildSessionComparisonSeries } from "./session-comparison";
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

describe("buildSessionComparisonSeries", () => {
  it("returns empty series for no sessions", () => {
    const series = buildSessionComparisonSeries([]);
    expect(series.points).toHaveLength(0);
    expect(series.peakCostUsd).toBe(0);
    expect(series.totalCostUsd).toBe(0);
    expect(series.sessionCount).toBe(0);
  });

  it("sorts sessions by cost descending and computes ratios", () => {
    const sessions = [
      makeSession({ sessionId: "a", estimatedCostUsd: 0.02, turnCount: 2 }),
      makeSession({ sessionId: "b", estimatedCostUsd: 0.05, turnCount: 3 }),
      makeSession({ sessionId: "c", estimatedCostUsd: 0.01, turnCount: 1 }),
    ];
    const series = buildSessionComparisonSeries(sessions);

    expect(series.points.map((p) => p.sessionId)).toEqual(["b", "a", "c"]);
    expect(series.peakCostUsd).toBeCloseTo(0.05, 6);
    // 峰值条目 ratio = 1
    expect(series.points[0]?.costRatio).toBe(1);
    // a (0.02/0.05) = 0.4
    expect(series.points[1]?.costRatio).toBeCloseTo(0.4, 6);
    // c (0.01/0.05) = 0.2
    expect(series.points[2]?.costRatio).toBeCloseTo(0.2, 6);
    expect(series.totalCostUsd).toBeCloseTo(0.08, 6);
    expect(series.totalTurnCount).toBe(6);
    expect(series.sessionCount).toBe(3);
  });

  it("clamps non-finite costs to zero", () => {
    const sessions = [
      makeSession({ sessionId: "a", estimatedCostUsd: Number.NaN, turnCount: 1 }),
      makeSession({ sessionId: "b", estimatedCostUsd: -1, turnCount: 1 }),
    ];
    const series = buildSessionComparisonSeries(sessions);
    expect(series.peakCostUsd).toBe(0);
    expect(series.totalCostUsd).toBe(0);
    expect(series.points.every((p) => p.estimatedCostUsd === 0)).toBe(true);
  });
});
