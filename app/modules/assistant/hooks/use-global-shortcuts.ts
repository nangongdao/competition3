import { useCallback, useEffect, useMemo, useState } from "react";

import {
  formatShortcut,
  isMacPlatform,
  loadShortcutOverrides,
  resolveShortcuts,
  sameShortcut,
  saveShortcutOverrides,
  shortcutFromEvent,
  SHORTCUT_IDS,
  type Shortcut,
  type ShortcutId,
} from "@/modules/assistant/lib/shortcuts";

export type GlobalShortcutAction = (shortcutId: ShortcutId) => void;

export type UseGlobalShortcutsResult = {
  /** 生效键位表（合并默认 + 用户覆盖）。 */
  shortcuts: Readonly<Record<ShortcutId, Shortcut>>;
  /** 用户自定义覆盖表。 */
  overrides: Readonly<Record<string, Shortcut>>;
  /** 覆盖某条快捷键（null 表示恢复默认）。 */
  setOverride: (id: ShortcutId, shortcut: Shortcut | null) => void;
  /** 恢复全部默认。 */
  resetAll: () => void;
  /** 格式化快捷键展示（平台感知）。 */
  format: (id: ShortcutId) => string;
  /** 当前是否为 macOS 平台（用于展示 ⌘/Ctrl）。 */
  isMac: boolean;
};

/**
 * 全局快捷键控制器。
 *
 * - 在 `window` 上监听 keydown，把命中生效键位的组合回调 `onTrigger`；
 * - 在 localStorage 持久化用户覆盖；
 * - 提供一个配置面板可调用的 `setOverride` / `resetAll` API。
 *
 * `onTrigger` 用 ref 保持最新引用，避免监听器反复重绑。
 */
export function useGlobalShortcuts(
  onTrigger: GlobalShortcutAction,
): UseGlobalShortcutsResult {
  const [overrides, setOverrides] = useState<Readonly<Record<string, Shortcut>>>(
    () => loadShortcutOverrides(
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem("app-shortcuts"),
    ),
  );
  const [isMac, setIsMac] = useState(() => {
    if (typeof navigator === "undefined") return false;
    return isMacPlatform(navigator.platform ?? navigator.userAgent);
  });

  const shortcuts = useMemo(
    () => resolveShortcuts(overrides),
    [overrides],
  );

  const handlerRef = useMemo(
    () => ({ current: onTrigger }),
    [onTrigger],
  );

  useEffect(() => {
    handlerRef.current = onTrigger;
  }, [onTrigger, handlerRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMac(isMacPlatform(navigator.platform ?? navigator.userAgent));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const pressed = shortcutFromEvent(event, isMac);
      if (pressed === null) {
        return;
      }
      for (const id of SHORTCUT_IDS) {
        const bound = shortcuts[id];
        if (bound !== undefined && sameShortcut(pressed, bound)) {
          event.preventDefault();
          event.stopPropagation();
          handlerRef.current(id);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, handlerRef, isMac]);

  const setOverride = useCallback((id: ShortcutId, shortcut: Shortcut | null): void => {
    setOverrides((current) => {
      const next: Record<string, Shortcut> = {};
      for (const [key, value] of Object.entries(current)) {
        if (key !== id) {
          next[key] = value;
        }
      }
      if (shortcut !== null) {
        next[id] = shortcut;
      }
      saveShortcutOverrides(next);
      return next;
    });
  }, []);

  const resetAll = useCallback((): void => {
    setOverrides({});
    saveShortcutOverrides({});
  }, []);

  const format = useCallback(
    (id: ShortcutId): string => formatShortcut(shortcuts[id], isMac),
    [shortcuts, isMac],
  );

  return {
    shortcuts,
    overrides,
    setOverride,
    resetAll,
    format,
    isMac,
  };
}
