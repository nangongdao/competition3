import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => undefined },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { CostDashboard } from "./cost-dashboard";

/**
 * 成本驾驶舱页面主体冒烟测试。
 *
 * 驾驶舱页面复用整套成本 hook（useCostDashboard + useCostAlertNotifications），
 * 在 SSR（renderToStaticMarkup）下挂载整棵仪表盘树，验证：
 *   1. 组件能无崩溃地渲染（数据未加载态走降级渲染，不抛错）；
 *   2. 顶部标题栏 / 返回工作台入口如期出现；
 *   3. 各成本治理面板容器（预算护栏 / 成本驾驶舱 / 预算历史 / 全局用量 /
 *      跨会话成本对比 / 成本告警中心）都被接线渲染。
 *
 * 注：renderToStaticMarkup 不执行 useEffect，故副作用类（会话初始化、
 * fetch 拉取预算/用量）不会触发；hook 的初始 state（未加载）驱动面板的
 * 「加载中 / 未设置」降级渲染。
 */
describe("CostDashboard 成本驾驶舱冒烟", () => {
  it("能无崩溃地渲染顶部标题栏与返回入口", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CostDashboard />
      </MemoryRouter>,
    );

    expect(html).toContain("usage.costDashboard.title");
    expect(html).toContain("usage.costDashboard.subtitle");
    expect(html).toContain("usage.costDashboard.backToWorkspace");
    expect(html).toContain('href="/"');
  });

  it("渲染预算护栏面板容器", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CostDashboard />
      </MemoryRouter>,
    );

    expect(html).toContain("usage.budgetPanel");
    expect(html).toContain("usage.budgetTitle");
  });

  it("未加载数据时成本驾驶舱走降级空态、预算历史面板仍渲染", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CostDashboard />
      </MemoryRouter>,
    );

    // 驾驶舱聚合在未加载时为 null → 降级为加载空态，而非驾驶舱面板本体。
    expect(html).not.toContain("usage.cockpitPanel");
    expect(html).toContain("usage.costDashboard.notLoaded");
    // 预算历史面板（空历史也渲染容器）仍在。
    expect(html).toContain("usage.budgetHistoryPanel");
  });

  it("渲染全局累计用量与跨会话成本对比面板容器", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CostDashboard />
      </MemoryRouter>,
    );

    expect(html).toContain("usage.globalPanel");
    expect(html).toContain("usage.globalTitle");
    expect(html).toContain("usage.comparisonTitle");
  });

  it("渲染成本告警通知中心（铃铛）", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CostDashboard />
      </MemoryRouter>,
    );

    expect(html).toContain("usage.costAlert");
  });

  it("已应用校准回写时渲染校正提示徽标", () => {
    // 预置一个含 localStorage 的 window 全局，模拟已应用的校准回写（factor 1.5）。
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
      },
    });
    try {
      storage.set(
        "assistant.calibration-writeback",
        JSON.stringify({
          applied: true,
          factor: 1.5,
          derivedAt: Date.now(),
          totalRelativeDeltaPct: 50,
        }),
      );
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <CostDashboard />
        </MemoryRouter>,
      );
      expect(html).toContain("data-calibration-badge");
      expect(html).toContain("usage.costDashboard.calibrated");
      expect(html).toContain("usage.costDashboard.calibrationFactor");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("未回写时（无校准数据）不渲染校正徽标", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
      },
    });
    try {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <CostDashboard />
        </MemoryRouter>,
      );
      expect(html).not.toContain("data-calibration-badge");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
