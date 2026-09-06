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

import { CostForecastPanel } from "./cost-forecast-panel";
import type { UsageTrendSeries } from "@/modules/assistant/lib/usage-trend";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeSeries(cumulativeCosts: readonly number[]): UsageTrendSeries {
  const points = cumulativeCosts.map((cost, i) => ({
    index: i + 1,
    recordedAt: 1_000_000 + i * DAY_MS,
    estimatedCostUsd: i === 0 ? cost : cost - (cumulativeCosts[i - 1] ?? 0),
    cumulativeCostUsd: cost,
    inputTokens: 100,
    outputTokens: 40,
  }));
  return {
    points,
    peakCostUsd: Math.max(...cumulativeCosts, 0),
    totalCostUsd: cumulativeCosts[cumulativeCosts.length - 1] ?? 0,
    totalInputTokens: points.length * 100,
    totalOutputTokens: points.length * 40,
    peakTokens: 100,
  };
}

describe("CostForecastPanel", () => {
  it("无趋势数据时渲染空提示", () => {
    const html = renderToStaticMarkup(
      <CostForecastPanel series={makeSeries([])} />,
    );
    expect(html).toContain('aria-label="usage.forecastPanel"');
    expect(html).toContain("usage.forecastEmpty");
  });

  it("样本不足时渲染 insufficient 提示", () => {
    const html = renderToStaticMarkup(
      <CostForecastPanel series={makeSeries([0.01, 0.02])} />,
    );
    expect(html).toContain("usage.forecastInsufficient:2");
  });

  it("样本充足时渲染当前/预测/增量与外推图", () => {
    const series = makeSeries([0.01, 0.02, 0.03, 0.04, 0.05]);
    const html = renderToStaticMarkup(
      <CostForecastPanel
        series={series}
        now={series.points[series.points.length - 1]?.recordedAt ?? 0}
        horizon="fixed-days"
        fixedDays={3}
      />,
    );
    expect(html).toContain("usage.forecastCurrent");
    expect(html).toContain("usage.forecastProjected");
    expect(html).toContain("usage.forecastDelta");
    expect(html).toContain('aria-label="usage.forecastChart"');
    expect(html).toContain("usage.forecastNote");
  });
});
