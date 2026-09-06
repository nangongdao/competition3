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

import { GlobalBudgetPanel } from "./global-budget-panel";
import { computeBudgetGuardrail } from "@/modules/assistant/lib/budget-model";
import {
  buildMonthSpendSeries,
  projectMonthEndSpend,
} from "@/modules/assistant/lib/global-budget-forecast";

describe("GlobalBudgetPanel", () => {
  it("未启用预算时渲染未设置提示", () => {
    const guardrail = computeBudgetGuardrail(0, 0);
    const html = renderToStaticMarkup(
      <GlobalBudgetPanel guardrail={guardrail} monthSpentUsd={0} onSave={vi.fn()} />,
    );
    expect(html).toContain('aria-label="usage.budgetPanel"');
    expect(html).toContain("usage.budgetGuardUnset");
  });

  it("渲染已用/剩余/使用率与进度条", () => {
    const guardrail = computeBudgetGuardrail(10, 4, 80);
    const html = renderToStaticMarkup(
      <GlobalBudgetPanel guardrail={guardrail} monthSpentUsd={4} onSave={vi.fn()} />,
    );
    expect(html).toContain("usage.budgetSpent");
    expect(html).toContain("usage.budgetRemaining");
    expect(html).toContain("usage.budgetUsedPct");
    expect(html).toContain("$4.0000");
    expect(html).toContain("usage.budgetMonthHint:$4.0000");
  });

  it("超过告警阈值时渲染 warn 提示", () => {
    const guardrail = computeBudgetGuardrail(10, 9, 80);
    const html = renderToStaticMarkup(
      <GlobalBudgetPanel guardrail={guardrail} monthSpentUsd={9} onSave={vi.fn()} />,
    );
    expect(html).toContain("usage.budgetWarn:80");
  });

  it("超预算时渲染 over 提示", () => {
    const guardrail = computeBudgetGuardrail(10, 12, 80);
    const html = renderToStaticMarkup(
      <GlobalBudgetPanel guardrail={guardrail} monthSpentUsd={12} onSave={vi.fn()} />,
    );
    expect(html).toContain("usage.budgetOver");
  });

  it("渲染预算与阈值表单输入", () => {
    const guardrail = computeBudgetGuardrail(10, 4, 80);
    const html = renderToStaticMarkup(
      <GlobalBudgetPanel guardrail={guardrail} monthSpentUsd={4} onSave={vi.fn()} />,
    );
    expect(html).toContain('aria-label="usage.budgetAmount"');
    expect(html).toContain('aria-label="usage.budgetThreshold"');
    expect(html).toContain("usage.budgetGuardSave");
  });

  it("渲染有效预测条（on-track）", () => {
    const guardrail = computeBudgetGuardrail(100, 5, 80);
    const series = buildMonthSpendSeries([
      { dayKey: "2026-08-01", spentUsd: 1 },
      { dayKey: "2026-08-02", spentUsd: 1 },
      { dayKey: "2026-08-03", spentUsd: 1 },
      { dayKey: "2026-08-04", spentUsd: 1 },
      { dayKey: "2026-08-05", spentUsd: 1 },
    ]);
    const forecast = projectMonthEndSpend(series, 100, Date.UTC(2026, 7, 5), {
      alertThresholdPct: 80,
    });
    const html = renderToStaticMarkup(
      <GlobalBudgetPanel
        guardrail={guardrail}
        monthSpentUsd={5}
        forecast={forecast}
        onSave={vi.fn()}
      />,
    );
    expect(html).toContain("data-budget-forecast");
    expect(html).toContain("usage.budgetForecastTitle");
    expect(html).toContain("usage.budgetForecastProjected");
    expect(html).toContain("usage.budgetForecastUtilization");
    expect(html).toContain("usage.budgetForecastStatus.on-track");
  });

  it("预测 over-budget 时渲染对应状态徽标", () => {
    const guardrail = computeBudgetGuardrail(20, 10, 80);
    const series = buildMonthSpendSeries(
      [1, 2, 3, 4, 5].map((d) => ({
        dayKey: `2026-08-0${d}`,
        spentUsd: 10,
      })),
    );
    const forecast = projectMonthEndSpend(series, 20, Date.UTC(2026, 7, 5), {
      alertThresholdPct: 80,
    });
    const html = renderToStaticMarkup(
      <GlobalBudgetPanel
        guardrail={guardrail}
        monthSpentUsd={10}
        forecast={forecast}
        onSave={vi.fn()}
      />,
    );
    expect(html).toContain("data-budget-forecast");
    expect(html).toContain("usage.budgetForecastStatus.over-budget");
  });

  it("无效或未启用预测时不渲染预测条", () => {
    const guardrail = computeBudgetGuardrail(0, 0);
    const series = buildMonthSpendSeries([{ dayKey: "2026-08-01", spentUsd: 1 }]);
    const forecast = projectMonthEndSpend(series, 0, Date.UTC(2026, 7, 5));
    const html = renderToStaticMarkup(
      <GlobalBudgetPanel
        guardrail={guardrail}
        monthSpentUsd={0}
        forecast={forecast}
        onSave={vi.fn()}
      />,
    );
    expect(html).not.toContain("data-budget-forecast");
  });
});
