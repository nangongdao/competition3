import { describe, expect, it } from "vitest";

import {
  BUDGET_WARN_RATIO,
  budgetAlertLevel,
  computeBudgetProgress,
  parseBudgetInput,
} from "@/modules/assistant/lib/budget-guard";

describe("parseBudgetInput", () => {
  it("returns null for undefined / null", () => {
    expect(parseBudgetInput(undefined)).toBeNull();
    expect(parseBudgetInput(null)).toBeNull();
  });

  it("returns null for empty / whitespace string", () => {
    expect(parseBudgetInput("")).toBeNull();
    expect(parseBudgetInput("   ")).toBeNull();
  });

  it("parses a positive numeric string", () => {
    expect(parseBudgetInput("5")).toBe(5);
    expect(parseBudgetInput("0.5")).toBeCloseTo(0.5);
  });

  it("parses a positive number", () => {
    expect(parseBudgetInput(10)).toBe(10);
    expect(parseBudgetInput(2.5)).toBeCloseTo(2.5);
  });

  it("returns null for zero / negative", () => {
    expect(parseBudgetInput(0)).toBeNull();
    expect(parseBudgetInput(-5)).toBeNull();
    expect(parseBudgetInput("-3")).toBeNull();
  });

  it("returns null for non-numeric / non-finite", () => {
    expect(parseBudgetInput("abc")).toBeNull();
    expect(parseBudgetInput(Number.NaN)).toBeNull();
    expect(parseBudgetInput(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseBudgetInput({})).toBeNull();
  });
});

describe("budgetAlertLevel", () => {
  it("returns none for zero / invalid ratio", () => {
    expect(budgetAlertLevel(0)).toBe("none");
    expect(budgetAlertLevel(-1)).toBe("none");
    expect(budgetAlertLevel(Number.NaN)).toBe("none");
  });

  it("returns none below warn threshold", () => {
    expect(budgetAlertLevel(BUDGET_WARN_RATIO - 0.1)).toBe("none");
  });

  it("returns warning at/above warn threshold", () => {
    expect(budgetAlertLevel(BUDGET_WARN_RATIO)).toBe("warning");
    expect(budgetAlertLevel(0.9)).toBe("warning");
  });

  it("returns exceeded at/above budget", () => {
    expect(budgetAlertLevel(1)).toBe("exceeded");
    expect(budgetAlertLevel(1.5)).toBe("exceeded");
  });
});

describe("computeBudgetProgress", () => {
  it("returns zero progress when no budget set", () => {
    expect(computeBudgetProgress(2, null)).toEqual({
      ratio: 0,
      percent: 0,
      alertLevel: "none",
    });
    expect(computeBudgetProgress(2, undefined)).toEqual({
      ratio: 0,
      percent: 0,
      alertLevel: "none",
    });
  });

  it("computes ratio / percent below threshold", () => {
    const progress = computeBudgetProgress(0.4, 2);
    expect(progress.ratio).toBeCloseTo(0.2);
    expect(progress.percent).toBe(20);
    expect(progress.alertLevel).toBe("none");
  });

  it("derives warning when >=80% of budget", () => {
    const progress = computeBudgetProgress(1.6, 2);
    expect(progress.percent).toBe(80);
    expect(progress.alertLevel).toBe("warning");
  });

  it("derives exceeded when at/over budget", () => {
    const progress = computeBudgetProgress(2, 2);
    expect(progress.percent).toBe(100);
    expect(progress.alertLevel).toBe("exceeded");
  });

  it("treats non-finite / negative cost as zero", () => {
    expect(computeBudgetProgress(Number.NaN, 2).percent).toBe(0);
    expect(computeBudgetProgress(-3, 2).ratio).toBe(0);
  });

  it("clamps percent to 100+ (never below 0)", () => {
    const progress = computeBudgetProgress(3, 2);
    expect(progress.percent).toBe(150);
    expect(progress.alertLevel).toBe("exceeded");
  });
});
