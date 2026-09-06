import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：用固定实现替换 useTranslation。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { CommandPalette } from "./command-palette";
import type { CommandAction } from "@/modules/assistant/lib/command-registry";

const commands: readonly CommandAction[] = [
  {
    id: "nav-home",
    group: "navigation",
    labelKey: "commandPalette.navHome",
    keywords: ["home"],
    action: () => undefined,
  },
  {
    id: "nav-costs",
    group: "navigation",
    labelKey: "commandPalette.navCosts",
    keywords: ["cost"],
    action: () => undefined,
  },
  {
    id: "panel-cost",
    group: "panels",
    labelKey: "commandPalette.panelCost",
    keywords: ["console"],
    action: () => undefined,
  },
];

describe("CommandPalette", () => {
  it("关闭时不渲染任何内容", () => {
    const html = renderToStaticMarkup(
      <CommandPalette open={false} onClose={() => undefined} commands={commands} />,
    );
    expect(html).toBe("");
  });

  it("打开时渲染对话框与全部命令条目", () => {
    const html = renderToStaticMarkup(
      <CommandPalette open={true} onClose={() => undefined} commands={commands} />,
    );
    expect(html).toContain('data-command-palette-open="true"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-command-id="nav-home"');
    expect(html).toContain('data-command-id="nav-costs"');
    expect(html).toContain('data-command-id="panel-cost"');
  });

  it("打开时渲染分组标签（导航 / 面板）", () => {
    const html = renderToStaticMarkup(
      <CommandPalette open={true} onClose={() => undefined} commands={commands} />,
    );
    expect(html).toContain("commandPalette.group.navigation");
    expect(html).toContain("commandPalette.group.panels");
  });

  it("打开时渲染搜索输入框与键盘提示", () => {
    const html = renderToStaticMarkup(
      <CommandPalette open={true} onClose={() => undefined} commands={commands} />,
    );
    expect(html).toContain('data-command-palette-input="true"');
    expect(html).toContain("commandPalette.placeholder");
    expect(html).toContain("commandPalette.navigate");
  });

  it("无命令时渲染空态提示", () => {
    const html = renderToStaticMarkup(
      <CommandPalette open={true} onClose={() => undefined} commands={[]} />,
    );
    expect(html).toContain("commandPalette.noResults");
  });
});
