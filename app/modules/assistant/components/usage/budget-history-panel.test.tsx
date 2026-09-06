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

import { BudgetHistoryPanel } from "./budget-history-panel";
import {
  buildBudgetHistory,
  type MonthUsageSummary,
} from "@/modules/assistant/lib/budget-history";

function month(
  monthKey: string,
  estimatedCostUsd: number,
  turnCount = 1,
): MonthUsageSummary {
  return {
    monthKey,
    turnCount,
    estimatedCostUsd,
    inputTokens: 0,
    outputTokens: 0,
  };
}

describe("BudgetHistoryPanel", () => {
  it("无历史数据时渲染空提示", () => {
    const html = renderToStaticMarkup(<BudgetHistoryPanel history={[]} />);
    expect(html).toContain('aria-label="usage.budgetHistoryPanel"');
    expect(html).toContain("usage.budgetHistoryEmpty");
  });

  it("渲染摘要与逐月条目（倒序展示）", () => {
    const history = buildBudgetHistory(
      [
        month("2026-06", 50, 2),
        month("2026-07", 90, 3),
        month("2026-08", 150, 4),
      ],
      100,
      80,
    );
    const html = renderToStaticMarkup(<BudgetHistoryPanel history={history} />);
    expect(html).toContain("usage.budgetHistoryTitle");
    expect(html).toContain("usage.budgetHistoryTotal");
    // 摘要：1 超限 / 1 趋紧。
    expect(html).toContain("usage.budgetHistoryOverCount:1");
    expect(html).toContain("usage.budgetHistoryHighCount:1");
    // 倒序：最新的 2026-08 在最上方。
    const overIdx = html.indexOf('data-budget-history-month="2026-08"');
    const highIdx = html.indexOf('data-budget-history-month="2026-07"');
    const normalIdx = html.indexOf('data-budget-history-month="2026-06"');
    expect(overIdx).toBeGreaterThan(-1);
    expect(overIdx).toBeLessThan(highIdx);
    expect(highIdx).toBeLessThan(normalIdx);
    // 超限徽标。
    expect(html).toContain("usage.budgetHistoryStatus.over");
    expect(html).toContain("usage.budgetHistoryStatus.high");
  });

  it("预算为 0 时不渲染轮次提示（无预算护栏）", () => {
    const history = buildBudgetHistory([month("2026-08", 5, 2)], 0, 80);
    const html = renderToStaticMarkup(<BudgetHistoryPanel history={history} />);
    // 使用率为 0、状态 normal，无 over/high 徽标。
    expect(html).not.toContain("usage.budgetHistoryStatus.over");
    expect(html).not.toContain("usage.budgetHistoryStatus.high");
    // 无预算时不渲染轮次（避免歧义）。
    expect(html).not.toContain("usage.budgetHistoryTurns");
  });

  it("有预算时渲染逐月使用率与轮次", () => {
    const history = buildBudgetHistory([month("2026-08", 30, 7)], 60, 80);
    const html = renderToStaticMarkup(<BudgetHistoryPanel history={history} />);
    expect(html).toContain("usage.budgetHistoryUtilization:50.0");
    expect(html).toContain("usage.budgetHistoryTurns:7");
    expect(html).toContain('role="progressbar"');
  });
});
