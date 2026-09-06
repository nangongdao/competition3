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

import { CostAlertCenter } from "./cost-alert-center";
import type { CostAlertNotification } from "@/modules/assistant/hooks/use-cost-alert-notifications";

function makeNotification(
  overrides: Partial<CostAlertNotification>,
): CostAlertNotification {
  return {
    key: "budget:over",
    source: "budget",
    severity: "critical",
    titleKey: "costAlert.budgetOverTitle",
    descriptionKey: "costAlert.budgetOverDesc",
    metricPct: 120,
    dismissed: false,
    ...overrides,
  };
}

const dismissSpy = vi.fn();
const dismissAllSpy = vi.fn();

describe("CostAlertCenter", () => {
  it("渲染铃铛入口（始终可见）", () => {
    const html = renderToStaticMarkup(
      <CostAlertCenter
        notifications={[]}
        activeCount={0}
        showBanner={false}
        onDismiss={dismissSpy}
        onDismissAll={dismissAllSpy}
      />,
    );
    expect(html).toContain('data-cost-alert-center');
    expect(html).toContain("costAlert.bellLabel:0");
    expect(html).not.toContain('data-cost-alert-badge');
    expect(html).not.toContain('data-cost-alert-banner');
    expect(html).not.toContain('data-cost-alert-list');
  });

  it("活跃数 > 0 时渲染角标与通知列表", () => {
    const html = renderToStaticMarkup(
      <CostAlertCenter
        notifications={[makeNotification({})]}
        activeCount={1}
        showBanner={false}
        onDismiss={dismissSpy}
        onDismissAll={dismissAllSpy}
      />,
    );
    expect(html).toContain('data-cost-alert-badge');
    expect(html).toContain('data-cost-alert-list');
    expect(html).toContain("costAlert.centerTitle");
    expect(html).toContain("costAlert.budgetOverTitle");
    expect(html).toContain("costAlert.dismissAll");
    // 忽略项不进入列表：这里只放活跃项。
    expect(html).not.toContain('data-cost-alert-banner');
  });

  it("showBanner 为 true 时渲染一次性横幅", () => {
    const html = renderToStaticMarkup(
      <CostAlertCenter
        notifications={[makeNotification({})]}
        activeCount={1}
        showBanner={true}
        onDismiss={dismissSpy}
        onDismissAll={dismissAllSpy}
      />,
    );
    expect(html).toContain('data-cost-alert-banner');
    expect(html).toContain('role="alert"');
  });

  it("已忽略通知不进入活跃列表", () => {
    const html = renderToStaticMarkup(
      <CostAlertCenter
        notifications={[
          makeNotification({}),
          makeNotification({
            key: "forecast:over-budget",
            source: "forecast",
            severity: "critical",
            dismissed: true,
          }),
        ]}
        activeCount={1}
        showBanner={false}
        onDismiss={dismissSpy}
        onDismissAll={dismissAllSpy}
      />
    );
    expect(html).toContain('data-cost-alert-badge');
    // 活跃列表只包含未忽略的那条。
    expect(html).toContain("costAlert.budgetOverTitle");
    expect(html).not.toContain("costAlert.forecastOverTitle");
  });
});
