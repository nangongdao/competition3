import { describe, expect, it } from "vitest";

import type { CalibrationSample } from "./cost-calibration";
import {
  applyCalibrationFactor,
  buildCalibrationWriteback,
  computeCalibrationFactor,
  EMPTY_CALIBRATION_WRITEBACK,
  MAX_CALIBRATION_FACTOR,
  MIN_CALIBRATION_FACTOR,
  parseStoredCalibrationWriteback,
  serializeCalibrationWriteback,
} from "./calibration-writeback";

function sample(
  label: string,
  estimatedUsd: number,
  measuredUsd: number,
  recordedAt = 1000,
): CalibrationSample {
  return { label, estimatedUsd, measuredUsd, recordedAt };
}

describe("computeCalibrationFactor", () => {
  it("returns null for empty samples", () => {
    expect(computeCalibrationFactor([])).toBeNull();
  });

  it("returns null when estimated total is zero", () => {
    expect(
      computeCalibrationFactor([sample("a", 0, 10), sample("b", 0, 5)]),
    ).toBeNull();
  });

  it("returns null when measured total is zero", () => {
    expect(
      computeCalibrationFactor([sample("a", 10, 0)]),
    ).toBeNull();
  });

  it("returns null when deviation is within tolerance (<= 10%)", () => {
    // estimated 100, measured 108 → +8% → within tolerance.
    expect(computeCalibrationFactor([sample("a", 100, 108)])).toBeNull();
    // estimated 100, measured 92 → -8% → within tolerance.
    expect(computeCalibrationFactor([sample("a", 100, 92)])).toBeNull();
  });

  it("returns factor = measured/estimated when over by more than 10%", () => {
    // estimated 100, measured 150 → +50% → factor 1.5.
    expect(computeCalibrationFactor([sample("a", 100, 150)])).toBeCloseTo(1.5, 5);
  });

  it("returns factor < 1 when under by more than 10%", () => {
    // estimated 100, measured 40 → -60% → factor 0.4.
    expect(computeCalibrationFactor([sample("a", 100, 40)])).toBeCloseTo(0.4, 5);
  });

  it("aggregates multiple samples before computing factor", () => {
    const factors = computeCalibrationFactor([
      sample("a", 100, 150),
      sample("b", 100, 150),
    ]);
    // totals: est 200, measured 300 → 1.5.
    expect(factors).toBeCloseTo(1.5, 5);
  });

  it("clamps factor to MIN_CALIBRATION_FACTOR", () => {
    // measured 10 / estimated 1000 → 0.01 → clamp to 0.2.
    expect(computeCalibrationFactor([sample("a", 1000, 10)])).toBe(
      MIN_CALIBRATION_FACTOR,
    );
  });

  it("clamps factor to MAX_CALIBRATION_FACTOR", () => {
    // measured 1000 / estimated 10 → 100 → clamp to 5.
    expect(computeCalibrationFactor([sample("a", 10, 1000)])).toBe(
      MAX_CALIBRATION_FACTOR,
    );
  });
});

describe("applyCalibrationFactor", () => {
  it("multiplies estimated by factor", () => {
    expect(applyCalibrationFactor(100, 1.5)).toBe(150);
    expect(applyCalibrationFactor(100, 0.4)).toBe(40);
  });

  it("returns estimated unchanged when factor is 1", () => {
    expect(applyCalibrationFactor(50, 1)).toBe(50);
  });

  it("returns 0 for non-finite estimated", () => {
    expect(applyCalibrationFactor(Number.NaN, 1.5)).toBe(0);
    expect(applyCalibrationFactor(Number.POSITIVE_INFINITY, 1.5)).toBe(0);
  });

  it("returns estimated unchanged when factor is invalid or <= 0", () => {
    expect(applyCalibrationFactor(50, 0)).toBe(50);
    expect(applyCalibrationFactor(50, -1)).toBe(50);
    expect(applyCalibrationFactor(50, Number.NaN)).toBe(50);
  });

  it("clamps corrected estimate to non-negative", () => {
    expect(applyCalibrationFactor(100, 0.2)).toBe(20);
  });
});

describe("buildCalibrationWriteback", () => {
  it("returns applied=true for a valid factor != 1", () => {
    const wb = buildCalibrationWriteback(1.5, 50, 1234);
    expect(wb.applied).toBe(true);
    expect(wb.factor).toBe(1.5);
    expect(wb.derivedAt).toBe(1234);
    expect(wb.totalRelativeDeltaPct).toBe(50);
  });

  it("returns applied=false for factor 1 or invalid", () => {
    expect(buildCalibrationWriteback(1, 0).applied).toBe(false);
    expect(buildCalibrationWriteback(0, 0).applied).toBe(false);
    expect(buildCalibrationWriteback(Number.NaN, 0).applied).toBe(false);
  });

  it("defaults now to Date.now when omitted", () => {
    const before = Date.now();
    const wb = buildCalibrationWriteback(1.2, 20);
    const after = Date.now();
    expect(wb.derivedAt).toBeGreaterThanOrEqual(before);
    expect(wb.derivedAt).toBeLessThanOrEqual(after);
  });
});

describe("serialize / parse stored writeback", () => {
  it("round-trips an applied writeback", () => {
    const wb = buildCalibrationWriteback(1.5, 50, 1234);
    const parsed = parseStoredCalibrationWriteback(
      serializeCalibrationWriteback(wb),
    );
    expect(parsed).toEqual(wb);
  });

  it("returns empty writeback for null / undefined input", () => {
    expect(parseStoredCalibrationWriteback(null)).toEqual(
      EMPTY_CALIBRATION_WRITEBACK,
    );
    expect(parseStoredCalibrationWriteback(undefined)).toEqual(
      EMPTY_CALIBRATION_WRITEBACK,
    );
  });

  it("returns empty writeback for invalid JSON", () => {
    expect(parseStoredCalibrationWriteback("not json")).toEqual(
      EMPTY_CALIBRATION_WRITEBACK,
    );
    expect(parseStoredCalibrationWriteback("[1,2,3]")).toEqual(
      EMPTY_CALIBRATION_WRITEBACK,
    );
  });

  it("tolerates malformed fields and resets factor to 1", () => {
    const parsed = parseStoredCalibrationWriteback(
      JSON.stringify({ applied: true, factor: "bad", derivedAt: null }),
    );
    expect(parsed.applied).toBe(true);
    expect(parsed.factor).toBe(1);
    expect(parsed.derivedAt).toBe(0);
  });
});
