import {
  Columns2,
  Focus,
  PanelLeftClose,
  RotateCcw,
  Rows3,
} from "lucide-react";

import type {
  WorkspaceFocusMode,
  WorkspaceLayout,
} from "@/modules/assistant/lib/workspace-layout";

type WorkspaceLayoutToolbarProps = {
  layout: WorkspaceLayout;
  onFocusModeChange: (focusMode: WorkspaceFocusMode) => void;
  onReset: () => void;
  onSessionWidthChange: (sessionWidthPercent: number) => void;
  onSwapPanels: () => void;
  onTogglePanel: (panel: keyof WorkspaceLayout["panelVisibility"]) => void;
};

const focusModes: readonly {
  value: WorkspaceFocusMode;
  label: string;
}[] = [
  { value: "balanced", label: "均衡" },
  { value: "camera-first", label: "画面优先" },
  { value: "conversation-first", label: "对话优先" },
];

export function WorkspaceLayoutToolbar({
  layout,
  onFocusModeChange,
  onReset,
  onSessionWidthChange,
  onSwapPanels,
  onTogglePanel,
}: WorkspaceLayoutToolbarProps): React.JSX.Element {
  return (
    <nav className="workspace-layout-toolbar" aria-label="工作台布局">
      <div className="workspace-focus-switcher" aria-label="专注模式">
        <Focus size={16} aria-hidden="true" />
        {focusModes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            data-active={layout.focusMode === mode.value}
            aria-pressed={layout.focusMode === mode.value}
            onClick={() => onFocusModeChange(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="workspace-panel-actions" aria-label="面板显示">
        <label className="workspace-width-control">
          <span>控制区 {layout.sessionWidthPercent}%</span>
          <input
            type="range"
            min="28"
            max="55"
            step="1"
            value={layout.sessionWidthPercent}
            onChange={(event) => onSessionWidthChange(Number(event.target.value))}
          />
        </label>
        <button type="button" onClick={onSwapPanels} title="交换左右区域">
          <Columns2 size={16} aria-hidden="true" />
          <span>交换区域</span>
        </button>
        <button
          type="button"
          aria-expanded={layout.panelVisibility.cost}
          onClick={() => onTogglePanel("cost")}
        >
          <PanelLeftClose size={16} aria-hidden="true" />
          <span>控制台</span>
        </button>
        <button
          type="button"
          aria-expanded={layout.panelVisibility.usage}
          onClick={() => onTogglePanel("usage")}
        >
          <Rows3 size={16} aria-hidden="true" />
          <span>用量</span>
        </button>
        <button
          type="button"
          aria-expanded={layout.panelVisibility.visualContext}
          onClick={() => onTogglePanel("visualContext")}
        >
          <Rows3 size={16} aria-hidden="true" />
          <span>最近画面</span>
        </button>
        <button type="button" onClick={onReset}>
          <RotateCcw size={16} aria-hidden="true" />
          <span>恢复默认</span>
        </button>
      </div>
    </nav>
  );
}
