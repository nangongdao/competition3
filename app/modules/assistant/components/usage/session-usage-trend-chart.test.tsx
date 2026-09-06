import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：用固定实现替换 useTranslation，避免 node 环境下的 i18n 初始化依赖。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { SessionUsageTrendChart } from "./session-usage-trend-chart";

const twoPointSeries = {
  points: [
    {
      index: 1,
      recordedAt: 1000,
      estimatedCostUsd: 0.01,
      cumulativeCostUsd: 0.01,
      inputTokens: 100,
      outputTokens: 40,
    },
    {
      index: 2,
      recordedAt: 2000,
      estimatedCostUsd: 0.02,
      cumulativeCostUsd: 0.03,
      inputTokens: 300,
      outputTokens: 80,
    },
  ],
  peakCostUsd: 0.02,
  totalCostUsd: 0.03,
  totalInputTokens: 400,
  totalOutputTokens: 120,
  peakTokens: 300,
};

describe("SessionUsageTrendChart", () => {
  it("renders the trend panel with aria-label", () => {
    const html = renderToStaticMarkup(
      <SessionUsageTrendChart series={twoPointSeries} />,
    );
    expect(html).toContain('aria-label="usage.trend"');
    expect(html).toContain("usage.trendTitle");
  });

  it("renders totals summary (cost / input / output)", () => {
    const html = renderToStaticMarkup(
      <SessionUsageTrendChart series={twoPointSeries} />,
    );
    expect(html).toContain("usage.trendTotalCost");
    expect(html).toContain("usage.trendInput");
    expect(html).toContain("usage.trendOutput");
    // $0.0300 累计成本
    expect(html).toContain("$0.0300");
  });

  it("renders the SVG chart with bars and cumulative line when points exist", () => {
    const html = renderToStaticMarkup(
      <SessionUsageTrendChart series={twoPointSeries} />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("<polyline");
    expect(html).toContain("<rect");
    expect(html).toContain("usage.trendChartLegend");
  });

  it("renders empty state when no points", () => {
    const empty = { ...twoPointSeries, points: [], totalCostUsd: 0, peakTokens: 0 };
    const html = renderToStaticMarkup(
      <SessionUsageTrendChart series={empty} />,
    );
    expect(html).toContain("usage.trendEmpty");
    expect(html).not.toContain('role="img"');
  });
});
