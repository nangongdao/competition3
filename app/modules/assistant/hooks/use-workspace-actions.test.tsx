import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceActions } from "./use-workspace-actions";
import type {
  UseWorkspaceActionsResult,
  WorkspaceActionsDeps,
} from "./use-workspace-actions";

let captured: UseWorkspaceActionsResult | undefined;

function Harness(props: { deps: WorkspaceActionsDeps }): React.JSX.Element {
  const result = useWorkspaceActions(props.deps);
  captured = result;
  return <div data-testid="captured" />;
}

function getResult(): UseWorkspaceActionsResult {
  if (captured === undefined) {
    throw new Error("useWorkspaceActions 未被捕获");
  }

  return captured;
}

function makeDeps(
  overrides: Partial<WorkspaceActionsDeps> = {},
): WorkspaceActionsDeps {
  return {
    hasActiveSession: true,
    hasRealtimeConnection: false,
    mediaGranted: true,
    providerMode: "chat",
    dispatch: vi.fn(),
    addTranscript: vi.fn(() => "entry-1"),
    stopRealtimeSession: vi.fn(),
    changeProviderMode: vi.fn(),
    ...overrides,
  };
}

function renderHarness(deps: WorkspaceActionsDeps): void {
  captured = undefined;
  renderToStaticMarkup(<Harness deps={deps} />);
}

function changeEvent(
  value: string,
): React.ChangeEvent<HTMLInputElement> {
  return {
    currentTarget: { value },
  } as React.ChangeEvent<HTMLInputElement>;
}

afterEach(() => {
  captured = undefined;
});

describe("useWorkspaceActions", () => {
  describe("handleStopSession", () => {
    it("会话激活 → 停止 Realtime + 记录提示 + 复位阶段", () => {
      const stopRealtimeSession = vi.fn();
      const addTranscript = vi.fn(() => "entry-1");
      const dispatch = vi.fn();
      renderHarness(
        makeDeps({ stopRealtimeSession, addTranscript, dispatch }),
      );

      getResult().handleStopSession();

      expect(stopRealtimeSession).toHaveBeenCalledTimes(1);
      expect(addTranscript).toHaveBeenCalledWith(
        "system",
        "Realtime 会话已停止。",
      );
      expect(dispatch).toHaveBeenCalledWith({
        type: "phase-set",
        phase: "ready",
      });
    });

    it("会话未激活且无连接 → 不记录提示，仅复位阶段", () => {
      const addTranscript = vi.fn(() => "entry-1");
      const dispatch = vi.fn();
      renderHarness(
        makeDeps({
          hasActiveSession: false,
          hasRealtimeConnection: false,
          addTranscript,
          dispatch,
        }),
      );

      getResult().handleStopSession();

      expect(addTranscript).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith({
        type: "phase-set",
        phase: "ready",
      });
    });

    it("存在 Realtime 连接 → 记录提示", () => {
      const addTranscript = vi.fn(() => "entry-1");
      renderHarness(
        makeDeps({ hasRealtimeConnection: true, addTranscript }),
      );

      getResult().handleStopSession();

      expect(addTranscript).toHaveBeenCalledWith(
        "system",
        "Realtime 会话已停止。",
      );
    });

    it("媒体未授权 → 复位到 idle", () => {
      const dispatch = vi.fn();
      renderHarness(makeDeps({ mediaGranted: false, dispatch }));

      getResult().handleStopSession();

      expect(dispatch).toHaveBeenCalledWith({ type: "phase-set", phase: "idle" });
    });
  });

  describe("handleProviderModeChange", () => {
    it("合法值切换到 realtime → 调用 changeProviderMode", () => {
      const changeProviderMode = vi.fn();
      renderHarness(makeDeps({ changeProviderMode }));

      getResult().handleProviderModeChange(changeEvent("realtime"));

      expect(changeProviderMode).toHaveBeenCalledWith("chat", "realtime");
    });

    it("非法值 → 不调用 changeProviderMode", () => {
      const changeProviderMode = vi.fn();
      renderHarness(makeDeps({ changeProviderMode }));

      getResult().handleProviderModeChange(changeEvent("bogus"));

      expect(changeProviderMode).not.toHaveBeenCalled();
    });

    it("与当前相同 → 不调用 changeProviderMode", () => {
      const changeProviderMode = vi.fn();
      renderHarness(makeDeps({ changeProviderMode }));

      getResult().handleProviderModeChange(changeEvent("chat"));

      expect(changeProviderMode).not.toHaveBeenCalled();
    });
  });
});
