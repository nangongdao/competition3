import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { ShortcutSettingsPanel } from "./shortcut-settings-panel";
import { DEFAULT_SHORTCUTS } from "@/modules/assistant/lib/shortcuts";

const controller = {
  shortcuts: DEFAULT_SHORTCUTS,
  overrides: {},
  setOverride: () => undefined,
  resetAll: () => undefined,
  format: (id: keyof typeof DEFAULT_SHORTCUTS) => `${id}-fmt`,
  isMac: false,
};

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    onClose: () => undefined,
    shortcuts: controller,
    ...overrides,
  };
}

describe("ShortcutSettingsPanel", () => {
  it("renders a dialog with panel title", () => {
    const html = renderToStaticMarkup(<ShortcutSettingsPanel {...makeProps()} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("shortcuts.panelTitle");
  });

  it("lists every bindable shortcut with its label and formatted key", () => {
    const html = renderToStaticMarkup(<ShortcutSettingsPanel {...makeProps()} />);
    expect(html).toContain("shortcuts.paletteOpen");
    expect(html).toContain("shortcuts.newSession");
    expect(html).toContain("shortcuts.toggleTheme");
    // 每个快捷键都渲染为 kbd，显示格式化后的键位。
    expect(html).toContain("<kbd");
    expect(html).toContain("palette.open-fmt");
  });

  it("provides reset-all action", () => {
    const html = renderToStaticMarkup(<ShortcutSettingsPanel {...makeProps()} />);
    expect(html).toContain("shortcuts.resetAll");
  });
});
