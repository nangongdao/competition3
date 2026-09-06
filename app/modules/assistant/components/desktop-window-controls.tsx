import { memo, useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";

import {
  isTauriRuntime,
  useTauri,
} from "@/modules/assistant/hooks/use-tauri";

/**
 * 桌面窗口控制栏。
 *
 * 仅在 Tauri 原生桌面环境显示：提供 最小化 / 最大化(还原) / 关闭 三个窗口
 * 控制按钮，并顺带展示宿主平台标识。浏览器环境下整体隐藏。
 *
 * 放在应用顶部作为原生 titlebar 的替代，让桌面窗口可被用户直接操作。
 */
export const DesktopWindowControls = memo(function DesktopWindowControls(): React.JSX.Element | null {
  const { minimizeWindow, toggleMaximize, closeWindow } = useTauri();
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform, setPlatform] = useState("");

  // 仅 Tauri 环境渲染；浏览器返回 null。
  const [tauri, setTauri] = useState(false);
  useEffect(() => {
    setTauri(isTauriRuntime());
    if (isTauriRuntime()) {
      void (async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        try {
          const p = await invoke<string>("get_host_platform");
          setPlatform(p);
        } catch {
          // ignore
        }
      })();
    }
  }, []);

  const refreshMaximized = useCallback(() => {
    if (!isTauriRuntime()) return;
    void (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      try {
        const m = await invoke<boolean>("is_window_maximized");
        setIsMaximized(m);
      } catch {
        // ignore
      }
    })();
  }, []);

  // 窗口最大化状态可能在系统层面被用户改变，轮询刷新以保持按钮态。
  useEffect(() => {
    if (!tauri) return;
    refreshMaximized();
    const id = window.setInterval(refreshMaximized, 1200);
    return () => window.clearInterval(id);
  }, [tauri, refreshMaximized]);

  if (!tauri) return null;

  return (
    <div
      className="desktop-titlebar"
      data-tauri-drag-region
      aria-label="Desktop window controls"
    >
      <span className="desktop-titlebar__platform" aria-hidden="true">
        {platform}
      </span>
      <div className="desktop-titlebar__actions">
        <button
          type="button"
          className="desktop-titlebar__btn"
          onClick={() => void minimizeWindow()}
          aria-label="Minimize"
          title="Minimize"
        >
          <Minimize2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="desktop-titlebar__btn"
          onClick={() => void toggleMaximize()}
          aria-label={isMaximized ? "Restore" : "Maximize"}
          title={isMaximized ? "Restore" : "Maximize"}
          data-maximized={isMaximized || undefined}
        >
          {isMaximized ? (
            <Minimize2 size={14} aria-hidden="true" />
          ) : (
            <Maximize2 size={14} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="desktop-titlebar__btn desktop-titlebar__btn--close"
          onClick={() => void closeWindow()}
          aria-label="Close"
          title="Close"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
});

