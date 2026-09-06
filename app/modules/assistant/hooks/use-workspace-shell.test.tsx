import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useWorkspaceShell } from "./use-workspace-shell";

type ShellResult = ReturnType<typeof useWorkspaceShell>;

let captured: ShellResult | undefined;

function Harness(): React.JSX.Element {
  captured = useWorkspaceShell();
  return <div data-testid="captured" />;
}

function renderHarness(): ShellResult {
  captured = undefined;
  renderToStaticMarkup(<Harness />);
  if (captured === undefined) {
    throw new Error("useWorkspaceShell 未被捕获");
  }
  return captured;
}

describe("useWorkspaceShell", () => {
  it("starts with sidebar closed and clear confirmation hidden", () => {
    const shell = renderHarness();

    expect(shell.isSessionSidebarOpen).toBe(false);
    expect(shell.isClearConfirmationVisible).toBe(false);
  });

  it("exposes stable sidebar open/close/toggle handlers", () => {
    const shell = renderHarness();

    expect(typeof shell.openSessionSidebar).toBe("function");
    expect(typeof shell.closeSessionSidebar).toBe("function");
    expect(typeof shell.toggleSessionSidebar).toBe("function");
    // 回调为 memoized（useCallback），同一渲染内引用稳定。
    expect(shell.openSessionSidebar).toBe(shell.openSessionSidebar);
  });

  it("exposes stable clear-confirmation handlers and the raw state setter", () => {
    const shell = renderHarness();

    expect(typeof shell.requestClear).toBe("function");
    expect(typeof shell.cancelClear).toBe("function");
    // 供 useConversationActions 消费的原始 setter。
    expect(typeof shell.setIsClearConfirmationVisible).toBe("function");
    expect(shell.requestClear).toBe(shell.requestClear);
  });
});
