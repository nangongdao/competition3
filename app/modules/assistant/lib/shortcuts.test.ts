import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHORTCUTS,
  findShortcutConflicts,
  formatShortcut,
  hasShortcutConflict,
  loadShortcutOverrides,
  parseShortcut,
  resolveShortcuts,
  sameShortcut,
  shortcutFromEvent,
  shortcutToEditable,
  SHORTCUT_IDS,
  type Shortcut,
} from "@/modules/assistant/lib/shortcuts";

describe("shortcut parsing (global shortcuts)", () => {
  it("parses Cmd/Ctrl+Shift+P style strings", () => {
    expect(parseShortcut("Cmd+Shift+P")).toEqual({
      modifiers: ["meta", "shift"],
      key: "p",
    });
    expect(parseShortcut("Ctrl+Alt+1")).toEqual({
      modifiers: ["ctrl", "alt"],
      key: "1",
    });
  });

  it("normalizes modifier aliases", () => {
    expect(parseShortcut("command+k")?.modifiers).toContain("meta");
    expect(parseShortcut("control+s")?.modifiers).toContain("ctrl");
    expect(parseShortcut("option+a")?.modifiers).toContain("alt");
    expect(parseShortcut("shift+z")?.modifiers).toContain("shift");
  });

  it("maps space and backquote names", () => {
    expect(parseShortcut("Cmd+Space")).toEqual({ modifiers: ["meta"], key: "space" });
    expect(parseShortcut("Ctrl+`")).toEqual({ modifiers: ["ctrl"], key: "`" });
  });

  it("rejects empty or multi-key inputs", () => {
    expect(parseShortcut("")).toBeNull();
    expect(parseShortcut("   ")).toBeNull();
    expect(parseShortcut("Cmd+K+P")).toBeNull();
    expect(parseShortcut("Shift")).toBeNull();
  });

  it("dedupes repeated modifiers", () => {
    const parsed = parseShortcut("Ctrl+Ctrl+S");
    expect(parsed?.modifiers).toEqual(["ctrl"]);
  });
});

describe("shortcut equality and resolution", () => {
  it("compares modifier sets ignoring order", () => {
    expect(
      sameShortcut(
        { modifiers: ["meta", "shift"], key: "n" },
        { modifiers: ["shift", "meta"], key: "n" },
      ),
    ).toBe(true);
    expect(
      sameShortcut(
        { modifiers: ["meta"], key: "n" },
        { modifiers: ["shift"], key: "n" },
      ),
    ).toBe(false);
    expect(
      sameShortcut(
        { modifiers: ["meta"], key: "n" },
        { modifiers: ["meta"], key: "m" },
      ),
    ).toBe(false);
  });

  it("resolves defaults when no overrides present", () => {
    const resolved = resolveShortcuts({});
    expect(resolved["palette.open"]).toEqual({ modifiers: ["meta"], key: "k" });
    expect(resolved.newSession).toEqual({ modifiers: ["meta", "shift"], key: "n" });
  });

  it("applies valid overrides over defaults", () => {
    const resolved = resolveShortcuts({
      "palette.open": { modifiers: ["alt"], key: "p" },
    });
    expect(resolved["palette.open"]).toEqual({ modifiers: ["alt"], key: "p" });
    // 未覆盖的仍用默认。
    expect(resolved.newSession).toEqual(DEFAULT_SHORTCUTS.newSession);
  });
});

describe("shortcut serialization and storage", () => {
  it("loads only valid ids and parseable values", () => {
    const overrides = loadShortcutOverrides(
      JSON.stringify({
        "palette.open": "Alt+P",
        unknownId: "Cmd+Q",
        newSession: "not-a-shortcut",
      }),
    );
    expect(overrides["palette.open"]).toEqual({ modifiers: ["alt"], key: "p" });
    expect(overrides.unknownId).toBeUndefined();
    expect(overrides.newSession).toBeUndefined();
  });

  it("returns empty on malformed storage", () => {
    expect(loadShortcutOverrides(null)).toEqual({});
    expect(loadShortcutOverrides("")).toEqual({});
    expect(loadShortcutOverrides("{bad json")).toEqual({});
    expect(loadShortcutOverrides("42")).toEqual({});
  });

  it("round-trips editable string", () => {
    expect(shortcutToEditable({ modifiers: ["meta", "shift"], key: "p" })).toBe("Cmd+Shift+P");
    expect(shortcutToEditable({ modifiers: ["alt"], key: "space" })).toBe("Alt+Space");
  });
});

describe("shortcut formatting", () => {
  it("renders macOS vs non-mac layouts", () => {
    expect(formatShortcut({ modifiers: ["meta"], key: "k" }, true)).toBe("⌘K");
    expect(formatShortcut({ modifiers: ["meta"], key: "k" }, false)).toBe("Ctrl+K");
    expect(formatShortcut({ modifiers: ["meta", "shift"], key: "n" }, true)).toBe("⌘⇧N");
    expect(formatShortcut({ modifiers: ["meta", "shift"], key: "n" }, false)).toBe("Ctrl+Shift+N");
  });

  it("maps named keys to symbols", () => {
    expect(formatShortcut({ modifiers: [], key: "space" }, true)).toBe("Space");
    expect(formatShortcut({ modifiers: [], key: "escape" }, false)).toBe("Esc");
    expect(formatShortcut({ modifiers: [], key: "arrowup" }, true)).toBe("↑");
  });
});

describe("event to shortcut (platform normalized)", () => {
  function fakeEvent(partial: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      key: "",
      code: "",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...partial,
    } as KeyboardEvent;
  }

  it("maps single-char keys to lowercase", () => {
    const shortcut = shortcutFromEvent(fakeEvent({ key: "K", metaKey: true }));
    expect(shortcut).toEqual({ modifiers: ["meta"], key: "k" });
  });

  it("collects all pressed modifiers on non-mac (ctrl maps to meta)", () => {
    // 非 mac（默认 isMac=false）：Ctrl 归一化为 meta（语义等价 Cmd）。
    const shortcut = shortcutFromEvent(
      fakeEvent({ key: "p", ctrlKey: true, altKey: true, shiftKey: true }),
    );
    expect(shortcut).not.toBeNull();
    const modifiers = shortcut ? [...shortcut.modifiers] : [];
    expect(modifiers.sort()).toEqual(["alt", "meta", "shift"]);
  });

  it("keeps meta/ctrl distinct on mac", () => {
    const shortcut = shortcutFromEvent(
      fakeEvent({ key: "k", ctrlKey: true, metaKey: true }),
      true,
    );
    expect(shortcut).not.toBeNull();
    const modifiers = shortcut ? [...shortcut.modifiers] : [];
    expect(modifiers.sort()).toEqual(["ctrl", "meta"]);
  });

  it("maps Ctrl on non-mac to meta so Ctrl+K matches meta bindings", () => {
    const ctrlK = shortcutFromEvent(fakeEvent({ key: "k", ctrlKey: true }));
    const metaK = shortcutFromEvent(fakeEvent({ key: "k", metaKey: true }));
    expect(ctrlK).toEqual({ modifiers: ["meta"], key: "k" });
    expect(metaK).toEqual({ modifiers: ["meta"], key: "k" });
  });

  it("maps Escape to escape key name", () => {
    const shortcut = shortcutFromEvent(fakeEvent({ key: "Escape" }));
    expect(shortcut?.key).toBe("escape");
  });
});

describe("shortcut ids integrity", () => {
  it("exposes all default shortcuts for every id", () => {
    for (const id of SHORTCUT_IDS) {
      expect(DEFAULT_SHORTCUTS[id]).toBeDefined();
    }
  });
});

describe("shortcut conflict detection", () => {
  const base: Readonly<Record<string, Shortcut>> = DEFAULT_SHORTCUTS;

  it("reports no conflict when the combo is unused by other ids", () => {
    const conflicts = findShortcutConflicts(
      base,
      "palette.open",
      { modifiers: ["meta", "alt", "shift"], key: "q" },
    );
    expect(conflicts).toEqual([]);
    expect(hasShortcutConflict(base, "palette.open", {
      modifiers: ["meta", "alt", "shift"],
      key: "q",
    })).toBe(false);
  });

  it("detects a conflict with another shortcut's effective binding", () => {
    // toggleConsole 默认是 meta+shift+c，与 goCosts 的 meta+c 不同；
    // 把 goCosts 重绑成 meta+shift+c 会与 toggleConsole 冲突。
    const conflicts = findShortcutConflicts(
      base,
      "goCosts",
      { modifiers: ["meta", "shift"], key: "c" },
    );
    expect(conflicts).toContain("toggleConsole");
    expect(conflicts).not.toContain("goCosts");
    expect(hasShortcutConflict(base, "goCosts", {
      modifiers: ["meta", "shift"],
      key: "c",
    })).toBe(true);
  });

  it("excludes the target id itself even if it re-binds to its own combo", () => {
    const conflicts = findShortcutConflicts(
      base,
      "newSession",
      { modifiers: ["meta", "shift"], key: "n" },
    );
    expect(conflicts).toEqual([]);
  });

  it("honors user overrides when detecting conflicts", () => {
    const effective = resolveShortcuts({
      toggleTerminal: { modifiers: ["meta", "shift"], key: "`" },
      goHome: { modifiers: ["meta", "shift"], key: "t" },
    });
    // toggleTheme 默认是 meta+shift+d；把 goHome 重绑成 meta+shift+d 会冲突。
    const conflicts = findShortcutConflicts(
      effective,
      "goHome",
      { modifiers: ["meta", "shift"], key: "d" },
    );
    expect(conflicts).toContain("toggleTheme");
    expect(conflicts).not.toContain("toggleTerminal");
    expect(conflicts).not.toContain("goHome");
  });
});
