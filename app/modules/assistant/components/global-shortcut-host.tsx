import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { CommandPalette } from "@/modules/assistant/components/command-palette/command-palette";
import { ShortcutSettingsPanel } from "@/modules/assistant/components/shortcut-settings-panel";
import { useGlobalShortcuts } from "@/modules/assistant/hooks/use-global-shortcuts";
import type { CommandAction } from "@/modules/assistant/lib/command-registry";
import {
  createNotificationAdapter,
  getNotificationPermission,
  requestNotificationPermission,
  showDesktopNotification,
} from "@/modules/assistant/lib/desktop-notification";
import { useTheme } from "@/modules/assistant/hooks/use-theme";
import type { ShortcutId } from "@/modules/assistant/lib/shortcuts";

export type GlobalShortcutHostHandle = {
  /** 打开命令面板（供外部工具栏按钮等入口联动）。 */
  openPalette: () => void;
};

type GlobalShortcutHostProps = {
  /** 当前路由作用域（home / costs）。 */
  scope: "home" | "costs";
  /** 该页可执行命令（供命令面板展示）。 */
  commands: readonly CommandAction[];
  /** 是否启用桌面终端（仅 Tauri）。 */
  terminalEnabled?: boolean;
  onToggleTerminal?: () => void;
  onToggleSessions?: () => void;
  onToggleConsole?: () => void;
  onNewSession?: () => void;
};

/**
 * 全局命令面板 + 快捷键宿主。
 *
 * 挂在 `/` 与 `/costs` 两个页面，统一承载：
 *   1. Cmd+K 命令面板（按当前作用域注入的命令列表过滤）；
 *   2. 全局快捷键监听与分发（`useGlobalShortcuts`，可配置）；
 *   3. 快捷键配置面板（Shift+Cmd+？ 或面板内入口）；
 *   4. 桌面通知权限引导（可选）。
 *
 * 通过 `commands` 注入页面命令、通过 props 注入「页面动作」回调，
 * 避免与具体页面状态耦合。
 */
export const GlobalShortcutHost = forwardRef<GlobalShortcutHostHandle, GlobalShortcutHostProps>(
  function GlobalShortcutHost(
    {
      scope,
      commands,
      terminalEnabled = false,
      onToggleTerminal,
      onToggleSessions,
      onToggleConsole,
      onNewSession,
    },
    ref,
  ): React.JSX.Element {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { cyclePreference } = useTheme();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const openPalette = useCallback(() => setPaletteOpen(true), []);
    const closePalette = useCallback(() => setPaletteOpen(false), []);

    // 暴露打开命令面板的句柄（供工具栏按钮等入口调用）。
    useImperativeHandle(
      ref,
      () => ({ openPalette }),
      [openPalette],
    );

    // 桌面通知适配器（浏览器 + Tauri 统一）。
    const notificationAdapterRef = useRef(createNotificationAdapter());

    const requestNotifications = useCallback(async (): Promise<void> => {
      await requestNotificationPermission(notificationAdapterRef.current);
    }, []);

    const triggerShortcut = useCallback(
      (shortcutId: ShortcutId): void => {
        switch (shortcutId) {
          case "openSessions":
            if (onToggleSessions !== undefined) {
              onToggleSessions();
            }
            break;
          case "toggleTerminal":
            if (terminalEnabled && onToggleTerminal !== undefined) {
              onToggleTerminal();
            }
            break;
          case "toggleTheme":
            cyclePreference();
            break;
          case "toggleConsole":
            if (onToggleConsole !== undefined) {
              onToggleConsole();
            }
            break;
          case "goCosts":
            if (scope === "home") {
              navigate("/costs");
            }
            break;
          case "goHome":
            if (scope === "costs") {
              navigate("/");
            }
            break;
          case "newSession":
            if (onNewSession !== undefined) {
              onNewSession();
            }
            break;
          default:
            break;
        }
      },
      [
        onToggleSessions,
        terminalEnabled,
        onToggleTerminal,
        cyclePreference,
        onToggleConsole,
        scope,
        navigate,
        onNewSession,
      ],
    );

    // 全局快捷键监听与分发（唯一快捷键源，含 palette.open → 打开面板）。
    const shortcutController = useGlobalShortcuts(
      (shortcutId: ShortcutId) => {
        if (shortcutId === "palette.open") {
          openPalette();
          return;
        }
        triggerShortcut(shortcutId);
      },
    );

    // 命令面板打开时按 Esc 关闭。
    useEffect(() => {
      if (!paletteOpen) {
        return;
      }
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
          event.preventDefault();
          setPaletteOpen(false);
        }
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [paletteOpen]);

    // 打开快捷键配置面板的入口：Shift+Cmd+? 作为系统保留组合。
    useEffect(() => {
      const handle = (event: KeyboardEvent): void => {
        if (event.shiftKey && event.metaKey && event.key === "?") {
          event.preventDefault();
          setShowSettings((current) => !current);
        }
      };
      window.addEventListener("keydown", handle);
      return () => window.removeEventListener("keydown", handle);
    }, []);

    const settingsCommands = useMemo<readonly CommandAction[]>(
      () => [
        {
          id: "enable-notifications",
          group: "preferences",
          labelKey: "commandPalette.enableNotifications",
          hintKey: "commandPalette.enableNotificationsDesc",
          keywords: ["notification", "通知", "desktop"],
          action: () => {
            void requestNotifications().then(() => {
              if (
                getNotificationPermission(notificationAdapterRef.current) ===
                "granted"
              ) {
                showDesktopNotification(
                  {
                    title: t("notifications.testTitle"),
                    body: t("notifications.testBody"),
                  },
                  notificationAdapterRef.current,
                );
              }
            });
          },
        },
        {
          id: "open-shortcut-settings",
          group: "preferences",
          labelKey: "commandPalette.openSettings",
          hintKey: "commandPalette.openSettingsDesc",
          keywords: ["shortcut", "快捷键", "settings", "设置"],
          action: () => setShowSettings(true),
        },
      ],
      [requestNotifications, t],
    );

    // 命令列表 = 页面命令 + 宿主级设置命令（通知 / 快捷键配置）。
    const allCommands = useMemo<readonly CommandAction[]>(
      () => [...commands, ...settingsCommands],
      [commands, settingsCommands],
    );

    return (
      <>
        <CommandPalette
          open={paletteOpen}
          onClose={closePalette}
          commands={allCommands}
        />
        {showSettings ? (
          <ShortcutSettingsPanel
            onClose={() => setShowSettings(false)}
            shortcuts={shortcutController}
          />
        ) : null}
      </>
    );
  },
);
