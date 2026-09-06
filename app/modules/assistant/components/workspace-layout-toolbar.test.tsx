import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：用固定实现替换 useTranslation，避免 node 环境下 i18n 初始化依赖。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

// LanguageToggle / ThemeToggle 依赖 @/i18n（i18n.init）与浏览器 API，为聚焦工具栏
// 自身行为并避免 i18n 全局初始化副作用，此处 mock 为轻量占位。
vi.mock("@/components/ui/language-toggle", () => ({
  LanguageToggle: () => <span data-testid="language-toggle">lang</span>,
}));
vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <span data-testid="theme-toggle">theme</span>,
}));

import { WorkspaceLayoutToolbar } from "./workspace-layout-toolbar";
import type { WorkspaceLayout } from "@/modules/assistant/lib/workspace-layout";

function makeLayout(overrides: Partial<WorkspaceLayout> = {}): WorkspaceLayout {
  return {
    version: 1,
    focusMode: "balanced",
    panelOrder: ["session", "vision"],
    sessionWidthPercent: 40,
    panelVisibility: {
      cost: true,
      usage: true,
      visualContext: true,
    },
    ...overrides,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    layout: makeLayout(),
    onFocusModeChange: () => undefined,
    onReset: () => undefined,
    onSessionWidthChange: () => undefined,
    onSwapPanels: () => undefined,
    onTogglePanel: () => undefined,
    onToggleSessions: () => undefined,
    themePreference: "system" as const,
    onThemePreferenceChange: () => undefined,
    ...overrides,
  };
}

describe("WorkspaceLayoutToolbar", () => {
  it("渲染导航容器与工作台 aria-label", () => {
    const html = renderToStaticMarkup(<WorkspaceLayoutToolbar {...makeProps()} />);
    expect(html).toContain("<nav");
    expect(html).toContain('aria-label="toolbar.workspace"');
    expect(html).toContain('aria-label="toolbar.focusMode"');
    expect(html).toContain('aria-label="toolbar.panels"');
  });

  it("渲染三种焦点模式按钮", () => {
    const html = renderToStaticMarkup(<WorkspaceLayoutToolbar {...makeProps()} />);
    expect(html).toContain("toolbar.balanced");
    expect(html).toContain("toolbar.cameraFirst");
    expect(html).toContain("toolbar.conversationFirst");
  });

  it("当前焦点模式标记 data-active=true，其余 false", () => {
    const html = renderToStaticMarkup(
      <WorkspaceLayoutToolbar {...makeProps({ layout: makeLayout({ focusMode: "camera-first" }) })} />,
    );
    expect(html).toContain('data-active="true"');
    expect(html).toContain('data-active="false"');
    // aria-pressed 同步
    expect(html).toContain('aria-pressed="true"');
  });

  it("会话宽度控制渲染当前百分比", () => {
    const html = renderToStaticMarkup(
      <WorkspaceLayoutToolbar {...makeProps({ layout: makeLayout({ sessionWidthPercent: 52 }) })} />,
    );
    expect(html).toContain("52");
    expect(html).toContain('type="range"');
    expect(html).toContain('min="28"');
    expect(html).toContain('max="55"');
  });

  it("渲染会话/交换/重置按钮", () => {
    const html = renderToStaticMarkup(<WorkspaceLayoutToolbar {...makeProps()} />);
    expect(html).toContain("toolbar.sessions");
    expect(html).toContain("toolbar.swapPanels");
    expect(html).toContain("toolbar.reset");
  });

  it("渲染控制台/用量/最近帧面板切换按钮，aria-expanded 跟随可见性", () => {
    const html = renderToStaticMarkup(<WorkspaceLayoutToolbar {...makeProps()} />);
    expect(html).toContain("toolbar.console");
    expect(html).toContain("toolbar.usage");
    expect(html).toContain("toolbar.recentFrames");
    // 三个面板默认均可见
    expect(html).toContain('aria-expanded="true"');
  });

  it("面板可见性为 false 时对应按钮 aria-expanded=false", () => {
    const layout = makeLayout({
      panelVisibility: { cost: false, usage: true, visualContext: false },
    });
    const html = renderToStaticMarkup(
      <WorkspaceLayoutToolbar {...makeProps({ layout })} />,
    );
    expect(html).toContain('aria-expanded="false"');
  });

  it("渲染语言与主题切换占位组件", () => {
    const html = renderToStaticMarkup(<WorkspaceLayoutToolbar {...makeProps()} />);
    expect(html).toContain('data-testid="language-toggle"');
    expect(html).toContain('data-testid="theme-toggle"');
  });

  it("聚焦模式按钮透传 data-active 用于样式态", () => {
    const html = renderToStaticMarkup(
      <WorkspaceLayoutToolbar {...makeProps({ layout: makeLayout({ focusMode: "conversation-first" }) })} />,
    );
    expect(html).toContain('data-active="true"');
    expect(html).toContain('data-active="false"');
  });

  it("sticky 导航类包含工作台布局关键类", () => {
    const html = renderToStaticMarkup(<WorkspaceLayoutToolbar {...makeProps()} />);
    expect(html).toContain("sticky");
    expect(html).toContain("top-0");
    expect(html).toContain("z-40");
  });

  it("交换面板按钮带标题提示", () => {
    const html = renderToStaticMarkup(<WorkspaceLayoutToolbar {...makeProps()} />);
    expect(html).toContain('title="toolbar.swapPanelsTitle"');
  });

  it("会话切换按钮带标题提示", () => {
    const html = renderToStaticMarkup(<WorkspaceLayoutToolbar {...makeProps()} />);
    expect(html).toContain('title="toolbar.sessionList"');
  });

  it("三个面板各自 aria-expanded 与可见性一一对应", () => {
    const layout = makeLayout({
      panelVisibility: { cost: false, usage: true, visualContext: false },
    });
    const html = renderToStaticMarkup(
      <WorkspaceLayoutToolbar {...makeProps({ layout })} />,
    );
    // cost 与 visualContext 面板隐藏时按钮展开态为 false，usage 为 true。
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-expanded="true"');
  });

  it("range 输入框携带宽度范围 min/max/step 与当前值", () => {
    const html = renderToStaticMarkup(
      <WorkspaceLayoutToolbar {...makeProps({ layout: makeLayout({ sessionWidthPercent: 44 }) })} />,
    );
    expect(html).toContain('type="range"');
    expect(html).toContain('min="28"');
    expect(html).toContain('max="55"');
    expect(html).toContain('step="1"');
    expect(html).toContain('value="44"');
  });

  it("三种焦点模式各自 data-active 正确切换", () => {
    for (const [mode, label] of [
      ["balanced", "toolbar.balanced"],
      ["camera-first", "toolbar.cameraFirst"],
      ["conversation-first", "toolbar.conversationFirst"],
    ] as const) {
      const html = renderToStaticMarkup(
        <WorkspaceLayoutToolbar {...makeProps({ layout: makeLayout({ focusMode: mode }) })} />,
      );
      expect(html).toContain(label);
      // 恰好一个按钮 data-active=true（激活的焦点模式）。
      const activeCount = (html.match(/data-active="true"/g) ?? []).length;
      expect(activeCount).toBe(1);
    }
  });

  it("语言与主题切换占位组件保持接线", () => {
    const html = renderToStaticMarkup(<WorkspaceLayoutToolbar {...makeProps()} />);
    expect(html).toContain('data-testid="language-toggle"');
    expect(html).toContain('data-testid="theme-toggle"');
  });
});
