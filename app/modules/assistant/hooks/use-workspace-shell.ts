import { useCallback, useState } from "react";

/**
 * 收敛工作台壳体（shell）的局部 UI 状态：
 * 会话侧边栏抽屉开合、清空会话二次确认弹窗显隐。
 *
 * 仅承担「布尔态 + 派生 setter」的薄编排，主组件据此直接消费，
 * 与 M1.x 其余 `use*` 薄编排层保持一致。
 */
export function useWorkspaceShell() {
  const [isClearConfirmationVisible, setIsClearConfirmationVisible] =
    useState(false);
  const [isSessionSidebarOpen, setIsSessionSidebarOpen] = useState(false);

  const openSessionSidebar = useCallback(() => setIsSessionSidebarOpen(true), []);
  const closeSessionSidebar = useCallback(
    () => setIsSessionSidebarOpen(false),
    [],
  );
  const toggleSessionSidebar = useCallback(
    () => setIsSessionSidebarOpen((open) => !open),
    [],
  );
  const requestClear = useCallback(
    () => setIsClearConfirmationVisible(true),
    [],
  );
  const cancelClear = useCallback(
    () => setIsClearConfirmationVisible(false),
    [],
  );

  return {
    isClearConfirmationVisible,
    setIsClearConfirmationVisible,
    isSessionSidebarOpen,
    openSessionSidebar,
    closeSessionSidebar,
    toggleSessionSidebar,
    requestClear,
    cancelClear,
  };
}
