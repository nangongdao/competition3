/**
 * 全局快捷键定义、解析与持久化。
 *
 * 这套纯函数负责把「快捷键」建模成一组可被用户重新绑定的键组合：
 *   - `ShortcutId`：稳定标识（如 `palette.open`、`newSession`）；
 *   - `Shortcut`：默认键位（meta/macOS 下按 Command，其余按 Control 解析）；
 *   - `ShortcutConfig`：用户覆盖（localStorage 持久化），可为 null 表示使用默认；
 *   - `parseShortcut` / `matchShortcutEvent`：把 `KeyboardEvent` 归一化为
 *     `Shortcut` 并比对，忽略平台差异（macOS 的 Meta ⇔ 其它平台的 Control）。
 *
 * 不依赖 React / DOM 之外的环境，便于单测。
 */

/** 全局快捷键的稳定标识。 */
export const SHORTCUT_IDS = [
  "palette.open",
  "newSession",
  "openSessions",
  "toggleTerminal",
  "toggleTheme",
  "goCosts",
  "goHome",
  "toggleConsole",
] as const;
export type ShortcutId = (typeof SHORTCUT_IDS)[number];

/** 支持的修饰键（不含主键）。 */
export type ShortcutModifier = "meta" | "ctrl" | "alt" | "shift";

/** 归一化后的键组合：修饰键集合 + 主键（单字符或 key 名）。 */
export type Shortcut = {
  modifiers: readonly ShortcutModifier[];
  key: string;
};

/** 默认键位表。 */
export const DEFAULT_SHORTCUTS: Readonly<Record<ShortcutId, Shortcut>> = {
  "palette.open": { modifiers: ["meta"], key: "k" },
  newSession: { modifiers: ["meta", "shift"], key: "n" },
  openSessions: { modifiers: ["meta", "shift"], key: "s" },
  toggleTerminal: { modifiers: ["meta", "shift"], key: "`" },
  toggleTheme: { modifiers: ["meta", "shift"], key: "d" },
  goCosts: { modifiers: ["meta"], key: "c" },
  goHome: { modifiers: ["meta"], key: "h" },
  toggleConsole: { modifiers: ["meta", "shift"], key: "c" },
};

/** localStorage key，持久化用户自定义的快捷键覆盖。 */
export const SHORTCUTS_STORAGE_KEY = "app-shortcuts";

export function isShortcutId(value: string): value is ShortcutId {
  return (SHORTCUT_IDS as readonly string[]).includes(value);
}

/** 把任意字符串安全地转为合法 ShortcutId（非法返回 undefined）。 */
export function toShortcutId(value: string | undefined | null): ShortcutId | undefined {
  const candidate = value ?? "";
  return isShortcutId(candidate) ? (candidate as ShortcutId) : undefined;
}

/**
 * 解析「Ctrl/Cmd+Shift+P」形式的快捷键字符串。
 *
 * 返回 null 表示无法解析。修饰键按 `Cmd / Ctrl / Alt / Shift` 识别，
 * 主键为最后一个 token（单个字符或 `,`, `` ` ``, `space` 等命名键）。
 */
export function parseShortcut(raw: string): Shortcut | null {
  const tokens = raw
    .split("+")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }

  const modifiers: ShortcutModifier[] = [];
  let key: string | undefined;

  for (const token of tokens) {
    if (token === "cmd" || token === "command" || token === "meta" || token === "super") {
      modifiers.push("meta");
    } else if (token === "ctrl" || token === "control") {
      modifiers.push("ctrl");
    } else if (token === "alt" || token === "option") {
      modifiers.push("alt");
    } else if (token === "shift") {
      modifiers.push("shift");
    } else {
      if (key !== undefined) {
        // 多个主键 → 非法。
        return null;
      }
      const normalized = normalizeKeyName(token);
      if (!isValidKeyToken(normalized)) {
        // 主键必须是单个字符或已知命名键，否则视为非法输入。
        return null;
      }
      key = normalized;
    }
  }

  if (key === undefined) {
    return null;
  }

  return { modifiers: dedupeModifiers(modifiers), key };
}

/** 把 key 名归一化为稳定的小写形式（` ` → `space`，`` ` `` → `` ` ``）。 */
const NAMED_KEYS = new Set([
  "space",
  "enter",
  "escape",
  "tab",
  "backspace",
  "delete",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "home",
  "end",
  "pageup",
  "pagedown",
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f11",
  "f12",
]);

/** 校验主键 token：单字符或已知命名键。 */
function isValidKeyToken(token: string): boolean {
  if (token.length === 1) {
    return true;
  }
  return NAMED_KEYS.has(token) || token === "`";
}

function normalizeKeyName(token: string): string {
  if (token === "space" || token === " " || token === "spacebar") {
    return "space";
  }
  if (token === "backquote" || token === "`") {
    return "`";
  }
  return token;
}

function dedupeModifiers(modifiers: readonly ShortcutModifier[]): ShortcutModifier[] {
  return [...new Set(modifiers)];
}

/**
 * 把 `KeyboardEvent` 归一化为 `Shortcut`。
 *
 * - 主键取 `event.key`（小写，单字符或命名键名）。
 * - 修饰键：macOS 下 Meta（⌘）记为 `meta`、Control 记为 `ctrl`；
 *   其它平台下 Control 记为 `meta`（与默认绑定的 `meta` 语义等价），
 *   这是「全局快捷键」最常见的惯例（Cmd/Ctrl 语义等价），
 *   保证在非 mac 平台按下 Ctrl 能命中 `meta` 类绑定（如 Ctrl+K）。
 *
 * @param isMac 是否为 macOS（影响 ctrl/meta 归一化；缺省按非 mac 处理）。
 */
export function shortcutFromEvent(
  event: KeyboardEvent,
  isMac = false,
): Shortcut | null {
  const modifiers: ShortcutModifier[] = [];
  if (isMac) {
    if (event.metaKey) modifiers.push("meta");
    if (event.ctrlKey) modifiers.push("ctrl");
  } else {
    // 非 mac：Ctrl 与 Windows 的 Meta 均视为 `meta`（语义等价 Cmd）。
    if (event.metaKey || event.ctrlKey) modifiers.push("meta");
  }
  if (event.altKey) modifiers.push("alt");
  if (event.shiftKey) modifiers.push("shift");

  let key: string;
  if (event.key.length === 1) {
    key = event.key.toLowerCase();
  } else {
    key = event.key.toLowerCase();
    // 命名键归一化：Escape→escape、Backspace→backspace、`→`。
    if (key === "`") key = "`";
  }

  return { modifiers: dedupeModifiers(modifiers), key };
}

/** 两个 `Shortcut` 是否等价（修饰键集合比较，忽略顺序）。 */
export function sameShortcut(a: Shortcut, b: Shortcut): boolean {
  if (a.key !== b.key) return false;
  if (a.modifiers.length !== b.modifiers.length) return false;
  const set = new Set(b.modifiers);
  return a.modifiers.every((modifier) => set.has(modifier));
}

/** 平台感知：macOS 下用 Cmd 图标，否则用 Ctrl 图标。 */
export function isMacPlatform(platform?: string): boolean {
  return platform === "macos" || platform === "darwin";
}

/**
 * 把 `Shortcut` 渲染为人类可读的快捷键字符串（用于 UI 展示）。
 * 例如 `{ modifiers: ["meta"], key: "k" }` → macOS: `⌘K`，其它: `Ctrl+K`。
 */
export function formatShortcut(shortcut: Shortcut, isMac: boolean): string {
  const parts: string[] = [];
  const mods = shortcut.modifiers;

  if (mods.includes("meta")) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (mods.includes("ctrl") && !(mods.includes("meta") && !isMac)) {
    // 在非 mac 平台，`meta` 已渲染为 Ctrl，避免重复。
    parts.push(isMac ? "⌃" : "Ctrl");
  }
  if (mods.includes("alt")) {
    parts.push(isMac ? "⌥" : "Alt");
  }
  if (mods.includes("shift")) {
    parts.push(isMac ? "⇧" : "Shift");
  }

  parts.push(displayKey(shortcut.key));
  return parts.join(isMac ? "" : "+");
}

function displayKey(key: string): string {
  switch (key) {
    case " ":
    case "space":
      return "Space";
    case "enter":
      return "Enter";
    case "escape":
      return "Esc";
    case "arrowup":
      return "↑";
    case "arrowdown":
      return "↓";
    case "arrowleft":
      return "←";
    case "arrowright":
      return "→";
    case "`":
      return "`";
    case "tab":
      return "Tab";
    case "backspace":
      return "⌫";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

/**
 * 把 `Shortcut` 序列化为可编辑字符串（用于配置面板的输入框）。
 * 例如 `{ modifiers: ["meta"], key: "k" }` → `Cmd+K`。
 */
export function shortcutToEditable(shortcut: Shortcut): string {
  const parts: string[] = [];
  if (shortcut.modifiers.includes("meta")) parts.push("Cmd");
  if (shortcut.modifiers.includes("ctrl")) parts.push("Ctrl");
  if (shortcut.modifiers.includes("alt")) parts.push("Alt");
  if (shortcut.modifiers.includes("shift")) parts.push("Shift");
  if (shortcut.key === "space") parts.push("Space");
  else if (shortcut.key === "`") parts.push("`");
  else parts.push(shortcut.key.toUpperCase());
  return parts.join("+");
}

/**
 * 从 localStorage 读取用户自定义快捷键覆盖表。
 * 只接受合法 ShortcutId + 可解析键位，其余忽略（脏数据安全）。
 */
export function loadShortcutOverrides(raw: string | null): Readonly<Record<string, Shortcut>> {
  if (raw == null || raw === "") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const result: Record<string, Shortcut> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isShortcutId(id)) continue;
      if (typeof value !== "string") continue;
      const shortcut = parseShortcut(value);
      if (shortcut !== null) {
        result[id] = shortcut;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** 把自定义快捷键覆盖表序列化写入 localStorage。 */
export function saveShortcutOverrides(overrides: Readonly<Record<string, Shortcut>>): void {
  if (typeof window === "undefined" || window.localStorage == null) {
    return;
  }
  const serialized: Record<string, string> = {};
  for (const [id, shortcut] of Object.entries(overrides)) {
    serialized[id] = shortcutToEditable(shortcut);
  }
  try {
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // 快捷键偏好可选，隐私模式 / 配额异常不应阻断使用。
  }
}

/** 合并默认键位与用户覆盖，得到「生效键位」表。 */
export function resolveShortcuts(
  overrides: Readonly<Record<string, Shortcut>>,
): Readonly<Record<ShortcutId, Shortcut>> {
  const result = { ...DEFAULT_SHORTCUTS } as Record<ShortcutId, Shortcut>;
  for (const id of SHORTCUT_IDS) {
    const override = overrides[id];
    if (override !== undefined) {
      result[id] = override;
    }
  }
  return result;
}

/**
 * 冲突检测：给定「将要绑定的键位」，返回与之冲突的其它快捷键 id 列表。
 *
 * 用于重绑时避免覆盖其它组合——当用户想把某组合赋给一条快捷键时，
 * 如果该组合已被其它生效键位占用，则应当提示用户而不是静默覆盖。
 *
 * @param shortcuts 生效键位表（`resolveShortcuts` 的产物）。
 * @param targetId  正在被重绑的快捷键 id（自身不计入冲突）。
 * @param candidate 拟绑定的新键位。
 * @returns 冲突的其它快捷键 id 数组（按 SHORTCUT_IDS 顺序，无冲突时为空）。
 */
export function findShortcutConflicts(
  shortcuts: Readonly<Record<ShortcutId, Shortcut>>,
  targetId: ShortcutId,
  candidate: Shortcut,
): ShortcutId[] {
  const conflicts: ShortcutId[] = [];
  for (const id of SHORTCUT_IDS) {
    if (id === targetId) continue;
    const bound = shortcuts[id];
    if (bound !== undefined && sameShortcut(bound, candidate)) {
      conflicts.push(id);
    }
  }
  return conflicts;
}

/** 是否存在与给定键位冲突的其它快捷键（`findShortcutConflicts` 的便捷封装）。 */
export function hasShortcutConflict(
  shortcuts: Readonly<Record<ShortcutId, Shortcut>>,
  targetId: ShortcutId,
  candidate: Shortcut,
): boolean {
  return findShortcutConflicts(shortcuts, targetId, candidate).length > 0;
}
