import { useCallback, type Dispatch, type SetStateAction } from "react";

import { resolveWorkspaceControlAction } from "@/modules/assistant/lib/workspace-controls";
import type { RealtimeResponseMode } from "@/modules/assistant/lib/realtime-protocol";
import type { ChatVoiceSendMode } from "@/modules/assistant/lib/workspace-labels";
import type { ChatVoiceCompletionSource } from "@/modules/assistant/hooks/use-continuous-chat-voice";
import type { TranscriptSpeaker } from "@/modules/assistant/types";
import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";

export type WorkspaceControlsDeps = {
  /** 是否正在录制 Chat 语音（决定语音输入按钮点击走"完成"还是"开始"）。 */
  isChatVoiceRecording: boolean;
  // —— setter 依赖 ——
  setAutoSampling: (enabled: boolean) => void;
  setFramePruning: (enabled: boolean) => void;
  setTurnDetectionMode: Dispatch<SetStateAction<RealtimeTurnDetectionMode>>;
  setResponseBudget: Dispatch<SetStateAction<RealtimeResponseBudget>>;
  setResponseMode: Dispatch<SetStateAction<RealtimeResponseMode>>;
  setMicrophoneMuted: (muted: boolean) => void;
  setChatVoiceSendMode: Dispatch<SetStateAction<ChatVoiceSendMode>>;
  setChatAnswerSpeechEnabled: (enabled: boolean) => void;
  setTextDraft: (value: string) => void;
  setSamplingIntervalSeconds: (seconds: number) => void;
  setTextHistorySummaryEnabled: (enabled: boolean) => void;
  // —— 动作依赖 ——
  startChatVoiceRecording: () => boolean;
  completeChatVoiceRecording: (source: ChatVoiceCompletionSource) => Promise<void>;
  cancelChatSpeech: () => void;
  addTranscript: (speaker: TranscriptSpeaker, text: string) => string;
};

export type UseWorkspaceControlsResult = {
  handleAutoSamplingChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleFramePruningChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleTurnDetectionModeChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  handleResponseBudgetChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  handleResponseModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleMicrophoneMutedChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  handleChatSpeechInputClick: () => void;
  handleChatVoiceSendModeChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  handleChatAnswerSpeechChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  handleCancelChatSpeech: () => void;
  handleTextDraftChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSamplingIntervalChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  handleTextHistorySummaryChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
};

/**
 * 工作台控件编排 hook。
 *
 * 收敛 `assistant-workspace.tsx` 的 10 个设置切换 handler 与 2 个动作 handler。
 * 设置切换委托给 `lib/workspace-controls.ts` 的 `resolveWorkspaceControlAction`
 * 算出动作后接线副作用；语音输入点击 / 停止朗读两个动作 handler 由本 hook
 * 直接编排（读入当前状态 + 调用依赖函数）。
 */
export function useWorkspaceControls({
  isChatVoiceRecording,
  setAutoSampling,
  setFramePruning,
  setTurnDetectionMode,
  setResponseBudget,
  setResponseMode,
  setMicrophoneMuted,
  setChatVoiceSendMode,
  setChatAnswerSpeechEnabled,
  setTextDraft,
  setSamplingIntervalSeconds,
  setTextHistorySummaryEnabled,
  startChatVoiceRecording,
  completeChatVoiceRecording,
  cancelChatSpeech,
  addTranscript,
}: WorkspaceControlsDeps): UseWorkspaceControlsResult {
  const handleAutoSamplingChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const action = resolveWorkspaceControlAction({
        kind: "auto-sampling",
        checked: event.currentTarget.checked,
      });
      if (action.kind === "set-auto-sampling") {
        setAutoSampling(action.enabled);
      }
    },
    [setAutoSampling],
  );

  const handleFramePruningChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const action = resolveWorkspaceControlAction({
        kind: "frame-pruning",
        checked: event.currentTarget.checked,
      });
      if (action.kind === "set-frame-pruning") {
        setFramePruning(action.enabled);
      }
    },
    [setFramePruning],
  );

  const handleTurnDetectionModeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const action = resolveWorkspaceControlAction({
        kind: "turn-detection-mode",
        value: event.currentTarget.value,
      });
      if (action.kind === "set-turn-detection-mode") {
        setTurnDetectionMode(action.mode);
      }
    },
    [setTurnDetectionMode],
  );

  const handleResponseBudgetChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const action = resolveWorkspaceControlAction({
        kind: "response-budget",
        value: event.currentTarget.value,
      });
      if (action.kind === "set-response-budget") {
        setResponseBudget(action.budget);
      }
    },
    [setResponseBudget],
  );

  const handleResponseModeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const action = resolveWorkspaceControlAction({
        kind: "response-mode",
        checked: event.currentTarget.checked,
      });
      if (action.kind === "set-response-mode") {
        setResponseMode(action.mode);
      }
    },
    [setResponseMode],
  );

  const handleMicrophoneMutedChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const action = resolveWorkspaceControlAction({
        kind: "microphone-muted",
        checked: event.currentTarget.checked,
      });
      if (action.kind === "set-microphone-muted") {
        setMicrophoneMuted(action.muted);
      }
    },
    [setMicrophoneMuted],
  );

  const handleChatSpeechInputClick = useCallback((): void => {
    if (isChatVoiceRecording) {
      void completeChatVoiceRecording("manual");
      return;
    }

    startChatVoiceRecording();
  }, [completeChatVoiceRecording, isChatVoiceRecording, startChatVoiceRecording]);

  const handleChatVoiceSendModeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const action = resolveWorkspaceControlAction({
        kind: "chat-voice-send-mode",
        value: event.currentTarget.value,
      });
      if (action.kind === "set-chat-voice-send-mode") {
        setChatVoiceSendMode(action.mode);
      }
    },
    [setChatVoiceSendMode],
  );

  const handleChatAnswerSpeechChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const nextEnabled = event.currentTarget.checked;
      setChatAnswerSpeechEnabled(nextEnabled);

      if (!nextEnabled) {
        cancelChatSpeech();
      }
    },
    [cancelChatSpeech, setChatAnswerSpeechEnabled],
  );

  const handleCancelChatSpeech = useCallback((): void => {
    cancelChatSpeech();
    addTranscript("system", "已停止朗读。");
  }, [addTranscript, cancelChatSpeech]);

  const handleTextDraftChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const action = resolveWorkspaceControlAction({
        kind: "text-draft",
        value: event.currentTarget.value,
      });
      if (action.kind === "set-text-draft") {
        setTextDraft(action.value);
      }
    },
    [setTextDraft],
  );

  const handleSamplingIntervalChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const action = resolveWorkspaceControlAction({
        kind: "sampling-interval",
        value: event.currentTarget.value,
      });
      if (action.kind === "set-sampling-interval") {
        setSamplingIntervalSeconds(action.seconds);
      }
    },
    [setSamplingIntervalSeconds],
  );

  const handleTextHistorySummaryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const action = resolveWorkspaceControlAction({
        kind: "text-history-summary",
        checked: event.currentTarget.checked,
      });
      if (action.kind === "set-text-history-summary") {
        setTextHistorySummaryEnabled(action.enabled);
      }
    },
    [setTextHistorySummaryEnabled],
  );

  return {
    handleAutoSamplingChange,
    handleFramePruningChange,
    handleTurnDetectionModeChange,
    handleResponseBudgetChange,
    handleResponseModeChange,
    handleMicrophoneMutedChange,
    handleChatSpeechInputClick,
    handleChatVoiceSendModeChange,
    handleChatAnswerSpeechChange,
    handleCancelChatSpeech,
    handleTextDraftChange,
    handleSamplingIntervalChange,
    handleTextHistorySummaryChange,
  };
}
