import { useCallback, type Dispatch } from "react";

import type { AssistantAction } from "@/modules/assistant/state/assistant-reducer";
import {
  resolveProviderModeChange,
  resolveStopSessionActions,
} from "@/modules/assistant/lib/workspace-actions";
import type { AssistantSessionMode } from "@/modules/assistant/lib/assistant-session";
import type { TranscriptSpeaker } from "@/modules/assistant/types";

export type WorkspaceActionsDeps = {
  /** 是否存在激活中的会话阶段。 */
  hasActiveSession: boolean;
  /** 是否存在 Realtime 连接。 */
  hasRealtimeConnection: boolean;
  /** 摄像头 / 麦克风是否已授权。 */
  mediaGranted: boolean;
  /** 当前 Provider 模式（Chat / Realtime）。 */
  providerMode: AssistantSessionMode;
  /** 会话 reducer 的 dispatch。 */
  dispatch: Dispatch<AssistantAction>;
  /** 追加一条转写条目。 */
  addTranscript: (speaker: TranscriptSpeaker, text: string) => string;
  /** 停止 Realtime 会话（来自 use-realtime-session）。 */
  stopRealtimeSession: () => void;
  /** 切换 Provider 模式（来自 use-assistant-session）。 */
  changeProviderMode: (
    previous: AssistantSessionMode,
    next: AssistantSessionMode,
  ) => void;
};

export type WorkspaceActionsResult = {
  /** 停止会话（记录提示 + 复位阶段）。 */
  handleStopSession: () => void;
  /** Provider 模式切换事件（单选 input onChange）。 */
  handleProviderModeChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
};

export type UseWorkspaceActionsResult = WorkspaceActionsResult;

/**
 * 工作区动作编排 hook。
 *
 * 收敛 `assistant-workspace` 主组件的 `stopSession` 与 `handleProviderModeChange`：
 * 将"该做什么"的决策委托给 `lib/workspace-actions.ts` 纯函数，组件仅收集扁平
 * 依赖快照并接线 dispatch / 提示 / 停止 / 模式切换副作用。
 */
export function useWorkspaceActions({
  hasActiveSession,
  hasRealtimeConnection,
  mediaGranted,
  providerMode,
  dispatch,
  addTranscript,
  stopRealtimeSession,
  changeProviderMode,
}: WorkspaceActionsDeps): WorkspaceActionsResult {
  const handleStopSession = useCallback((): void => {
    stopRealtimeSession();

    const actions = resolveStopSessionActions({
      hasActiveSession,
      hasRealtimeConnection,
      mediaGranted,
    });

    for (const action of actions) {
      if (action.kind === "log-stopped") {
        addTranscript("system", "Realtime 会话已停止。");
      } else {
        dispatch({ type: "phase-set", phase: action.phase });
      }
    }
  }, [
    addTranscript,
    dispatch,
    hasActiveSession,
    hasRealtimeConnection,
    mediaGranted,
    stopRealtimeSession,
  ]);

  const handleProviderModeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const decision = resolveProviderModeChange(
        event.currentTarget.value,
        providerMode,
      );

      if (decision.kind === "set-mode") {
        changeProviderMode(providerMode, decision.next);
      }
    },
    [changeProviderMode, providerMode],
  );

  return { handleStopSession, handleProviderModeChange };
}
