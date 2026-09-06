import { useState, type Dispatch, type SetStateAction } from "react";

import type { RealtimeResponseMode } from "@/modules/assistant/lib/realtime-protocol";
import type { ChatVoiceSendMode } from "@/modules/assistant/lib/workspace-labels";
import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";

/**
 * 工作台控件状态 hook。
 *
 * 收敛 `assistant-workspace.tsx` 中剩余的 9 个工作区控件 `useState`，
 * 将默认值内聚为单一来源，组件仅解构消费。
 */
export type WorkspaceControlsState = {
  isAutoSampling: boolean;
  setIsAutoSampling: Dispatch<SetStateAction<boolean>>;
  samplingIntervalSeconds: number;
  setSamplingIntervalSeconds: Dispatch<SetStateAction<number>>;
  isFramePruningEnabled: boolean;
  setIsFramePruningEnabled: Dispatch<SetStateAction<boolean>>;
  turnDetectionMode: RealtimeTurnDetectionMode;
  setTurnDetectionMode: Dispatch<SetStateAction<RealtimeTurnDetectionMode>>;
  responseBudget: RealtimeResponseBudget;
  setResponseBudget: Dispatch<SetStateAction<RealtimeResponseBudget>>;
  responseMode: RealtimeResponseMode;
  setResponseMode: Dispatch<SetStateAction<RealtimeResponseMode>>;
  isChatAnswerSpeechEnabled: boolean;
  setIsChatAnswerSpeechEnabled: Dispatch<SetStateAction<boolean>>;
  chatVoiceSendMode: ChatVoiceSendMode;
  setChatVoiceSendMode: Dispatch<SetStateAction<ChatVoiceSendMode>>;
  textDraft: string;
  setTextDraft: Dispatch<SetStateAction<string>>;
  isTextHistorySummaryEnabled: boolean;
  setIsTextHistorySummaryEnabled: Dispatch<SetStateAction<boolean>>;
};

const DEFAULT_SAMPLING_INTERVAL_SECONDS = 8;

export function useWorkspaceControlsState(): WorkspaceControlsState {
  const [isAutoSampling, setIsAutoSampling] = useState(false);
  const [samplingIntervalSeconds, setSamplingIntervalSeconds] = useState(
    DEFAULT_SAMPLING_INTERVAL_SECONDS,
  );
  const [isFramePruningEnabled, setIsFramePruningEnabled] = useState(true);
  const [turnDetectionMode, setTurnDetectionMode] =
    useState<RealtimeTurnDetectionMode>("server-vad");
  const [responseBudget, setResponseBudget] =
    useState<RealtimeResponseBudget>("standard");
  const [responseMode, setResponseMode] =
    useState<RealtimeResponseMode>("audio-text");
  const [isChatAnswerSpeechEnabled, setIsChatAnswerSpeechEnabled] =
    useState(false);
  const [chatVoiceSendMode, setChatVoiceSendMode] =
    useState<ChatVoiceSendMode>("auto-send");
  const [textDraft, setTextDraft] = useState("");
  const [isTextHistorySummaryEnabled, setIsTextHistorySummaryEnabled] =
    useState(false);

  return {
    isAutoSampling,
    setIsAutoSampling,
    samplingIntervalSeconds,
    setSamplingIntervalSeconds,
    isFramePruningEnabled,
    setIsFramePruningEnabled,
    turnDetectionMode,
    setTurnDetectionMode,
    responseBudget,
    setResponseBudget,
    responseMode,
    setResponseMode,
    isChatAnswerSpeechEnabled,
    setIsChatAnswerSpeechEnabled,
    chatVoiceSendMode,
    setChatVoiceSendMode,
    textDraft,
    setTextDraft,
    isTextHistorySummaryEnabled,
    setIsTextHistorySummaryEnabled,
  };
}
