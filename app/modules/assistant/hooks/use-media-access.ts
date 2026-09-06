import { useCallback, type Dispatch, type MutableRefObject } from "react";

import type { AssistantAction } from "@/modules/assistant/state/assistant-reducer";
import type { FrameSignature } from "@/modules/assistant/lib/frame-diff";
import type { TranscriptSpeaker } from "@/modules/assistant/types";
import {
  resolveReleaseActions,
} from "@/modules/assistant/lib/media-access";

export type MediaAccessDeps = {
  /** 请求授权摄像头 / 麦克风。 */
  requestAccess: () => Promise<void> | void;
  /** 停止媒体访问。 */
  stopAccess: () => void;
  /** 停止连续语音。 */
  stopContinuousChatVoice: () => void;
  /** 取消语音录制。 */
  cancelChatVoiceRecording: () => void;
  /** 停止当前会话。 */
  stopSession: () => void;
  /** 是否启用自动帧采样。 */
  setAutoSampling: (enabled: boolean) => void;
  /** 会话 reducer 的 dispatch。 */
  dispatch: Dispatch<AssistantAction>;
  /** 最近一次已上传帧的签名（释放时重置）。 */
  lastUploadedFrameSignatureRef: MutableRefObject<FrameSignature | null>;
  /** 是否静音麦克风。 */
  setMicrophoneMuted: (muted: boolean) => void;
  /** 追加一条转写条目。 */
  addTranscript: (speaker: TranscriptSpeaker, text: string) => string;
};

export type UseMediaAccessResult = {
  /** 请求授权媒体。 */
  handleRequestAccess: () => void;
  /** 释放媒体（停连续语音 / 会话 / 访问并重置帧状态）。 */
  handleReleaseMedia: () => void;
};

/**
 * 媒体访问 / 释放编排 hook。
 *
 * 收敛 `assistant-workspace` 主组件的 `handleRequestAccess` / `handleReleaseMedia`：
 * 释放时委托 `lib/media-access.ts` 的 `resolveReleaseActions` 展开动作序列，组件仅
 * 收集依赖并接线副作用。
 */
export function useMediaAccess({
  requestAccess,
  stopAccess,
  stopContinuousChatVoice,
  cancelChatVoiceRecording,
  stopSession,
  setAutoSampling,
  dispatch,
  lastUploadedFrameSignatureRef,
  setMicrophoneMuted,
  addTranscript,
}: MediaAccessDeps): UseMediaAccessResult {
  const handleRequestAccess = useCallback((): void => {
    void requestAccess();
  }, [requestAccess]);

  const handleReleaseMedia = useCallback((): void => {
    for (const action of resolveReleaseActions()) {
      switch (action.kind) {
        case "stop-continuous-voice":
          stopContinuousChatVoice();
          break;
        case "cancel-voice-recording":
          cancelChatVoiceRecording();
          break;
        case "stop-session":
          stopSession();
          break;
        case "stop-access":
          stopAccess();
          break;
        case "set-auto-sampling":
          setAutoSampling(action.enabled);
          break;
        case "clear-last-frame":
          dispatch({ type: "last-frame-cleared" });
          break;
        case "reset-frame-signature":
          lastUploadedFrameSignatureRef.current = null;
          break;
        case "reset-upload-counters":
          dispatch({ type: "frame-upload-counters-reset" });
          break;
        case "set-microphone-muted":
          setMicrophoneMuted(action.muted);
          break;
        case "add-transcript":
          addTranscript("system", action.text);
          break;
      }
    }
  }, [
    addTranscript,
    cancelChatVoiceRecording,
    dispatch,
    lastUploadedFrameSignatureRef,
    setAutoSampling,
    setMicrophoneMuted,
    stopAccess,
    stopContinuousChatVoice,
    stopSession,
  ]);

  return { handleRequestAccess, handleReleaseMedia };
}
