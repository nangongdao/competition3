import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts === undefined || Object.keys(opts).length === 0) {
        return key;
      }
      return `${key}:${Object.values(opts).join("/")}`;
    },
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { CostCockpitPanel } from "./cost-cockpit-panel";
import { computeBudgetGuardrail } from "@/modules/assistant/lib/budget-model";
import type { CostCockpit } from "@/modules/assistant/lib/cost-cockpit";
import type { MeasuredInterval } from "@/modules/assistant/lib/calibration-scaling";

function makeCockpit(): CostCockpit {
  return {
    guardrail: computeBudgetGuardrail(200, 100, 80),
    comparison: {
      points: [
        {
          sessionId: "s1",
          title: "会话A",
          providerMode: "realtime",
          turnCount: 5,
          inputTokens: 1000,
          outputTokens: 400,
          estimatedCostUsd: 60,
          costRatio: 1,
          status: "normal",
        },
      ],
      peakCostUsd: 60,
      totalCostUsd: 60,
      sessionCount: 1,
      totalTurnCount: 5,
    },
    overBudgetCount: 0,
    approachingBudgetCount: 0,
    forecast: {
      valid: true,
      fitPointCount: 3,
      horizonDays: 30,
      projectedTotalUsd: 120,
      currentTotalUsd: 60,
      projectedDeltaUsd: 60,
    },
    monthForecast: {
      valid: true,
      slopeUsdPerDay: 2.5,
      status: "on-track",
      currentTotalUsd: 60,
      projectedMonthEndUsd: 90,
      projectedDeltaUsd: 30,
      projectedUtilizationPct: 45,
      remainingDays: 12,
      fitPointCount: 8,
    },
  };
}

describe("CostCockpitPanel", () => {
  it("渲染驾驶舱骨架（护栏摘要 / 会话对比 / 趋势外推）", () => {
    const html = renderToStaticMarkup(
      <CostCockpitPanel cockpit={makeCockpit()} />,
    );
    expect(html).toContain("usage.cockpitPanel");
    expect(html).toContain("usage.budgetSpent");
    expect(html).toContain("usage.forecastTitle");
    expect(html).toContain("$60.0000");
  });

  it("未提供实测区间时不渲染 data-measured-interval 标注", () => {
    const html = renderToStaticMarkup(
      <CostCockpitPanel cockpit={makeCockpit()} />,
    );
    expect(html).not.toContain("data-measured-interval");
  });

  it("提供实测区间时渲染标注（估算 vs 实测漂移范围）", () => {
    const interval: MeasuredInterval = {
      lowUsd: 60,
      highUsd: 90,
      measuredCurrentUsd: 90,
      measuredProjectedUsd: 180,
    };
    const html = renderToStaticMarkup(
      <CostCockpitPanel cockpit={makeCockpit()} measuredInterval={interval} />,
    );
    expect(html).toContain("data-measured-interval");
    expect(html).toContain("usage.cockpitMeasuredInterval");
    expect(html).toContain("usage.cockpitMeasuredCurrent");
    expect(html).toContain("usage.cockpitMeasuredProjected");
    // 区间端点金额渲染（60 – 90 与 180）。
    expect(html).toContain("$60.0000");
    expect(html).toContain("$90.0000");
    expect(html).toContain("$180.0000");
  });

  it("外推无效时不渲染实测区间（即使传入也忽略因 forecast 无效）", () => {
    const cockpit = makeCockpit();
    cockpit.forecast = { ...cockpit.forecast, valid: false };
    const interval: MeasuredInterval = {
      lowUsd: 60,
      highUsd: 90,
      measuredCurrentUsd: 90,
      measuredProjectedUsd: 180,
    };
    const html = renderToStaticMarkup(
      <CostCockpitPanel cockpit={cockpit} measuredInterval={interval} />,
    );
    // 外推无效时面板只渲染 insufficient 提示，不渲染实测区间。
    expect(html).toContain("usage.cockpitForecastInsufficient");
  });
});
