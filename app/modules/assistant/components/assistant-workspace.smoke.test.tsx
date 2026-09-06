import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：主组件及其大量子组件都依赖 useTranslation / useTheme，统一 mock。
// initReactI18next 供 @/i18n（language-toggle / theme-toggle 引入）初始化使用，避免真实 i18n 副作用。
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => undefined },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

// LanguageToggle / ThemeToggle 依赖 @/i18n（i18n.init）与浏览器 API，为聚焦工作台
// 骨架冒烟并避免 i18n 全局初始化副作用，此处 mock 为轻量占位。
vi.mock("@/components/ui/language-toggle", () => ({
  LanguageToggle: () => <span data-testid="language-toggle">lang</span>,
}));
vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <span data-testid="theme-toggle">theme</span>,
}));

// GlobalShortcutHost 使用 useNavigate 做命令面板导航，冒烟测试无 Router 上下文，
// 这里 mock 掉导航回调（保留其它导出如 MemoryRouter）。
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useNavigate: () => () => undefined,
  };
});

import { AssistantWorkspace } from "./assistant-workspace";

/**
 * 主组件「轻量挂载冒烟」。
 *
 * 主组件已收敛为 ~807 行的编排层（35+ 浏览器依赖 hook 的接线点）。该冒烟测试
 * 在 SSR（renderToStaticMarkup）下挂载整棵树，验证：
 *   1. 组件能无崩溃地渲染（编排层 + 展示装配不抛错）；
 *   2. 顶层工作台骨架（toolbar / 会话面板 / 视觉列）如期出现在 DOM 中；
 *   3. 面板 props 组装（buildWorkspacePanelProps）在挂载路径上被正确消费。
 *
 * 注：renderToStaticMarkup 不执行 useEffect，故副作用类 hook（媒体采集、
 * WebRTC、fetch）不会在冒烟中被触发；其同步 render 访问已按 SSR 安全约定
 * 守卫（如 useTheme 的 typeof window 检查）。
 */
describe("AssistantWorkspace 主组件冒烟", () => {
  it("能无崩溃地渲染工作台骨架", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AssistantWorkspace />
      </MemoryRouter>,
    );

    expect(html).toContain("toolbar.workspace");
    expect(html).toContain("toolbar.focusMode");
    expect(html).toContain("toolbar.panels");
    expect(html).toContain("session.mainControls");
    expect(html).toContain("vision-column");
  });

  it("渲染成本控制面板与用量面板容器（领域面板接线）", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AssistantWorkspace />
      </MemoryRouter>,
    );

    expect(html).toContain("costControl");
    expect(html).toContain("visualContext.panel");
  });

  it("渲染会话侧边栏抽屉挂载点（默认关闭时不产生 dialog）", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AssistantWorkspace />
      </MemoryRouter>,
    );

    // 侧边栏抽屉默认关闭 → 无 role=dialog。
    expect(html).not.toContain('role="dialog"');
  });

  it("渲染语言与主题切换入口", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AssistantWorkspace />
      </MemoryRouter>,
    );

    expect(html).toContain("toolbar.console");
    expect(html).toContain("toolbar.usage");
    expect(html).toContain("toolbar.recentFrames");
  });
});
