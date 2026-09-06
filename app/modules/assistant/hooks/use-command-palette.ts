import { useCallback, useEffect, useRef, useState } from "react";

import { moveSelection } from "@/modules/assistant/lib/command-registry";
import type { CommandAction } from "@/modules/assistant/lib/command-registry";

/** 判断按键是否为「打开命令面板」组合（Ctrl/Cmd + K）。 */
export function isOpenShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  if (key !== "k") {
    return false;
  }
  // Cmd(meta) 或 Ctrl；不响应纯字母 k。
  return event.metaKey || event.ctrlKey;
}

/** 供测试的纯守卫：是否应打开命令面板。 */
export function shouldOpenCommandPalette(event: KeyboardEvent): boolean {
  return isOpenShortcut(event);
}

export type UseCommandPaletteResult = {
  /** 面板是否展开（受控态）。 */
  open: boolean;
  /** 当前选中的命令 id（面板关闭时为 null）。 */
  selectedId: string | null;
  /** 关闭面板（Esc / 执行后）。 */
  close: () => void;
  /** 打开面板。 */
  openPalette: () => void;
  /** 上移 / 下移选中项。 */
  moveUp: () => void;
  moveDown: () => void;
  /** 执行指定命令并关闭面板。 */
  run: (command: CommandAction) => void;
};

/**
 * 全局命令面板键盘编排 hook。
 *
 * - 监听 `Ctrl/Cmd + K` 打开、`Esc` 关闭；
 * - 维护选中索引（纯函数 `moveSelection` 推进，支持环绕）；
 * - 执行命令后自动关闭面板。
 *
 * 命令列表由调用方注入（因命令 action 依赖组件上下文）。`open` 为受控态，
 * 供工具栏按钮等外部入口联动（调用 `openPalette()`）。
 */
export function useCommandPalette(commands: readonly CommandAction[]): UseCommandPaletteResult {
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const openPalette = useCallback(() => {
    setOpen(true);
    setSelectedIndex(0);
  }, []);

  const moveUp = useCallback(() => {
    setSelectedIndex((current) => moveSelection(current, -1, commandsRef.current.length));
  }, []);

  const moveDown = useCallback(() => {
    setSelectedIndex((current) => moveSelection(current, 1, commandsRef.current.length));
  }, []);

  const run = useCallback((command: CommandAction) => {
    command.action();
    setOpen(false);
  }, []);

  // 打开时把选中索引重置到首个命令。
  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) =>
          moveSelection(current, 1, commandsRef.current.length),
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) =>
          moveSelection(current, -1, commandsRef.current.length),
        );
        return;
      }
      if (event.key === "Enter" && commandsRef.current.length > 0) {
        event.preventDefault();
        const list = commandsRef.current;
        const index = Math.min(list.length - 1, Math.max(0, selectedIndex));
        list[index]?.action();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, selectedIndex]);

  // 全局 Ctrl/Cmd + K 打开（任何面板状态都生效）。
  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent): void {
      if (isOpenShortcut(event)) {
        event.preventDefault();
        setSelectedIndex(0);
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  const selectedId = open ? (commands[selectedIndex]?.id ?? null) : null;

  return {
    open,
    selectedId,
    close,
    openPalette,
    moveUp,
    moveDown,
    run,
  };
}
