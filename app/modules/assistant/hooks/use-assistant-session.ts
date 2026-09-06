import { useCallback } from "react";

import type { AssistantAction } from "@/modules/assistant/state/assistant-reducer";
import type { TranscriptSpeaker } from "@/modules/assistant/types";
import {
  planModeSwitchCleanup,
  resolveModeSwitchActions,
  runModeSwitchActions,
  type AssistantSessionMode,
} from "@/modules/assistant/lib/assistant-session";

type DispatchFn = React.Dispatch<AssistantAction>;

export type AssistantSessionCleanupHandlers = {
  stopRealtime: () => void;
  cancelContinuousChatVoice: () => void;
  cancelChatVoiceRecording: () => void;
  cancelChatSpeech: () => void;
};

export type UseAssistantSessionOptions = {
  /** 当前是否持有 Realtime 连接（决定切到 Chat 时是否需关闭 WebRTC）。 */
  hasRealtimeConnection: boolean;
  /** 切换后媒体是否仍可用（决定目标侧初始 phase）。 */
  mediaGranted: boolean;
  setProviderMode: (mode: AssistantSessionMode) => void;
  dispatch: DispatchFn;
  addTranscript: (speaker: TranscriptSpeaker, text: string) => void;
  cleanup: AssistantSessionCleanupHandlers;
};

export type UseAssistantSessionResult = {
  /**
   * 统一会话入口：把 Chat / Realtime 两套底层实现的模式切换收拢到唯一接口。
   *
   * 内部依据目标模式分派：切到 Chat 时关闭 Realtime WebRTC 连接并复位相位；
   * 切到 Realtime 时取消 Chat 侧连续语音 / 录音 / 朗读，避免争夺麦克风。
   */
  changeProviderMode: (
    previous: AssistantSessionMode,
    next: AssistantSessionMode,
  ) => void;
};

/**
 * 统一会话编排层（M1.6）。
 *
 * 收敛 provider mode 切换的副作用分派：从 `assistant-workspace.tsx` 中抽出
 * 模式切换清理逻辑，使其成为可单测、无连接泄漏的唯一门户。纯决策由
 * `lib/assistant-session.ts` 承担，本 hook 仅负责把动作序列接线到副作用。
 */
export function useAssistantSession({
  hasRealtimeConnection,
  mediaGranted,
  setProviderMode,
  dispatch,
  addTranscript,
  cleanup,
}: UseAssistantSessionOptions): UseAssistantSessionResult {
  const changeProviderMode = useCallback(
    (previous: AssistantSessionMode, next: AssistantSessionMode): void => {
      if (previous === next) {
        return;
      }

      const plan = planModeSwitchCleanup(
        previous,
        next,
        hasRealtimeConnection,
      );
      const actions = resolveModeSwitchActions(plan, mediaGranted);

      runModeSwitchActions(actions, {
        stopRealtime: cleanup.stopRealtime,
        setPhase: (phase) => dispatch({ type: "phase-set", phase }),
        notifyStoppedRealtime: () =>
          addTranscript(
            "system",
            "已切换到 Chat Completions，Realtime 会话已停止。",
          ),
        cancelContinuousChatVoice: cleanup.cancelContinuousChatVoice,
        cancelChatVoiceRecording: cleanup.cancelChatVoiceRecording,
        cancelChatSpeech: cleanup.cancelChatSpeech,
      });

      setProviderMode(next);
    },
    [
      hasRealtimeConnection,
      mediaGranted,
      setProviderMode,
      dispatch,
      addTranscript,
      cleanup,
    ],
  );

  return { changeProviderMode };
}
