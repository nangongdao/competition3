import { describe, expect, it } from "vitest";

import {
  computeBudgetGuardrail,
  budgetProgressPct,
} from "./budget-model";

describe("computeBudgetGuardrail", () => {
  it("returns disabled state for zero / invalid budget", () => {
    const state = computeBudgetGuardrail(0, 2);
    expect(state.enabled).toBe(false);
    expect(state.alertLevel).toBe("normal");
    expect(state.remainingUsd).toBe(0);

    const invalid = computeBudgetGuardrail(Number.NaN, 2);
    expect(invalid.enabled).toBe(false);
  });

  it("computes used pct and remaining for a normal case", () => {
    const state = computeBudgetGuardrail(10, 4, 80);
    expect(state.enabled).toBe(true);
    expect(state.usedPct).toBeCloseTo(40, 6);
    expect(state.remainingUsd).toBeCloseTo(6, 6);
    expect(state.alertLevel).toBe("normal");
    expect(state.exceededAlertThreshold).toBe(false);
    expect(state.budgetUsd).toBe(10);
  });

  it("raises warn when over the alert threshold but under budget", () => {
    const state = computeBudgetGuardrail(10, 9, 80);
    expect(state.alertLevel).toBe("warn");
    expect(state.exceededAlertThreshold).toBe(true);
    expect(state.remainingUsd).toBeCloseTo(1, 6);
  });

  it("raises over when spent exceeds budget", () => {
    const state = computeBudgetGuardrail(10, 12, 80);
    expect(state.alertLevel).toBe("over");
    expect(state.exceededAlertThreshold).toBe(true);
    expect(state.remainingUsd).toBe(0);
    expect(state.usedPct).toBeCloseTo(120, 6);
  });

  it("clamps invalid threshold to default 80", () => {
    const state = computeBudgetGuardrail(10, 8, Number.NaN);
    expect(state.alertThresholdPct).toBe(80);
    // 8/10 = 80% ≥ 80% 阈值 → warn
    expect(state.alertLevel).toBe("warn");
    expect(state.exceededAlertThreshold).toBe(true);
  });

  it("clamps out-of-range threshold to default 80", () => {
    const state = computeBudgetGuardrail(10, 8, 150);
    expect(state.alertThresholdPct).toBe(80);
  });
});

describe("budgetProgressPct", () => {
  it("caps the progress bar at 100", () => {
    const over = computeBudgetGuardrail(10, 15, 80);
    expect(budgetProgressPct(over)).toBe(100);

    const normal = computeBudgetGuardrail(10, 5, 80);
    expect(budgetProgressPct(normal)).toBe(50);
  });
});
