import { describe, expect, it } from "vitest";

import {
  buildCalibrationSample,
  buildCalibrationViewModel,
  CALIBRATION_WARN_DELTA_PCT,
  parseCalibrationInput,
  parseStoredCalibrationSamples,
  serializeCalibrationSamples,
} from "./calibration-store";
import type { CalibrationSample } from "./cost-calibration";

function makeSample(overrides: Partial<CalibrationSample> = {}): CalibrationSample {
  return {
    label: "session-1",
    estimatedUsd: 0.1,
    measuredUsd: 0.12,
    inputTokens: 10_000,
    outputTokens: 2_000,
    recordedAt: 1000,
    ...overrides,
  };
}

describe("parseCalibrationInput", () => {
  it("accepts a positive numeric string", () => {
    expect(parseCalibrationInput("0.12")).toBeCloseTo(0.12, 6);
  });

  it("accepts a number", () => {
    expect(parseCalibrationInput(0.5)).toBeCloseTo(0.5, 6);
  });

  it("trims whitespace", () => {
    expect(parseCalibrationInput("  0.2  ")).toBeCloseTo(0.2, 6);
  });

  it("returns null for empty / whitespace-only", () => {
    expect(parseCalibrationInput("")).toBeNull();
    expect(parseCalibrationInput("   ")).toBeNull();
    expect(parseCalibrationInput(null)).toBeNull();
    expect(parseCalibrationInput(undefined)).toBeNull();
  });

  it("returns null for NaN / non-finite", () => {
    expect(parseCalibrationInput("abc")).toBeNull();
    expect(parseCalibrationInput(Number.NaN)).toBeNull();
    expect(parseCalibrationInput(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("returns null for zero and negatives", () => {
    expect(parseCalibrationInput("0")).toBeNull();
    expect(parseCalibrationInput("-1")).toBeNull();
    expect(parseCalibrationInput(-0.5)).toBeNull();
  });
});

describe("buildCalibrationSample", () => {
  it("sets label, estimated, measured, and recordedAt=now", () => {
    const sample = buildCalibrationSample({
      label: "s1",
      estimatedUsd: 0.1,
      measuredUsd: 0.15,
    });
    expect(sample.label).toBe("s1");
    expect(sample.estimatedUsd).toBeCloseTo(0.1, 6);
    expect(sample.measuredUsd).toBeCloseTo(0.15, 6);
    expect(sample.recordedAt).toBeGreaterThan(0);
    expect(Date.now() - sample.recordedAt).toBeLessThan(5000);
  });
});

describe("buildCalibrationViewModel", () => {
  it("builds deltas and summary across samples", () => {
    const view = buildCalibrationViewModel([
      makeSample({ label: "a", estimatedUsd: 0.1, measuredUsd: 0.12 }),
      makeSample({ label: "b", estimatedUsd: 0.2, measuredUsd: 0.15 }),
    ]);
    expect(view.deltas).toHaveLength(2);
    expect(view.deltas[0].relativeDeltaPct).toBeCloseTo(20, 6);
    expect(view.summary.totalEstimatedUsd).toBeCloseTo(0.3, 6);
    expect(view.summary.totalMeasuredUsd).toBeCloseTo(0.27, 6);
    expect(view.summary.totalRelativeDeltaPct).toBeCloseTo(-10, 6);
  });

  it("flags needsCalibration when |delta%| exceeds threshold", () => {
    const view = buildCalibrationViewModel([
      makeSample({ estimatedUsd: 0.1, measuredUsd: 0.13 }),
    ]);
    expect(view.summary.totalRelativeDeltaPct).toBeCloseTo(30, 6);
    expect(view.needsCalibration).toBe(true);
  });

  it("does not flag when within threshold", () => {
    const view = buildCalibrationViewModel([
      makeSample({ estimatedUsd: 0.1, measuredUsd: 0.105 }),
    ]);
    expect(Math.abs(view.summary.totalRelativeDeltaPct)).toBeLessThan(
      CALIBRATION_WARN_DELTA_PCT,
    );
    expect(view.needsCalibration).toBe(false);
  });

  it("empty samples yields empty deltas and zero totals", () => {
    const view = buildCalibrationViewModel([]);
    expect(view.deltas).toHaveLength(0);
    expect(view.summary.totalEstimatedUsd).toBe(0);
    expect(view.summary.totalMeasuredUsd).toBe(0);
    expect(view.needsCalibration).toBe(false);
  });
});

describe("serialize / parseStoredCalibrationSamples", () => {
  it("round-trips valid samples", () => {
    const samples = [makeSample({}), makeSample({ label: "b", recordedAt: 2000 })];
    const parsed = parseStoredCalibrationSamples(serializeCalibrationSamples(samples));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].label).toBe("session-1");
    expect(parsed[1].recordedAt).toBe(2000);
  });

  it("returns [] for null / undefined", () => {
    expect(parseStoredCalibrationSamples(null)).toEqual([]);
    expect(parseStoredCalibrationSamples(undefined)).toEqual([]);
  });

  it("returns [] for invalid JSON", () => {
    expect(parseStoredCalibrationSamples("not json")).toEqual([]);
  });

  it("returns [] for non-array JSON", () => {
    expect(parseStoredCalibrationSamples('{"a":1}')).toEqual([]);
  });

  it("drops structurally invalid entries and keeps valid ones", () => {
    const raw = JSON.stringify([
      makeSample({}),
      { label: 42, estimatedUsd: "x", measuredUsd: null },
      { label: "ok", estimatedUsd: 0.5, measuredUsd: 0.6, recordedAt: 1 },
    ]);
    const parsed = parseStoredCalibrationSamples(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].label).toBe("session-1");
    expect(parsed[1].estimatedUsd).toBeCloseTo(0.5, 6);
  });
});
