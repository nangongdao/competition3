import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：用固定实现替换 useTranslation。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

// 隔离路由与主题副作用。
vi.mock("react-router", () => ({
  useNavigate: () => () => undefined,
}));
vi.mock("@/modules/assistant/hooks/use-theme", () => ({
  useTheme: () => ({
    preference: "system",
    mode: "dark",
    isDark: true,
    cyclePreference: () => undefined,
    setPreference: () => undefined,
    preferences: ["system", "light", "dark"],
  }),
}));
// 桌面通知在浏览器/SSR 测试环境不真实触发，屏蔽底层调用。
vi.mock("@/modules/assistant/lib/desktop-notification", () => ({
  createNotificationAdapter: () => ({
    requestPermission: async () => "granted",
    permission: () => "granted",
    show: () => undefined,
  }),
  getNotificationPermission: () => "granted",
  requestNotificationPermission: async () => "granted",
  showDesktopNotification: () => undefined,
}));
// 全局快捷键在 SSR 下不触发，屏蔽 localStorage / window 副作用。
vi.mock("@/modules/assistant/hooks/use-global-shortcuts", () => ({
  useGlobalShortcuts: () => ({
    shortcuts: {},
    overrides: {},
    setOverride: () => undefined,
    resetAll: () => undefined,
    format: () => "⌘K",
    isMac: true,
  }),
}));

import { GlobalShortcutHost } from "./global-shortcut-host";

const sampleCommands = [
  {
    id: "nav-home",
    group: "navigation",
    labelKey: "commandPalette.navHome",
    keywords: ["home"],
    action: () => undefined,
  },
] as const;

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    scope: "home" as const,
    commands: sampleCommands,
    ...overrides,
  };
}

describe("GlobalShortcutHost", () => {
  it("mounts without crashing for home scope", () => {
    // 面板默认关闭，渲染为空的 fragment（不抛错）。
    expect(() =>
      renderToStaticMarkup(<GlobalShortcutHost {...makeProps()} />),
    ).not.toThrow();
  });

  it("mounts without crashing for costs scope", () => {
    expect(() =>
      renderToStaticMarkup(
        <GlobalShortcutHost {...makeProps({ scope: "costs" })} />,
      ),
    ).not.toThrow();
  });
});
