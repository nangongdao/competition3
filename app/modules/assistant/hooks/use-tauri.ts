import { useCallback, useEffect, useState } from "react";

/**
 * 桌面环境（Tauri）检测与宿主平台信息 hook。
 *
 * 在 Tauri 原生桌面应用中，通过 `@tauri-apps/api/core.invoke` 调用 Rust 后端
 * 获取宿主平台。在纯浏览器环境中（无 Tauri），返回 `null` 表示非桌面运行，
 * UI 据此优雅降级（例如隐藏仅桌面可用的终端入口 / 窗口控制栏）。
 *
 * 使用动态 `import` + 环境检测，避免在浏览器 bundle 中引入 Tauri 运行时
 * 依赖导致构建失败或 bundle 膨胀。
 */

export type TauriState =
  | { isTauri: true; platform: string }
  | { isTauri: false; platform: null };

export type SystemInfo = {
  platform: string;
  arch: string;
  cpus: number;
  memoryKb: number;
};

export type UseTauriResult = TauriState & {
  /** 在桌面端执行一条 shell 命令（供终端使用）；浏览器中抛错。 */
  runTerminalCommand: (command: string) => Promise<string>;
  /** 最小化主窗口（仅 Tauri）。 */
  minimizeWindow: () => Promise<void>;
  /** 最大化 / 还原主窗口（仅 Tauri）。 */
  toggleMaximize: () => Promise<boolean>;
  /** 关闭主窗口（仅 Tauri）。 */
  closeWindow: () => Promise<void>;
  /** 切换全屏（仅 Tauri）。 */
  toggleFullscreen: () => Promise<void>;
  /** 当前主窗口是否处于最大化（用于窗口控制按钮态）。 */
  isWindowMaximized: () => Promise<boolean>;
  /** 读取宿主系统信息（平台 / 架构 / 逻辑核 / 内存 KB）。 */
  getSystemInfo: () => Promise<SystemInfo>;
  /** 在操作系统文件管理器中定位指定路径。 */
  revealInFileManager: (path: string) => Promise<void>;
};

/** 纯检测：判断当前运行环境是否为 Tauri 原生桌面。 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function useTauri(): UseTauriResult {
  const [state, setState] = useState<TauriState>(() => ({
    isTauri: false,
    platform: null,
  }));

  useEffect(() => {
    if (!isTauriRuntime()) {
      setState({ isTauri: false, platform: null });
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const platform = await invoke<string>("get_host_platform");
        if (!cancelled) {
          setState({ isTauri: true, platform });
        }
      } catch {
        // Tauri 环境但命令调用失败：退化为已识别但无平台信息。
        if (!cancelled) {
          setState({ isTauri: true, platform: "unknown" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const runTerminalCommand = useCallback(
    async (command: string): Promise<string> => {
      if (!isTauriRuntime()) {
        throw new Error("Desktop terminal unavailable in browser");
      }
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string>("run_terminal_command", { command });
    },
    [],
  );

  const minimizeWindow = useCallback(async (): Promise<void> => {
    if (!isTauriRuntime()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("minimize_window");
  }, []);

  const toggleMaximize = useCallback(async (): Promise<boolean> => {
    if (!isTauriRuntime()) return false;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("maximize_window");
    return true;
  }, []);

  const closeWindow = useCallback(async (): Promise<void> => {
    if (!isTauriRuntime()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("close_window");
  }, []);

  const toggleFullscreen = useCallback(async (): Promise<void> => {
    if (!isTauriRuntime()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("toggle_fullscreen");
  }, []);

  const isWindowMaximized = useCallback(async (): Promise<boolean> => {
    if (!isTauriRuntime()) return false;
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("is_window_maximized");
  }, []);

  const getSystemInfo = useCallback(async (): Promise<SystemInfo> => {
    if (!isTauriRuntime()) {
      return { platform: "web", arch: "web", cpus: 0, memoryKb: 0 };
    }
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<SystemInfo>("get_system_info");
  }, []);

  const revealInFileManager = useCallback(async (path: string): Promise<void> => {
    if (!isTauriRuntime()) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("reveal_in_file_manager", { path });
  }, []);

  return {
    ...state,
    runTerminalCommand,
    minimizeWindow,
    toggleMaximize,
    closeWindow,
    toggleFullscreen,
    isWindowMaximized,
    getSystemInfo,
    revealInFileManager,
  };
}
