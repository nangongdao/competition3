import { describe, expect, it } from "vitest";

import {
  computeCalibrationDelta,
  measuredPricePerMillion,
  summarizeCalibration,
  type CalibrationSample,
} from "./cost-calibration";

function makeSample(overrides: Partial<CalibrationSample>): CalibrationSample {
  return {
    label: "s",
    estimatedUsd: 0.1,
    measuredUsd: 0.12,
    inputTokens: 10_000,
    outputTokens: 2_000,
    recordedAt: 1000,
    ...overrides,
  };
}

describe("computeCalibrationDelta", () => {
  it("computes absolute and relative deltas", () => {
    const delta = computeCalibrationDelta(makeSample({}));
    expect(delta.estimatedUsd).toBeCloseTo(0.1, 6);
    expect(delta.measuredUsd).toBeCloseTo(0.12, 6);
    expect(delta.absoluteDeltaUsd).toBeCloseTo(0.02, 6);
    expect(delta.relativeDeltaPct).toBeCloseTo(20, 6);
    expect(delta.overrun).toBe(true);
  });

  it("flags underrun when measured < estimated", () => {
    const delta = computeCalibrationDelta(
      makeSample({ measuredUsd: 0.08 }),
    );
    expect(delta.absoluteDeltaUsd).toBeCloseTo(-0.02, 6);
    expect(delta.overrun).toBe(false);
  });

  it("clamps non-finite to zero", () => {
    const delta = computeCalibrationDelta(
      makeSample({ estimatedUsd: Number.NaN, measuredUsd: -1 }),
    );
    expect(delta.estimatedUsd).toBe(0);
    expect(delta.measuredUsd).toBe(0);
    expect(delta.relativeDeltaPct).toBe(0);
  });
});

describe("summarizeCalibration", () => {
  it("aggregates totals across samples", () => {
    const summary = summarizeCalibration([
      makeSample({ label: "a", estimatedUsd: 0.1, measuredUsd: 0.12 }),
      makeSample({ label: "b", estimatedUsd: 0.2, measuredUsd: 0.15 }),
    ]);
    expect(summary.totalEstimatedUsd).toBeCloseTo(0.3, 6);
    expect(summary.totalMeasuredUsd).toBeCloseTo(0.27, 6);
    expect(summary.totalAbsoluteDeltaUsd).toBeCloseTo(-0.03, 6);
    expect(summary.totalRelativeDeltaPct).toBeCloseTo(-10, 6);
    expect(summary.overrun).toBe(false);
  });

  it("empty samples yields zero totals", () => {
    const summary = summarizeCalibration([]);
    expect(summary.totalEstimatedUsd).toBe(0);
    expect(summary.totalMeasuredUsd).toBe(0);
    expect(summary.totalRelativeDeltaPct).toBe(0);
  });
});

describe("measuredPricePerMillion", () => {
  it("computes blended measured price per million tokens", () => {
    // 0.05 USD / 10_000 tokens → 5 USD / 1M
    const price = measuredPricePerMillion(0.05, 8_000, 2_000);
    expect(price).toBeCloseTo(5, 6);
  });

  it("returns 0 when no tokens", () => {
    expect(measuredPricePerMillion(0.1, 0, 0)).toBe(0);
  });

  it("clamps negative to zero", () => {
    expect(measuredPricePerMillion(-1, 100, 0)).toBe(0);
  });
});
