import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { computeBudgetGuardrail } from "@/modules/assistant/lib/budget-model";
import type { BudgetGuardrailState } from "@/modules/assistant/lib/budget-model";
import type { BudgetHistoryMonth } from "@/modules/assistant/lib/budget-history";
import type { CostCockpit } from "@/modules/assistant/lib/cost-cockpit";
import type { MonthEndForecast } from "@/modules/assistant/lib/global-budget-forecast";
import type { SessionComparisonSeries } from "@/modules/assistant/lib/session-comparison";
import {
  useCalibratedCost,
  type CalibratableBudgetViews,
} from "./use-calibrated-cost";

let captured: CalibratableBudgetViews | undefined;

function Harness(props: {
  views: CalibratableBudgetViews;
  factor: number;
}): React.JSX.Element {
  const result = useCalibratedCost(props.views, props.factor);
  captured = result;
  return <div data-testid="captured" />;
}

function getResult(): CalibratableBudgetViews {
  if (captured === undefined) {
    throw new Error("useCalibratedCost 未被捕获");
  }
  return captured;
}

function makeViews(): CalibratableBudgetViews {
  const guardrail: BudgetGuardrailState = computeBudgetGuardrail(200, 100, 80);
  const comparison: SessionComparisonSeries = {
    points: [
      {
        sessionId: "s1",
        title: "S1",
        providerMode: "chat",
        turnCount: 5,
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 40,
        costRatio: 1,
      },
      {
        sessionId: "s2",
        title: "S2",
        providerMode: "realtime",
        turnCount: 3,
        inputTokens: 60,
        outputTokens: 30,
        estimatedCostUsd: 30,
        costRatio: 0.75,
      },
    ],
    peakCostUsd: 40,
    totalCostUsd: 70,
    sessionCount: 2,
    totalTurnCount: 8,
  };
  const monthEndForecast: MonthEndForecast = {
    valid: true,
    slopeUsdPerDay: 2,
    fitPointCount: 5,
    remainingDays: 10,
    currentTotalUsd: 100,
    projectedMonthEndUsd: 120,
    projectedDeltaUsd: 20,
    projectedUtilizationPct: 50,
    status: "on-track",
  };
  const history: BudgetHistoryMonth[] = [
    {
      monthKey: "2026-07",
      monthLabel: "2026-07",
      spentUsd: 150,
      budgetUsd: 200,
      usedPct: 75,
      turnCount: 20,
      status: "normal",
      overBudget: false,
    },
  ];
  const cockpit: CostCockpit = {
    guardrail,
    comparison: { ...comparison, points: comparison.points.map((p) => ({ ...p, status: "normal" })) },
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
    monthForecast: monthEndForecast,
  };
  return {
    guardrail,
    monthSpentUsd: 100,
    monthEndForecast,
    comparison,
    costCockpit: cockpit,
    budgetHistory: history,
  };
}

describe("useCalibratedCost", () => {
  beforeEach(() => {
    captured = undefined;
  });

  it("returns original views when factor is 1 (no calibration)", () => {
    const views = makeViews();
    renderToStaticMarkup(<Harness views={views} factor={1} />);
    const result = getResult();
    expect(result.guardrail).toBe(views.guardrail);
    expect(result.monthSpentUsd).toBe(100);
    expect(result.comparison).toBe(views.comparison);
    expect(result.costCockpit).toBe(views.costCockpit);
    expect(result.budgetHistory).toBe(views.budgetHistory);
  });

  it("scales all cost-bearing views by factor", () => {
    const views = makeViews();
    renderToStaticMarkup(<Harness views={views} factor={1.5} />);
    const result = getResult();
    // guardrail: spent 100 → 150; budget 200, threshold 80 → usedPct 75 (normal).
    expect(result.guardrail.spentUsd).toBeCloseTo(150, 5);
    expect(result.guardrail.usedPct).toBeCloseTo(75, 5);
    expect(result.guardrail.alertLevel).toBe("normal");
    // month spent scaled.
    expect(result.monthSpentUsd).toBeCloseTo(150, 5);
    // comparison scaled.
    expect(result.comparison.totalCostUsd).toBeCloseTo(105, 5);
    // forecast scaled.
    expect(result.monthEndForecast.currentTotalUsd).toBeCloseTo(150, 5);
    expect(result.monthEndForecast.projectedMonthEndUsd).toBeCloseTo(180, 5);
    // history scaled: 150 → 225 (over).
    expect(result.budgetHistory[0].spentUsd).toBeCloseTo(225, 5);
    expect(result.budgetHistory[0].status).toBe("over");
    // cockpit scaled.
    expect(result.costCockpit?.guardrail.spentUsd).toBeCloseTo(150, 5);
    expect(result.costCockpit?.comparison.totalCostUsd).toBeCloseTo(105, 5);
  });

  it("keeps non-cost fields intact when scaled", () => {
    const views = makeViews();
    renderToStaticMarkup(<Harness views={views} factor={2} />);
    const result = getResult();
    expect(result.comparison.sessionCount).toBe(2);
    expect(result.comparison.totalTurnCount).toBe(8);
    expect(result.budgetHistory[0].budgetUsd).toBe(200);
    expect(result.monthEndForecast.valid).toBe(true);
  });
});
