import { describe, expect, it } from "vitest";

import {
  annotateMeasuredInterval,
  isCalibrationActive,
  scaleBudgetGuardrail,
  scaleBudgetHistory,
  scaleCostCockpit,
  scaleCostValue,
  scaleMonthEndForecast,
  scaleSessionComparison,
} from "./calibration-scaling";
import { computeBudgetGuardrail } from "./budget-model";
import type { BudgetGuardrailState } from "./budget-model";
import type { BudgetHistoryMonth } from "./budget-history";
import type { CostCockpit, CockpitSessionPoint } from "./cost-cockpit";
import type { MonthEndForecast } from "./global-budget-forecast";
import type { SessionComparisonSeries } from "./session-comparison";

describe("isCalibrationActive", () => {
  it("is false for 1 / 0 / negative / non-finite", () => {
    expect(isCalibrationActive(1)).toBe(false);
    expect(isCalibrationActive(0)).toBe(false);
    expect(isCalibrationActive(-1)).toBe(false);
    expect(isCalibrationActive(Number.NaN)).toBe(false);
    expect(isCalibrationActive(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("is true for valid factor != 1", () => {
    expect(isCalibrationActive(0.5)).toBe(true);
    expect(isCalibrationActive(1.5)).toBe(true);
    expect(isCalibrationActive(3)).toBe(true);
  });
});

describe("scaleCostValue", () => {
  it("scales a positive amount by factor", () => {
    expect(scaleCostValue(100, 1.5)).toBeCloseTo(150, 5);
    expect(scaleCostValue(100, 0.5)).toBeCloseTo(50, 5);
  });

  it("returns original when factor is invalid or 1", () => {
    expect(scaleCostValue(100, 1)).toBe(100);
    expect(scaleCostValue(100, 0)).toBe(100);
    expect(scaleCostValue(100, Number.NaN)).toBe(100);
    expect(scaleCostValue(100, -2)).toBe(100);
  });

  it("returns 0 for non-positive or non-finite amounts", () => {
    expect(scaleCostValue(0, 1.5)).toBe(0);
    expect(scaleCostValue(-5, 1.5)).toBe(0);
    expect(scaleCostValue(Number.NaN, 1.5)).toBe(0);
  });
});

function makeGuardrail(spentUsd: number): BudgetGuardrailState {
  return computeBudgetGuardrail(200, spentUsd, 80);
}

describe("scaleBudgetGuardrail", () => {
  it("scales spent and recomputes remaining / usedPct / alertLevel", () => {
    // spent 100 → factor 1.5 → 150; budget 200 → usedPct 75 → normal.
    const normal = scaleBudgetGuardrail(makeGuardrail(100), 1.5);
    expect(normal.spentUsd).toBeCloseTo(150, 5);
    expect(normal.remainingUsd).toBeCloseTo(50, 5);
    expect(normal.usedPct).toBeCloseTo(75, 5);
    expect(normal.alertLevel).toBe("normal");

    // spent 120 → factor 1.5 → 180; budget 200 → usedPct 90 → warn.
    const warn = scaleBudgetGuardrail(makeGuardrail(120), 1.5);
    expect(warn.spentUsd).toBeCloseTo(180, 5);
    expect(warn.usedPct).toBeCloseTo(90, 5);
    expect(warn.alertLevel).toBe("warn");
    expect(warn.exceededAlertThreshold).toBe(true);

    // spent 150 → factor 1.5 → 225; budget 200 → usedPct 112.5 → over.
    const over = scaleBudgetGuardrail(makeGuardrail(150), 1.5);
    expect(over.spentUsd).toBeCloseTo(225, 5);
    expect(over.usedPct).toBeCloseTo(112.5, 5);
    expect(over.alertLevel).toBe("over");
    expect(over.remainingUsd).toBe(0);
  });

  it("keeps budget and threshold unchanged", () => {
    const scaled = scaleBudgetGuardrail(makeGuardrail(50), 2);
    expect(scaled.budgetUsd).toBe(200);
    expect(scaled.alertThresholdPct).toBe(80);
  });

  it("returns original when factor is 1", () => {
    const g = makeGuardrail(100);
    expect(scaleBudgetGuardrail(g, 1)).toEqual(g);
  });
});

function makeComparison(costs: readonly number[]): SessionComparisonSeries {
  const points = costs.map((c, i) => ({
    sessionId: `s${i}`,
    title: `S${i}`,
    providerMode: "chat" as const,
    turnCount: i + 1,
    inputTokens: 100,
    outputTokens: 50,
    estimatedCostUsd: c,
    costRatio: costs.length > 0 ? c / Math.max(...costs) : 0,
  }));
  const peakCostUsd = costs.length > 0 ? Math.max(...costs) : 0;
  const totalCostUsd = costs.reduce((s, c) => s + c, 0);
  return {
    points,
    peakCostUsd,
    totalCostUsd,
    sessionCount: costs.length,
    totalTurnCount: costs.length,
  };
}

describe("scaleSessionComparison", () => {
  it("scales per-point cost and totals, keeping ratios", () => {
    const src = makeComparison([10, 20, 40]);
    const scaled = scaleSessionComparison(src, 1.5);
    expect(scaled.points.map((p) => p.estimatedCostUsd)).toEqual([15, 30, 60]);
    expect(scaled.peakCostUsd).toBeCloseTo(60, 5);
    expect(scaled.totalCostUsd).toBeCloseTo(105, 5);
    // costRatio unchanged (all scaled proportionally).
    expect(scaled.points[0].costRatio).toBeCloseTo(src.points[0].costRatio, 5);
    expect(scaled.sessionCount).toBe(3);
    expect(scaled.totalTurnCount).toBe(3);
  });

  it("returns original when factor is 1", () => {
    const src = makeComparison([10, 20]);
    expect(scaleSessionComparison(src, 1)).toBe(src);
  });

  it("returns same reference when inactive factor passed", () => {
    const src = makeComparison([10, 20]);
    expect(scaleSessionComparison(src, Number.NaN)).toBe(src);
  });
});

function makeForecast(): MonthEndForecast {
  return {
    valid: true,
    slopeUsdPerDay: 2,
    fitPointCount: 5,
    remainingDays: 10,
    currentTotalUsd: 100,
    projectedMonthEndUsd: 120,
    projectedDeltaUsd: 20,
    projectedUtilizationPct: 60,
    status: "on-track",
  };
}

describe("scaleMonthEndForecast", () => {
  it("scales current/projected/delta and recomputes utilization vs budget", () => {
    // budget 200 → original utilization 60%; scaled 100→150, projected 120→180 → 90%.
    const scaled = scaleMonthEndForecast(makeForecast(), 1.5, 200);
    expect(scaled.currentTotalUsd).toBeCloseTo(150, 5);
    expect(scaled.projectedMonthEndUsd).toBeCloseTo(180, 5);
    expect(scaled.projectedDeltaUsd).toBeCloseTo(30, 5);
    expect(scaled.projectedUtilizationPct).toBeCloseTo(90, 5);
    expect(scaled.status).toBe("on-track");
  });

  it("keeps non-amount fields and valid flag", () => {
    const scaled = scaleMonthEndForecast(makeForecast(), 2, 200);
    expect(scaled.valid).toBe(true);
    expect(scaled.slopeUsdPerDay).toBe(2);
    expect(scaled.fitPointCount).toBe(5);
    expect(scaled.remainingDays).toBe(10);
  });

  it("returns original when factor is 1", () => {
    const f = makeForecast();
    expect(scaleMonthEndForecast(f, 1, 200)).toBe(f);
  });
});

function makeHistoryMonth(
  spentUsd: number,
  budgetUsd: number,
  monthKey: string,
): BudgetHistoryMonth {
  const usedPct = budgetUsd > 0 ? (spentUsd / budgetUsd) * 100 : 0;
  const status =
    usedPct >= 100 ? "over" : usedPct >= 80 ? "high" : "normal";
  return {
    monthKey,
    monthLabel: monthKey,
    spentUsd,
    budgetUsd,
    usedPct,
    turnCount: 10,
    status,
    overBudget: status === "over",
  };
}

describe("scaleBudgetHistory", () => {
  it("scales spentUsd and recomputes usedPct/status", () => {
    const src = [
      makeHistoryMonth(100, 200, "2026-07"), // used 50% → normal
      makeHistoryMonth(150, 200, "2026-08"), // used 75% → normal
    ];
    const scaled = scaleBudgetHistory(src, 1.5, 80);
    // 100→150 → 75% → normal; 150→225 → 112.5% → over.
    expect(scaled[0].spentUsd).toBeCloseTo(150, 5);
    expect(scaled[0].usedPct).toBeCloseTo(75, 5);
    expect(scaled[0].status).toBe("normal");
    expect(scaled[1].spentUsd).toBeCloseTo(225, 5);
    expect(scaled[1].usedPct).toBeCloseTo(112.5, 5);
    expect(scaled[1].status).toBe("over");
    expect(scaled[1].overBudget).toBe(true);
  });

  it("keeps budget and month metadata", () => {
    const src = [makeHistoryMonth(100, 200, "2026-07")];
    const scaled = scaleBudgetHistory(src, 2, 80);
    expect(scaled[0].budgetUsd).toBe(200);
    expect(scaled[0].monthKey).toBe("2026-07");
    expect(scaled[0].turnCount).toBe(10);
  });

  it("returns a copy (not same ref) when active, and original when factor 1", () => {
    const src = [makeHistoryMonth(100, 200, "2026-07")];
    expect(scaleBudgetHistory(src, 2, 80)).not.toBe(src);
    expect(scaleBudgetHistory(src, 1, 80)).toBe(src);
  });
});

function makeCockpit(costs: readonly number[]): CostCockpit {
  const comparison = makeComparison(costs);
  const guardrail = computeBudgetGuardrail(200, 100, 80);
  const points: CockpitSessionPoint[] = comparison.points.map((p) => ({
    ...p,
    status: "normal",
  }));
  return {
    guardrail,
    comparison: { ...comparison, points },
    overBudgetCount: 0,
    approachingBudgetCount: 0,
    forecast: {
      valid: true,
      fitPointCount: 3,
      horizonDays: 30,
      projectedTotalUsd: 200,
      currentTotalUsd: 70,
      projectedDeltaUsd: 130,
    },
    monthForecast: makeForecast(),
  };
}

describe("annotateMeasuredInterval", () => {
  const forecast = {
    valid: true,
    fitPointCount: 3,
    horizonDays: 30,
    projectedTotalUsd: 300,
    currentTotalUsd: 100,
    projectedDeltaUsd: 200,
  };

  it("returns null when calibration is inactive", () => {
    expect(annotateMeasuredInterval(forecast, 1)).toBeNull();
    expect(annotateMeasuredInterval(forecast, 0)).toBeNull();
  });

  it("returns null when forecast is invalid", () => {
    const invalid = { ...forecast, valid: false };
    expect(annotateMeasuredInterval(invalid, 1.5)).toBeNull();
  });

  it("computes measured interval for overestimate factor (>1)", () => {
    const interval = annotateMeasuredInterval(forecast, 1.5);
    if (interval === null) {
      throw new Error("expected an interval");
    }
    // band: current estimate 100 → current measured 150; projected estimate 300 → 450.
    expect(interval.lowUsd).toBeCloseTo(100, 5);
    expect(interval.highUsd).toBeCloseTo(450, 5);
    expect(interval.measuredCurrentUsd).toBeCloseTo(150, 5);
    expect(interval.measuredProjectedUsd).toBeCloseTo(450, 5);
  });

  it("computes interval for underestimate factor (<1)", () => {
    const interval = annotateMeasuredInterval(forecast, 0.5);
    if (interval === null) {
      throw new Error("expected an interval");
    }
    // band: current estimate 100 → measured 50; projected 300 → 150.
    expect(interval.lowUsd).toBeCloseTo(50, 5);
    expect(interval.highUsd).toBeCloseTo(300, 5);
    expect(interval.measuredCurrentUsd).toBeCloseTo(50, 5);
    expect(interval.measuredProjectedUsd).toBeCloseTo(150, 5);
  });
});

describe("scaleCostCockpit", () => {
  it("scales all cost-bearing views and recomputes session status", () => {
    // guardrail budget 200, spent 100 → factor 1.5 → 150 (warn).
    const src = makeCockpit([50, 40, 30]);
    const scaled = scaleCostCockpit(src, 1.5);
    expect(scaled.guardrail.spentUsd).toBeCloseTo(150, 5);
    expect(scaled.comparison.points.map((p) => p.estimatedCostUsd)).toEqual([
      75, 60, 45,
    ]);
    expect(scaled.comparison.totalCostUsd).toBeCloseTo(180, 5);
    expect(scaled.forecast.currentTotalUsd).toBeCloseTo(105, 5);
    expect(scaled.forecast.projectedTotalUsd).toBeCloseTo(300, 5);
    expect(scaled.monthForecast.currentTotalUsd).toBeCloseTo(150, 5);
  });

  it("recomputes over/approaching counts based on budget share", () => {
    // budget 200 / 3 sessions = share ~66.67; threshold 80% → ~53.33.
    const src = makeCockpit([100, 60, 40]); // 100→over, 60→approaching, 40→normal
    const scaled = scaleCostCockpit(src, 1);
    // factor 1 → unchanged, same counts as original computation.
    expect(scaled.overBudgetCount).toBe(src.overBudgetCount);
  });

  it("returns original when factor is 1", () => {
    const src = makeCockpit([10, 20]);
    expect(scaleCostCockpit(src, 1)).toBe(src);
  });
});
