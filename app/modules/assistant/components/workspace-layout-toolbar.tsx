import { memo } from "react";
import {
  Columns2,
  Focus,
  MessagesSquare,
  PanelLeftClose,
  RotateCcw,
  Rows3,
  Search,
  TerminalSquare,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { LanguageToggle } from "@/components/ui/language-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type {
  WorkspaceFocusMode,
  WorkspaceLayout,
} from "@/modules/assistant/lib/workspace-layout";
import type { ThemePreference } from "@/modules/assistant/lib/theme";

/** Linear/Modern 工具栏按钮：玻璃表面，激活/按下时靛蓝填充。 */
const TOOLBAR_BTN =
  "inline-flex min-h-[36px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-transparent px-2.5 text-[0.82rem] font-[600] text-toolbar-muted transition-[background,border-color,color,transform] duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-white/20 hover:bg-white/[0.06] hover:text-toolbar-fg focus-visible:border-white/20 focus-visible:bg-white/[0.06] focus-visible:text-toolbar-fg focus-visible:outline-none active:scale-[0.98] data-[active=true]:border-[color:var(--color-primary)] data-[active=true]:bg-[color:var(--color-primary)] data-[active=true]:text-white max-[768px]:shrink-0";

type WorkspaceLayoutToolbarProps = {
  layout: WorkspaceLayout;
  onFocusModeChange: (focusMode: WorkspaceFocusMode) => void;
  onReset: () => void;
  onSessionWidthChange: (sessionWidthPercent: number) => void;
  onSwapPanels: () => void;
  onTogglePanel: (panel: keyof WorkspaceLayout["panelVisibility"]) => void;
  onToggleSessions: () => void;
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
  /** 是否显示内置终端开关（桌面环境专用）。 */
  terminalEnabled?: boolean;
  /** 终端是否展开。 */
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
  /** 打开全局命令面板（M10.8）。 */
  onOpenCommandPalette?: () => void;
};

export const WorkspaceLayoutToolbar = memo(function WorkspaceLayoutToolbar({
  layout,
  onFocusModeChange,
  onReset,
  onSessionWidthChange,
  onSwapPanels,
  onTogglePanel,
  onToggleSessions,
  themePreference,
  onThemePreferenceChange,
  terminalEnabled = false,
  terminalOpen = false,
  onToggleTerminal,
  onOpenCommandPalette,
}: WorkspaceLayoutToolbarProps): React.JSX.Element {
  const { t } = useTranslation();

  const focusModes: readonly {
    value: WorkspaceFocusMode;
    label: string;
  }[] = [
    { value: "balanced", label: t("toolbar.balanced") },
    { value: "camera-first", label: t("toolbar.cameraFirst") },
    { value: "conversation-first", label: t("toolbar.conversationFirst") },
  ];

  return (
    <nav
      className="sticky top-0 z-40 col-span-full row-start-1 flex min-h-[58px] min-w-0 items-center justify-between gap-3 border-b border-toolbar-border bg-toolbar-bg px-[clamp(14px,2vw,28px)] py-[9px] text-toolbar-fg backdrop-blur-xl max-[768px]:relative max-[768px]:flex-col max-[768px]:items-start"
      aria-label={t("toolbar.workspace")}
    >
      <div
        className="flex min-w-0 items-center gap-1.5 max-[768px]:w-full max-[768px]:overflow-x-auto max-[768px]:pb-0.5"
        aria-label={t("toolbar.focusMode")}
      >
        <Focus size={16} aria-hidden="true" />
        {focusModes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            data-active={layout.focusMode === mode.value}
            aria-pressed={layout.focusMode === mode.value}
            onClick={() => onFocusModeChange(mode.value)}
            className={TOOLBAR_BTN}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div
        className="flex min-w-0 items-center gap-1.5 overflow-x-auto max-[768px]:w-full max-[768px]:pb-0.5"
        aria-label={t("toolbar.panels")}
      >
        <label className="grid min-h-[36px] grid-cols-[auto_86px] items-center gap-2 rounded-lg border border-white/[0.08] px-2.5 text-[0.78rem] font-[600] text-toolbar-muted">
          <span>{t("toolbar.controlWidth", { percent: layout.sessionWidthPercent })}</span>
          <input
            type="range"
            min="28"
            max="55"
            step="1"
            value={layout.sessionWidthPercent}
            onChange={(event) => onSessionWidthChange(Number(event.target.value))}
            className="w-[86px] accent-primary"
          />
        </label>
        <button
          type="button"
          onClick={onToggleSessions}
          title={t("toolbar.sessionList")}
          className={TOOLBAR_BTN}
        >
          <MessagesSquare size={16} aria-hidden="true" />
          <span>{t("toolbar.sessions")}</span>
        </button>
        <button
          type="button"
          onClick={onSwapPanels}
          title={t("toolbar.swapPanelsTitle")}
          className={TOOLBAR_BTN}
        >
          <Columns2 size={16} aria-hidden="true" />
          <span>{t("toolbar.swapPanels")}</span>
        </button>
        <button
          type="button"
          aria-expanded={layout.panelVisibility.cost}
          onClick={() => onTogglePanel("cost")}
          className={`${TOOLBAR_BTN} aria-expanded:border-[color:var(--color-primary)] aria-expanded:bg-[color:var(--color-primary)] aria-expanded:text-white`}
        >
          <PanelLeftClose size={16} aria-hidden="true" />
          <span>{t("toolbar.console")}</span>
        </button>
        <button
          type="button"
          aria-expanded={layout.panelVisibility.usage}
          onClick={() => onTogglePanel("usage")}
          className={`${TOOLBAR_BTN} aria-expanded:border-[color:var(--color-primary)] aria-expanded:bg-[color:var(--color-primary)] aria-expanded:text-white`}
        >
          <Rows3 size={16} aria-hidden="true" />
          <span>{t("toolbar.usage")}</span>
        </button>
        <button
          type="button"
          aria-expanded={layout.panelVisibility.visualContext}
          onClick={() => onTogglePanel("visualContext")}
          className={`${TOOLBAR_BTN} aria-expanded:border-[color:var(--color-primary)] aria-expanded:bg-[color:var(--color-primary)] aria-expanded:text-white`}
        >
          <Rows3 size={16} aria-hidden="true" />
          <span>{t("toolbar.recentFrames")}</span>
        </button>
        {terminalEnabled ? (
          <button
            type="button"
            onClick={onToggleTerminal}
            className={`${TOOLBAR_BTN} ${terminalOpen ? "aria-expanded:border-[color:var(--color-primary)] aria-expanded:bg-[color:var(--color-primary)] aria-expanded:text-white" : ""}`}
            aria-expanded={terminalOpen}
            title={t("toolbar.terminalShow")}
          >
            <TerminalSquare size={16} aria-hidden="true" />
            <span>{t("toolbar.terminal")}</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className={TOOLBAR_BTN}
          title={t("toolbar.commandPalette")}
        >
          <Search size={16} aria-hidden="true" />
          <span>{t("toolbar.commandPalette")}</span>
        </button>
        <button
          type="button"
          onClick={onReset}
          className={TOOLBAR_BTN}
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span>{t("toolbar.reset")}</span>
        </button>
        <LanguageToggle />
        <ThemeToggle
          preference={themePreference}
          onChange={onThemePreferenceChange}
        />
      </div>
    </nav>
  );
});
