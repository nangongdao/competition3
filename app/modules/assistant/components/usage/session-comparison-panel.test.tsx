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

import { SessionComparisonPanel } from "./session-comparison-panel";
import { buildSessionComparisonSeries } from "@/modules/assistant/lib/session-comparison";

describe("SessionComparisonPanel", () => {
  it("无数据时渲染空提示", () => {
    const comparison = buildSessionComparisonSeries([]);
    const html = renderToStaticMarkup(
      <SessionComparisonPanel comparison={comparison} />,
    );
    expect(html).toContain('aria-label="usage.comparisonPanel"');
    expect(html).toContain("usage.comparisonEmpty");
  });

  it("渲染会话数/总成本/总轮次与会话条目", () => {
    const comparison = buildSessionComparisonSeries([
      {
        sessionId: "a",
        title: "A",
        providerMode: "chat",
        turnCount: 2,
        inputTokens: 200,
        outputTokens: 100,
        estimatedCostUsd: 0.03,
        lastRecordedAt: 1000,
      },
      {
        sessionId: "b",
        title: "B",
        providerMode: "realtime",
        turnCount: 1,
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0.05,
        lastRecordedAt: 2000,
      },
    ]);
    const html = renderToStaticMarkup(
      <SessionComparisonPanel comparison={comparison} />,
    );
    expect(html).toContain("usage.comparisonSessions");
    expect(html).toContain("usage.comparisonTotalCost");
    expect(html).toContain("usage.comparisonTurns");
    expect(html).toContain("$0.0800");
    // 会话标题渲染
    expect(html).toContain(">A<");
    expect(html).toContain(">B<");
  });

  it("未命名会话渲染占位标题", () => {
    const comparison = buildSessionComparisonSeries([
      {
        sessionId: "a",
        title: "",
        providerMode: "chat",
        turnCount: 1,
        inputTokens: 100,
        outputTokens: 50,
        estimatedCostUsd: 0.01,
        lastRecordedAt: 1000,
      },
    ]);
    const html = renderToStaticMarkup(
      <SessionComparisonPanel comparison={comparison} />,
    );
    expect(html).toContain("usage.comparisonUntitled");
  });
});
