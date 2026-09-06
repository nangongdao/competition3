import { describe, expect, it } from "vitest";

import { buildUsageTrendSeries } from "./usage-trend";
import type { UsageEntry } from "./session-client";

function makeEntry(overrides: Partial<UsageEntry>): UsageEntry {
  return {
    id: "e",
    sessionId: "s",
    mode: "realtime",
    inputTokens: 100,
    inputTextTokens: 60,
    inputAudioTokens: 20,
    inputImageTokens: 20,
    cachedInputTokens: 0,
    cachedTextTokens: 0,
    cachedAudioTokens: 0,
    cachedImageTokens: 0,
    outputTokens: 40,
    outputTextTokens: 40,
    outputAudioTokens: 0,
    estimatedCostUsd: 0.01,
    recordedAt: 1000,
    ...overrides,
  };
}

describe("buildUsageTrendSeries", () => {
  it("returns empty series for no entries", () => {
    const series = buildUsageTrendSeries([]);
    expect(series.points).toHaveLength(0);
    expect(series.totalCostUsd).toBe(0);
    expect(series.totalInputTokens).toBe(0);
    expect(series.peakCostUsd).toBe(0);
  });

  it("sorts entries by recordedAt ascending for correct cumulative cost", () => {
    const entries = [
      makeEntry({ recordedAt: 3000, estimatedCostUsd: 0.03 }),
      makeEntry({ recordedAt: 1000, estimatedCostUsd: 0.01 }),
      makeEntry({ recordedAt: 2000, estimatedCostUsd: 0.02 }),
    ];
    const series = buildUsageTrendSeries(entries);
    expect(series.points.map((p) => p.index)).toEqual([1, 2, 3]);
    // 按时间排序后的累计成本逐步累加
    expect(series.points[0]?.cumulativeCostUsd).toBeCloseTo(0.01, 6);
    expect(series.points[1]?.cumulativeCostUsd).toBeCloseTo(0.03, 6);
    expect(series.points[2]?.cumulativeCostUsd).toBeCloseTo(0.06, 6);
    expect(series.totalCostUsd).toBeCloseTo(0.06, 6);
  });

  it("clamps negative / non-finite costs and tokens to zero", () => {
    const entries = [
      makeEntry({ estimatedCostUsd: -1, inputTokens: -5, outputTokens: Number.NaN }),
    ];
    const series = buildUsageTrendSeries(entries);
    expect(series.points[0]?.estimatedCostUsd).toBe(0);
    expect(series.points[0]?.inputTokens).toBe(0);
    expect(series.points[0]?.outputTokens).toBe(0);
    expect(series.totalCostUsd).toBe(0);
    expect(series.peakTokens).toBe(0);
  });

  it("accumulates input/output tokens and computes peak cost/tokens", () => {
    const entries = [
      makeEntry({ inputTokens: 100, outputTokens: 40, estimatedCostUsd: 0.01 }),
      makeEntry({ inputTokens: 300, outputTokens: 80, estimatedCostUsd: 0.03 }),
    ];
    const series = buildUsageTrendSeries(entries);
    expect(series.totalInputTokens).toBe(400);
    expect(series.totalOutputTokens).toBe(120);
    expect(series.peakCostUsd).toBeCloseTo(0.03, 6);
    expect(series.peakTokens).toBe(300);
  });
});
