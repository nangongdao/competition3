import { useCallback, useRef } from "react";

import {
  resolveSessionWidthFromPointer,
  type WorkspacePanelId,
} from "@/modules/assistant/lib/workspace-layout";

const MOBILE_MAX_WIDTH = 980;

/** 工作区 resize / 面板拖拽交互 hook。 */
export type UseWorkspacePanelInteractionOptions = {
  /** 更新会话面板宽度百分比。 */
  setSessionWidthPercent: (percent: number) => void;
  /** 交换会话/视觉两列顺序。 */
  swapPanels: () => void;
};

export type UseWorkspacePanelInteractionResult = {
  /**
   * 开始调整会话面板宽度。绑定在分隔拖柄的 `onPointerDown`。
   * 桌面端（>980px）监听全局 pointermove/pointerup 实时更新宽度。
   */
  handleWorkspaceResizeStart: (
    event: React.PointerEvent<HTMLButtonElement>,
    shell: HTMLElement | null,
    panelOrder: readonly WorkspacePanelId[],
  ) => void;
  /** 面板拖拽开始。移动端直接阻止，避免与滚动冲突。 */
  handlePanelDragStart: (
    event: React.DragEvent<HTMLElement>,
    panel: WorkspacePanelId,
  ) => void;
  /** 面板拖拽落点。拖拽会话列与视觉列互换时触发交换。 */
  handlePanelDrop: (
    event: React.DragEvent<HTMLElement>,
    targetPanel: WorkspacePanelId,
  ) => void;
};

export function useWorkspacePanelInteraction({
  setSessionWidthPercent,
  swapPanels,
}: UseWorkspacePanelInteractionOptions): UseWorkspacePanelInteractionResult {
  const draggedPanelRef = useRef<WorkspacePanelId | null>(null);

  const handleWorkspaceResizeStart = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      shell: HTMLElement | null,
      panelOrder: readonly WorkspacePanelId[],
    ): void => {
      if (shell === null || window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);

      const handlePointerMove = (pointerEvent: PointerEvent): void => {
        const bounds = shell.getBoundingClientRect();
        setSessionWidthPercent(
          resolveSessionWidthFromPointer(
            pointerEvent.clientX,
            bounds,
            panelOrder,
          ),
        );
      };

      const handlePointerEnd = (): void => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerEnd);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerEnd, { once: true });
    },
    [setSessionWidthPercent],
  );

  const handlePanelDragStart = useCallback(
    (event: React.DragEvent<HTMLElement>, panel: WorkspacePanelId): void => {
      if (window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches) {
        event.preventDefault();
        return;
      }

      draggedPanelRef.current = panel;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", panel);
    },
    [],
  );

  const handlePanelDrop = useCallback(
    (event: React.DragEvent<HTMLElement>, targetPanel: WorkspacePanelId): void => {
      event.preventDefault();

      if (draggedPanelRef.current !== null && draggedPanelRef.current !== targetPanel) {
        swapPanels();
      }

      draggedPanelRef.current = null;
    },
    [swapPanels],
  );

  return {
    handleWorkspaceResizeStart,
    handlePanelDragStart,
    handlePanelDrop,
  };
}
