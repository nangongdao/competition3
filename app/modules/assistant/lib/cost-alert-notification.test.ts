import { describe, expect, it } from "vitest";

import { deriveCostAlerts } from "./cost-alert-notification";
import type { BudgetGuardrailState } from "./budget-model";
import type { MonthEndForecast } from "./global-budget-forecast";
import type { BudgetHistoryMonth } from "./budget-history";

function makeGuardrail(
  overrides: Partial<BudgetGuardrailState>,
): BudgetGuardrailState {
  return {
    enabled: true,
    budgetUsd: 10,
    spentUsd: 8,
    remainingUsd: 2,
    usedPct: 80,
    alertThresholdPct: 80,
    alertLevel: "warn",
    exceededAlertThreshold: true,
    ...overrides,
  };
}

function makeForecast(
  overrides: Partial<MonthEndForecast>,
): MonthEndForecast {
  return {
    valid: true,
    slopeUsdPerDay: 1,
    fitPointCount: 5,
    remainingDays: 10,
    currentTotalUsd: 8,
    projectedMonthEndUsd: 15,
    projectedDeltaUsd: 7,
    projectedUtilizationPct: 150,
    status: "over-budget",
    ...overrides,
  };
}

function makeHistoryMonth(
  overrides: Partial<BudgetHistoryMonth>,
): BudgetHistoryMonth {
  return {
    monthKey: "2026-07",
    monthLabel: "2026-07",
    spentUsd: 8,
    budgetUsd: 10,
    usedPct: 80,
    turnCount: 3,
    status: "normal",
    overBudget: false,
    ...overrides,
  };
}

describe("deriveCostAlerts", () => {
  it("returns an empty list when no alert is triggered", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ enabled: false }),
      monthEndForecast: null,
      budgetHistory: [],
    });
    expect(alerts).toEqual([]);
  });

  it("derives a critical alert when the monthly budget is exceeded", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({
        alertLevel: "over",
        usedPct: 120,
        exceededAlertThreshold: true,
      }),
      monthEndForecast: null,
      budgetHistory: [],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.key).toBe("budget:over");
    expect(alerts[0]?.severity).toBe("critical");
    expect(alerts[0]?.source).toBe("budget");
  });

  it("derives a warning alert when approaching the budget threshold", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "warn", usedPct: 80 }),
      monthEndForecast: null,
      budgetHistory: [],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.key).toBe("budget:warn");
    expect(alerts[0]?.severity).toBe("warning");
  });

  it("derives a critical forecast alert when month-end spend may exceed budget", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "normal", usedPct: 50 }),
      monthEndForecast: makeForecast({ status: "over-budget" }),
      budgetHistory: [],
    });
    expect(alerts.some((a) => a.key === "forecast:over-budget")).toBe(true);
    const forecast = alerts.find((a) => a.key === "forecast:over-budget");
    expect(forecast?.severity).toBe("critical");
  });

  it("ignores an invalid (insufficient samples) forecast", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "normal", usedPct: 50 }),
      monthEndForecast: makeForecast({ valid: false }),
      budgetHistory: [],
    });
    expect(alerts.some((a) => a.key.startsWith("forecast:"))).toBe(false);
  });

  it("derives an at-risk warning forecast alert", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "normal", usedPct: 50 }),
      monthEndForecast: makeForecast({ status: "at-risk", projectedUtilizationPct: 85 }),
      budgetHistory: [],
    });
    expect(alerts.some((a) => a.key === "forecast:at-risk")).toBe(true);
    const forecast = alerts.find((a) => a.key === "forecast:at-risk");
    expect(forecast?.severity).toBe("warning");
  });

  it("derives a history alert only from the latest month", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "normal", usedPct: 40 }),
      monthEndForecast: null,
      budgetHistory: [
        makeHistoryMonth({
          monthKey: "2026-06",
          status: "over",
          usedPct: 150,
          overBudget: true,
        }),
        makeHistoryMonth({
          monthKey: "2026-07",
          status: "normal",
          usedPct: 40,
          overBudget: false,
        }),
      ],
    });
    // 最近月份 normal → 不产生历史告警（前面的 over 月不刷屏）。
    expect(alerts.some((a) => a.key.startsWith("history:"))).toBe(false);
  });

  it("derives a history high alert from the latest month when trending high", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "normal", usedPct: 40 }),
      monthEndForecast: null,
      budgetHistory: [
        makeHistoryMonth({ monthKey: "2026-07", status: "high", usedPct: 82 }),
      ],
    });
    expect(alerts.some((a) => a.key === "history:high")).toBe(true);
    const history = alerts.find((a) => a.key === "history:high");
    expect(history?.severity).toBe("info");
  });

  it("sorts alerts by severity descending (critical before warning before info)", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "warn", usedPct: 80 }),
      monthEndForecast: makeForecast({ status: "over-budget" }),
      budgetHistory: [
        makeHistoryMonth({ monthKey: "2026-07", status: "over", usedPct: 150 }),
      ],
    });
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < alerts.length; i += 1) {
      const rank = (s: string): number =>
        s === "critical" ? 3 : s === "warning" ? 2 : 1;
      expect(rank(alerts[i - 1]?.severity ?? "info")).toBeGreaterThanOrEqual(
        rank(alerts[i]?.severity ?? "info"),
      );
    }
  });

  it("deduplicates identical keys from the same source", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "over", usedPct: 120 }),
      monthEndForecast: makeForecast({ status: "over-budget" }),
      budgetHistory: [],
    });
    const keys = alerts.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("derives an info alert when a calibration writeback is applied", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "normal", usedPct: 40 }),
      monthEndForecast: null,
      budgetHistory: [],
      calibrationWriteback: {
        applied: true,
        factor: 1.5,
        derivedAt: 1000,
        totalRelativeDeltaPct: 50,
      },
    });
    const item = alerts.find((a) => a.key === "calibration:writeback-applied");
    expect(item).toBeDefined();
    expect(item?.source).toBe("calibration");
    expect(item?.severity).toBe("info");
    expect(item?.metricPct).toBe(50);
  });

  it("derives a warning when calibration is needed but not yet written back", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "normal", usedPct: 40 }),
      monthEndForecast: null,
      budgetHistory: [],
      calibrationWriteback: null,
      calibrationNeedsWriteback: true,
    });
    const item = alerts.find((a) => a.key === "calibration:needs-writeback");
    expect(item).toBeDefined();
    expect(item?.source).toBe("calibration");
    expect(item?.severity).toBe("warning");
  });

  it("derives no calibration alert when no writeback and no need to calibrate", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "normal", usedPct: 40 }),
      monthEndForecast: null,
      budgetHistory: [],
      calibrationWriteback: null,
      calibrationNeedsWriteback: false,
    });
    expect(alerts.some((a) => a.source === "calibration")).toBe(false);
  });

  it("prefers the writeback-applied info over the needs-writeback warning", () => {
    const alerts = deriveCostAlerts({
      guardrail: makeGuardrail({ alertLevel: "normal", usedPct: 40 }),
      monthEndForecast: null,
      budgetHistory: [],
      calibrationWriteback: {
        applied: true,
        factor: 1.5,
        derivedAt: 1000,
        totalRelativeDeltaPct: 50,
      },
      calibrationNeedsWriteback: true,
    });
    const calibrationKeys = alerts
      .filter((a) => a.source === "calibration")
      .map((a) => a.key);
    expect(calibrationKeys).toContain("calibration:writeback-applied");
    expect(calibrationKeys).not.toContain("calibration:needs-writeback");
  });
});
