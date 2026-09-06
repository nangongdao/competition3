import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import type { BudgetGuardrailState } from "@/modules/assistant/lib/budget-model";
import type { MonthEndForecast } from "@/modules/assistant/lib/global-budget-forecast";
import {
  useCostAlertNotifications,
  type UseCostAlertNotificationsResult,
} from "./use-cost-alert-notifications";

let captured: UseCostAlertNotificationsResult | undefined;

function Harness(props: {
  isLoaded: boolean;
  guardrail: BudgetGuardrailState;
  monthEndForecast?: MonthEndForecast | null;
}): React.JSX.Element {
  const result = useCostAlertNotifications({
    isLoaded: props.isLoaded,
    input: {
      guardrail: props.guardrail,
      monthEndForecast: props.monthEndForecast,
      budgetHistory: [],
    },
  });
  captured = result;
  return <div data-testid="captured" />;
}

function getResult(): UseCostAlertNotificationsResult {
  if (captured === undefined) {
    throw new Error("useCostAlertNotifications 未被捕获");
  }
  return captured;
}

const GUARDRAIL_OVER: BudgetGuardrailState = {
  enabled: true,
  budgetUsd: 10,
  spentUsd: 12,
  remainingUsd: 0,
  usedPct: 120,
  alertThresholdPct: 80,
  alertLevel: "over",
  exceededAlertThreshold: true,
};

const GUARDRAIL_NORMAL: BudgetGuardrailState = {
  enabled: true,
  budgetUsd: 10,
  spentUsd: 4,
  remainingUsd: 6,
  usedPct: 40,
  alertThresholdPct: 80,
  alertLevel: "normal",
  exceededAlertThreshold: false,
};

const FORECAST_OVER: MonthEndForecast = {
  valid: true,
  slopeUsdPerDay: 1,
  fitPointCount: 5,
  remainingDays: 10,
  currentTotalUsd: 8,
  projectedMonthEndUsd: 15,
  projectedDeltaUsd: 7,
  projectedUtilizationPct: 150,
  status: "over-budget",
};

describe("useCostAlertNotifications", () => {
  beforeEach(() => {
    captured = undefined;
  });

  it("derives no alerts when not loaded yet", () => {
    renderToStaticMarkup(
      <Harness
        isLoaded={false}
        guardrail={GUARDRAIL_OVER}
        monthEndForecast={FORECAST_OVER}
      />,
    );
    const result = getResult();
    expect(result.notifications).toHaveLength(0);
    expect(result.activeCount).toBe(0);
    expect(result.hasFreshAlert).toBe(false);
  });

  it("derives active alerts once loaded", () => {
    renderToStaticMarkup(
      <Harness
        isLoaded={true}
        guardrail={GUARDRAIL_OVER}
        monthEndForecast={FORECAST_OVER}
      />,
    );
    const result = getResult();
    expect(result.notifications.length).toBeGreaterThanOrEqual(2);
    expect(result.activeCount).toBe(result.notifications.length);
    // 首次渲染（effect 未跑）时新活跃告警标记为 true。
    expect(result.hasFreshAlert).toBe(true);
    // 全部未忽略。
    expect(result.notifications.every((n) => !n.dismissed)).toBe(true);
  });

  it("returns no alerts for a normal budget state", () => {
    renderToStaticMarkup(
      <Harness isLoaded={true} guardrail={GUARDRAIL_NORMAL} />,
    );
    const result = getResult();
    expect(result.notifications).toHaveLength(0);
    expect(result.activeCount).toBe(0);
    expect(result.hasFreshAlert).toBe(false);
  });

  it("exposes dismiss / dismissAll / reset callables", () => {
    renderToStaticMarkup(
      <Harness isLoaded={true} guardrail={GUARDRAIL_OVER} />,
    );
    const result = getResult();
    expect(typeof result.dismiss).toBe("function");
    expect(typeof result.dismissAll).toBe("function");
    expect(typeof result.reset).toBe("function");
  });
});
