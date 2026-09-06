import { describe, expect, it } from "vitest";

import {
  commandMatchesQuery,
  filterCommands,
  highlightSegments,
  moveSelection,
  toFilteredCommands,
} from "@/modules/assistant/lib/command-registry";
import type { CommandAction } from "@/modules/assistant/lib/command-registry";

const commands: readonly CommandAction[] = [
  {
    id: "nav-home",
    group: "navigation",
    labelKey: "commandPalette.navHome",
    hintKey: "commandPalette.navHomeHint",
    keywords: ["home", "workspace", "工作台"],
    action: () => undefined,
  },
  {
    id: "nav-costs",
    group: "navigation",
    labelKey: "commandPalette.navCosts",
    hintKey: "commandPalette.navCostsHint",
    keywords: ["cost", "dashboard", "成本", "驾驶舱"],
    action: () => undefined,
  },
  {
    id: "panel-cost",
    group: "panels",
    labelKey: "commandPalette.panelCost",
    keywords: ["console", "成本", "控制台"],
    action: () => undefined,
  },
  {
    id: "theme-dark",
    group: "preferences",
    labelKey: "commandPalette.themeDark",
    keywords: ["dark", "主题", "暗色"],
    action: () => undefined,
  },
];

describe("command-registry", () => {
  it("返回全部命令当查询为空", () => {
    expect(filterCommands(commands, "")).toHaveLength(commands.length);
    expect(filterCommands(commands, "   ")).toHaveLength(commands.length);
  });

  it("按主标题匹配并忽略大小写", () => {
    const result = filterCommands(commands, "navCosts");
    expect(result.map((c) => c.id)).toEqual(["nav-costs"]);
  });

  it("按关键词匹配", () => {
    expect(filterCommands(commands, "成本").map((c) => c.id)).toEqual([
      "nav-costs",
      "panel-cost",
    ]);
    expect(filterCommands(commands, "dashboard").map((c) => c.id)).toEqual([
      "nav-costs",
    ]);
  });

  it("多词查询需全部命中", () => {
    // "dark theme" 两个词都命中 theme-dark。
    expect(
      filterCommands(commands, "dark 主题").map((c) => c.id),
    ).toEqual(["theme-dark"]);
    // "cost console" 命中 panel-cost。
    expect(
      filterCommands(commands, "cost console").map((c) => c.id),
    ).toEqual(["panel-cost"]);
    // "home cost" 无命令同时命中 → 空。
    expect(filterCommands(commands, "home cost")).toHaveLength(0);
  });

  it("无命中时返回空数组", () => {
    expect(filterCommands(commands, "zzzz-not-found")).toHaveLength(0);
  });

  it("moveSelection 支持下移环绕", () => {
    expect(moveSelection(0, 1, 4)).toBe(1);
    expect(moveSelection(3, 1, 4)).toBe(0); // 尾部下移环绕到首
  });

  it("moveSelection 支持上移环绕", () => {
    expect(moveSelection(2, -1, 4)).toBe(1);
    expect(moveSelection(0, -1, 4)).toBe(3); // 首部上移环绕到尾
  });

  it("moveSelection 处理越界与空列表", () => {
    expect(moveSelection(-1, 1, 4)).toBe(0);
    expect(moveSelection(99, 1, 4)).toBe(0);
    expect(moveSelection(99, -1, 4)).toBe(3);
    expect(moveSelection(0, 1, 0)).toBe(-1);
  });

  it("commandMatchesQuery 判断命中", () => {
    expect(
      commandMatchesQuery(
        { labelKey: "commandPalette.themeDark", group: "preferences", keywords: ["dark"] },
        "dark",
      ),
    ).toBe(true);
    expect(
      commandMatchesQuery(
        { labelKey: "commandPalette.themeDark", group: "preferences", keywords: ["dark"] },
        "light",
      ),
    ).toBe(false);
  });

  it("toFilteredCommands 返回带 matched 标记的全量列表", () => {
    const filtered = toFilteredCommands(commands, "成本");
    expect(filtered).toHaveLength(commands.length);
    const matchedIds = filtered.filter((f) => f.matched).map((f) => f.command.id);
    expect(matchedIds).toEqual(["nav-costs", "panel-cost"]);
  });

  it("highlightSegments 空查询返回整段（不命中）", () => {
    expect(highlightSegments("打开成本驾驶舱", "")).toEqual([
      { text: "打开成本驾驶舱", matched: false },
    ]);
  });

  it("highlightSegments 标记命中子串", () => {
    expect(highlightSegments("打开成本驾驶舱", "成本")).toEqual([
      { text: "打开", matched: false },
      { text: "成本", matched: true },
      { text: "驾驶舱", matched: false },
    ]);
  });

  it("highlightSegments 命中多个片段时逐个标记", () => {
    expect(highlightSegments("成本成本面板", "成本")).toEqual([
      { text: "成本", matched: true },
      { text: "成本", matched: true },
      { text: "面板", matched: false },
    ]);
  });

  it("highlightSegments 大小写不敏感且保留原文", () => {
    expect(highlightSegments("Open Costs", "costs")).toEqual([
      { text: "Open ", matched: false },
      { text: "Costs", matched: true },
    ]);
  });

  it("highlightSegments 未命中时返回整段不命中", () => {
    expect(highlightSegments("打开会话列表", "终端")).toEqual([
      { text: "打开会话列表", matched: false },
    ]);
  });
});
