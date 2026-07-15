import { useCallback, useEffect, useState } from "react";

import {
  clampSessionWidthPercent,
  defaultWorkspaceLayout,
  parseStoredWorkspaceLayout,
  swapWorkspacePanels,
  WORKSPACE_LAYOUT_STORAGE_KEY,
  type WorkspaceFocusMode,
  type WorkspaceLayout,
} from "@/modules/assistant/lib/workspace-layout";

type WorkspacePanelVisibility = keyof WorkspaceLayout["panelVisibility"];

type WorkspaceLayoutController = {
  layout: WorkspaceLayout;
  resetLayout: () => void;
  setFocusMode: (focusMode: WorkspaceFocusMode) => void;
  setSessionWidthPercent: (sessionWidthPercent: number) => void;
  swapPanels: () => void;
  togglePanel: (panel: WorkspacePanelVisibility) => void;
};

export function useWorkspaceLayout(): WorkspaceLayoutController {
  const [layout, setLayout] = useState<WorkspaceLayout>(defaultWorkspaceLayout);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      setLayout(
        parseStoredWorkspaceLayout(
          window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY),
        ),
      );
    } catch {
      setLayout(defaultWorkspaceLayout);
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(
        WORKSPACE_LAYOUT_STORAGE_KEY,
        JSON.stringify(layout),
      );
    } catch {
      // Layout preferences are optional; private browsing and storage quotas
      // must not make the assistant workspace unusable.
    }
  }, [isHydrated, layout]);

  const setFocusMode = useCallback((focusMode: WorkspaceFocusMode): void => {
    setLayout((current) => ({ ...current, focusMode }));
  }, []);

  const setSessionWidthPercent = useCallback((sessionWidthPercent: number): void => {
    setLayout((current) => ({
      ...current,
      sessionWidthPercent: clampSessionWidthPercent(sessionWidthPercent),
    }));
  }, []);

  const swapPanels = useCallback((): void => {
    setLayout((current) => ({
      ...current,
      panelOrder: swapWorkspacePanels(current.panelOrder),
    }));
  }, []);

  const togglePanel = useCallback((panel: WorkspacePanelVisibility): void => {
    setLayout((current) => ({
      ...current,
      panelVisibility: {
        ...current.panelVisibility,
        [panel]: !current.panelVisibility[panel],
      },
    }));
  }, []);

  const resetLayout = useCallback((): void => {
    setLayout(defaultWorkspaceLayout);
  }, []);

  return {
    layout,
    resetLayout,
    setFocusMode,
    setSessionWidthPercent,
    swapPanels,
    togglePanel,
  };
}
