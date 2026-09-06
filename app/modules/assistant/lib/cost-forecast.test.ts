import { describe, expect, it } from "vitest";

import {
  forecastCost,
  MIN_FIT_POINTS,
  resolveHorizonDays,
} from "./cost-forecast";
import type { UsageTrendSeries } from "./usage-trend";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeSeries(
  cumulativeCosts: readonly number[],
  baseRecordedAt = 1_000_000,
): UsageTrendSeries {
  const points = cumulativeCosts.map((cost, i) => ({
    index: i + 1,
    recordedAt: baseRecordedAt + i * DAY_MS,
    estimatedCostUsd: i === 0 ? cost : cost - (cumulativeCosts[i - 1] ?? 0),
    cumulativeCostUsd: cost,
    inputTokens: 100,
    outputTokens: 40,
  }));
  const totalCostUsd = cumulativeCosts[cumulativeCosts.length - 1] ?? 0;

  return {
    points,
    peakCostUsd: Math.max(...cumulativeCosts, 0),
    totalCostUsd,
    totalInputTokens: cumulativeCosts.length * 100,
    totalOutputTokens: cumulativeCosts.length * 40,
    peakTokens: 100,
  };
}

describe("resolveHorizonDays", () => {
  it("returns fixed days for fixed-days horizon", () => {
    expect(resolveHorizonDays("fixed-days", 0, 0, 7)).toBe(7);
    expect(resolveHorizonDays("fixed-days", 0, 0, 14)).toBe(14);
  });

  it("computes remaining-month days to month end", () => {
    // 2026-08-15 -> 距 8 月末约 16 天
    const now = new Date("2026-08-15T12:00:00Z").getTime();
    const days = resolveHorizonDays("remaining-month", now, now - DAY_MS);
    expect(days).toBeGreaterThan(10);
    expect(days).toBeLessThanOrEqual(17);
  });

  it("computes next-month as remaining plus ~30 days", () => {
    const now = new Date("2026-08-15T12:00:00Z").getTime();
    const last = now - 3 * DAY_MS;
    const days = resolveHorizonDays("next-month", now, last);
    expect(days).toBeGreaterThanOrEqual(28);
    expect(days).toBeLessThanOrEqual(50);
  });
});

describe("forecastCost", () => {
  it("returns invalid forecast for too few points", () => {
    const series = makeSeries([0.01, 0.02]);
    const result = forecastCost(series, "fixed-days", 2_000_000, {
      fixedDays: 7,
    });

    expect(result.valid).toBe(false);
    expect(result.fitPointCount).toBe(2);
    expect(result.projectedTotalUsd).toBeCloseTo(0.02, 6);
    expect(result.projectionPoints).toHaveLength(0);
  });

  it("projects cumulative cost forward with positive slope", () => {
    // 每日 +0.01 的线性增长
    const costs = [0.01, 0.02, 0.03, 0.04, 0.05];
    const series = makeSeries(costs);
    const lastPoint = series.points[series.points.length - 1];
    const now = (lastPoint?.recordedAt ?? 0) + 3 * DAY_MS;
    const result = forecastCost(series, "fixed-days", now, { fixedDays: 3 });

    expect(result.valid).toBe(true);
    expect(result.currentTotalUsd).toBeCloseTo(0.05, 6);
    // 斜率 ≈ +0.01/天
    expect(result.slopeUsdPerPoint).toBeCloseTo(0.01, 3);
    // 未来 3 天增量 ≈ 0.03
    expect(result.projectedDeltaUsd).toBeCloseTo(0.03, 3);
    expect(result.projectionPoints).toHaveLength(2);
    const projEnd = result.projectionPoints[1];
    expect(projEnd?.cumulativeCostUsd).toBeCloseTo(0.08, 3);
  });

  it("handles flat series without division issues", () => {
    const series = makeSeries([0.01, 0.01, 0.01, 0.01]);
    const lastPoint = series.points[series.points.length - 1];
    const now = (lastPoint?.recordedAt ?? 0) + DAY_MS;
    const result = forecastCost(series, "fixed-days", now, { fixedDays: 5 });

    expect(result.valid).toBe(true);
    // 平线：预测增量 ≈ 0
    expect(result.projectedDeltaUsd).toBeLessThan(1e-6);
  });

  it("requires at least MIN_FIT_POINTS points", () => {
    expect(MIN_FIT_POINTS).toBe(3);
  });
});
