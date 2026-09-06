import { memo, useState } from "react";
import {
  ChevronDown,
  Eraser,
  Maximize2,
  Minimize2,
  Play,
  Square,
  TerminalSquare,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useDesktopTerminal } from "@/modules/assistant/hooks/use-desktop-terminal";

/** Linear/Modern 终端面板工具按钮。 */
const TERM_BTN =
  "inline-flex min-h-[30px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-transparent px-2 text-[0.78rem] font-[600] text-toolbar-muted transition-[background,border-color,color,transform] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-white/20 hover:bg-white/[0.06] hover:text-toolbar-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-2 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

export type TerminalPanelProps = {
  /** 是否展开显示（由工具栏控制）。 */
  open: boolean;
  onToggle: () => void;
};

/**
 * 内置桌面终端面板。
 *
 * 仅在 Tauri 桌面环境可用；浏览器环境下展示不可用提示并允许收起。
 * 通过 `useDesktopTerminal` 管理与 Rust 后端的交互式 shell 会话。
 */
export const TerminalPanel = memo(function TerminalPanel({
  open,
  onToggle,
}: TerminalPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const {
    status,
    cwdLabel,
    setTerminalElement,
    start,
    stop,
    clear,
    isRunning,
    unavailable,
  } = useDesktopTerminal({ visible: open });

  const [maximized, setMaximized] = useState(false);

  const handleStart = () => {
    void start();
  };

  const handleStop = () => {
    void stop();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed bottom-3 right-3 z-40 inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-[color:var(--color-float-bg)] px-3.5 text-sm font-[600] text-toolbar-fg shadow-[0_6px_20px_rgba(2,3,5,0.5),inset_0_1px_0_0_rgba(255,255,255,0.06)] transition-[transform,background,border-color] duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-white/20 hover:bg-white/[0.07] active:scale-[0.97]"
        title={t("terminal.showTitle")}
      >
        <TerminalSquare size={17} aria-hidden="true" />
        <span>{t("terminal.show")}</span>
      </button>
    );
  }

  return (
    <div
      className={`fixed right-3 bottom-3 left-3 z-40 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--color-float-bg)] shadow-[0_-14px_40px_rgba(2,3,5,0.55),inset_0_1px_0_0_rgba(255,255,255,0.06)] ${
        maximized ? "inset-3 !bottom-3 !top-3 max-h-none" : "max-h-[62vh]"
      }`}
      data-terminal-open="true"
      data-terminal-status={status}
    >
      {/* 标题栏 */}
      <div className="flex min-h-[44px] shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] px-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[color:var(--color-primary)] text-white">
            <TerminalSquare size={14} aria-hidden="true" />
          </span>
          <span className="truncate text-[0.82rem] font-[700] text-toolbar-fg">
            {t("terminal.title")}
          </span>
          <span
            className="max-w-[220px] truncate rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[0.7rem] text-toolbar-muted"
            title={cwdLabel}
          >
            {cwdLabel || t("terminal.prompt")}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!unavailable && !isRunning ? (
            <button type="button" onClick={handleStart} className={TERM_BTN}>
              <Play size={14} aria-hidden="true" />
              <span>{t("terminal.start")}</span>
            </button>
          ) : null}
          {!unavailable && isRunning ? (
            <button type="button" onClick={handleStop} className={TERM_BTN}>
              <Square size={13} aria-hidden="true" />
              <span>{t("terminal.stop")}</span>
            </button>
          ) : null}
          {!unavailable ? (
            <button
              type="button"
              onClick={clear}
              className={TERM_BTN}
              title={t("terminal.clear")}
            >
              <Eraser size={14} aria-hidden="true" />
            </button>
          ) : null}
          {!unavailable ? (
            <button
              type="button"
              onClick={() => setMaximized((m) => !m)}
              className={TERM_BTN}
              title={maximized ? t("terminal.minimize") : t("terminal.maximize")}
            >
              {maximized ? (
                <Minimize2 size={14} aria-hidden="true" />
              ) : (
                <Maximize2 size={14} aria-hidden="true" />
              )}
            </button>
          ) : null}
          <button type="button" onClick={onToggle} className={TERM_BTN}>
            <ChevronDown size={15} aria-hidden="true" />
            <span className="sr-only">{t("terminal.collapse")}</span>
          </button>
        </div>
      </div>

      {/* 终端渲染区 */}
      {unavailable ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <TerminalSquare size={28} className="text-toolbar-muted" aria-hidden="true" />
          <p className="m-0 max-w-md text-sm leading-relaxed text-toolbar-muted">
            {t("terminal.browserOnly")}
          </p>
        </div>
      ) : (
        <div
          ref={setTerminalElement}
          className="terminal-host min-h-[220px] flex-1 overflow-hidden px-1.5 py-1.5"
          aria-label={t("terminal.title")}
        />
      )}

      {/* 底部状态条 */}
      <div className="flex min-h-[30px] shrink-0 items-center justify-between gap-3 border-t border-white/[0.08] px-3.5 text-[0.7rem] text-toolbar-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            data-terminal-dot
            style={{
              background:
                status === "running"
                  ? "var(--color-success-fg, #63d17b)"
                  : status === "error"
                    ? "var(--color-danger-text, #ef6d6d)"
                    : "var(--color-muted)",
            }}
          />
          {t(`terminal.status.${status}`)}
        </span>
        {cwdLabel && status === "running" ? (
          <span className="max-w-[40%] truncate font-mono" title={cwdLabel}>
            {cwdLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
});
