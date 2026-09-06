import { useCallback, useEffect, useRef, useState } from "react";

import { CONTINUOUS_CHAT_RESTART_DELAY_MS } from "@/modules/assistant/lib/continuous-chat-vad";
import {
  buildMultimodalTurn,
  compareFusionStrategies,
  estimateFusedFrameTokens,
  toMultimodalFrame,
} from "@/modules/assistant/lib/multimodal-turn";
import { type FrameSignature } from "@/modules/assistant/lib/frame-diff";
import { type TranscriptEntry, type TranscriptSpeaker } from "@/modules/assistant/types";
import { type ChatVoiceSendMode } from "@/modules/assistant/lib/workspace-labels";

export type ChatVoiceCompletionSource = "manual" | "continuous";

/**
 * 连续语音能否启动的守卫条件。
 *
 * 返回 `true` 表示可以启动；否则返回 `false`。
 * 启动失败时是否“静默”取决于调用方（连续语音启动失败会直接关闭）。
 */
export function canStartContinuousChatVoice(input: {
  hasMedia: boolean;
  isRecordingSupported: boolean;
  isBusy: boolean;
  isChatSending: boolean;
}): boolean {
  return (
    input.hasMedia &&
    input.isRecordingSupported &&
    !input.isBusy &&
    !input.isChatSending
  );
}

/**
 * 连续语音启动后追加的系统提示文案（取决于浏览器是否支持自动朗读）。
 */
export function resolveContinuousStartMessage(
  isSynthesisSupported: boolean,
): string {
  return isSynthesisSupported
    ? "连续语音对话已开启，回答会自动朗读。"
    : "连续语音对话已开启；当前浏览器不支持自动朗读。";
}

export type CapturedFrame = {
  frameDataUrl: string;
  signature: FrameSignature;
};

export type UseContinuousChatVoiceOptions = {
  /** 是否有可用媒体（摄像头已授权且有流）。 */
  hasMedia: boolean;
  /** 是否处于 Chat 模式（providerMode === "chat"）。 */
  isChatMode: boolean;
  /** 是否正在录音（transcriptionState.status === "recording"）。 */
  isChatVoiceRecording: boolean;
  /** 是否正忙（录音或转写中）。 */
  isChatVoiceBusy: boolean;
  /** Chat 请求是否正在发送。 */
  chatStateIsSending: boolean;
  /** 浏览器是否支持录音。 */
  transcriptionRecordingSupported: boolean;
  /** 追加一条转写条目，返回条目 id。 */
  addTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
    deliveryStatus?: TranscriptEntry["deliveryStatus"],
  ) => string;
  /** 开始录音。 */
  startChatVoiceRecording: () => boolean;
  /** 停止录音并转写，返回转写结果。 */
  stopChatVoiceRecording: () => Promise<{ text: string } | null>;
  /** 取消录音。 */
  cancelChatVoiceRecording: () => void;
  /** 取消本地朗读。 */
  cancelChatSpeech: () => void;
  /** 是否正在本地朗读。 */
  isSpeaking: boolean;
  /** 浏览器是否支持语音合成。 */
  isSynthesisSupported: boolean;
  /** 捕获当前画面（自动/手动）。 */
  captureFrameAsync: (source: "manual" | "auto") => Promise<CapturedFrame | null>;
  /** Chat 发送链路（发送一轮文字/画面对话）。 */
  sendChatTurn: (input: {
    userEntryId: string;
    message: string;
    imageDataUrl?: string;
    signature?: FrameSignature;
    awaitSpeech?: boolean;
    forceSpeech?: boolean;
  }) => Promise<boolean>;
  /** 语音发送模式（auto-send / review）。 */
  chatVoiceSendMode: ChatVoiceSendMode;
  /** 更新语音发送模式。 */
  setChatVoiceSendMode: (mode: ChatVoiceSendMode) => void;
  /** 是否开启 Chat 回答自动朗读。 */
  setIsChatAnswerSpeechEnabled: (enabled: boolean) => void;
  /** 写入文本输入框（review 模式拼接转写文本）。 */
  setTextDraft: (updater: (draft: string) => string) => void;
  /** M4.2 多模态融合统计（用于 UI 展示）。 */
  setFusionStats: (updater: (stats: {
    count: number;
    savedCalls: number;
    imageTokens: number;
  }) => {
    count: number;
    savedCalls: number;
    imageTokens: number;
  }) => void;
};

export type UseContinuousChatVoiceResult = {
  /** 连续语音对话是否已开启（供 UI 展示与 VAD 接线）。 */
  isContinuousChatVoiceEnabled: boolean;
  /** 启动连续语音对话。 */
  startContinuousChatVoice: () => void;
  /** 停止连续语音对话。 */
  stopContinuousChatVoice: () => void;
  /** 完成一轮录音（manual / continuous 来源）。 */
  completeChatVoiceRecording: (source: ChatVoiceCompletionSource) => Promise<void>;
  /** 切换连续语音开关（点击入口）。 */
  handleContinuousChatVoiceClick: () => void;
  /** 清除待重启定时器。 */
  clearContinuousChatRestart: () => void;
  /** 关闭连续语音（清 ref + 状态 + 定时器）。 */
  disableContinuousChatVoice: () => void;
};

/**
 * 连续语音对话控制流 hook。
 *
 * 收敛 `assistant-workspace` 主组件中 ~300 行的连续语音编排逻辑：
 * 启动/停止/完成/重启调度、多模态融合、自动朗读联动与安全清理。
 * 主组件只保留渲染接线，不再持有相关 ref 与回调。
 */
export function useContinuousChatVoice({
  hasMedia,
  isChatMode,
  isChatVoiceRecording,
  isChatVoiceBusy,
  chatStateIsSending,
  transcriptionRecordingSupported,
  addTranscript,
  startChatVoiceRecording,
  stopChatVoiceRecording,
  cancelChatVoiceRecording,
  cancelChatSpeech,
  isSpeaking,
  isSynthesisSupported,
  captureFrameAsync,
  sendChatTurn,
  chatVoiceSendMode,
  setChatVoiceSendMode,
  setIsChatAnswerSpeechEnabled,
  setTextDraft,
  setFusionStats,
}: UseContinuousChatVoiceOptions): UseContinuousChatVoiceResult {
  const [isContinuousChatVoiceEnabled, setIsContinuousChatVoiceEnabled] =
    useState(false);
  const continuousChatVoiceRef = useRef(false);
  const continuousChatRestartTimeoutRef = useRef<number | null>(null);
  const isCompletingChatVoiceRef = useRef(false);

  const clearContinuousChatRestart = useCallback((): void => {
    if (continuousChatRestartTimeoutRef.current !== null) {
      window.clearTimeout(continuousChatRestartTimeoutRef.current);
      continuousChatRestartTimeoutRef.current = null;
    }
  }, []);

  const disableContinuousChatVoice = useCallback((): void => {
    continuousChatVoiceRef.current = false;
    setIsContinuousChatVoiceEnabled(false);
    clearContinuousChatRestart();
  }, [clearContinuousChatRestart]);

  const scheduleNextContinuousRecording = useCallback((): void => {
    clearContinuousChatRestart();

    if (!continuousChatVoiceRef.current) {
      return;
    }

    continuousChatRestartTimeoutRef.current = window.setTimeout(() => {
      continuousChatRestartTimeoutRef.current = null;

      if (!continuousChatVoiceRef.current) {
        return;
      }

      const started = startChatVoiceRecording();

      if (!started) {
        disableContinuousChatVoice();
        addTranscript("system", "连续语音对话已停止。");
      }
    }, CONTINUOUS_CHAT_RESTART_DELAY_MS);
  }, [
    addTranscript,
    clearContinuousChatRestart,
    disableContinuousChatVoice,
    startChatVoiceRecording,
  ]);

  const completeChatVoiceRecording = useCallback(
    async (source: ChatVoiceCompletionSource): Promise<void> => {
      if (isCompletingChatVoiceRef.current) {
        return;
      }

      isCompletingChatVoiceRef.current = true;

      try {
        if (source === "manual") {
          addTranscript("system", "已停止录音，正在转写语音。");
        }

        const transcription = await stopChatVoiceRecording();

        if (transcription === null) {
          if (source === "continuous" && continuousChatVoiceRef.current) {
            disableContinuousChatVoice();
            addTranscript("system", "连续语音对话已停止。");
          }
          return;
        }

        const recognizedText = transcription.text.trim();

        if (recognizedText.length === 0) {
          addTranscript("system", "语音转写结果为空，请再试一次。");

          if (source === "continuous" && continuousChatVoiceRef.current) {
            disableContinuousChatVoice();
            addTranscript("system", "连续语音对话已停止。");
          }
          return;
        }

        if (source === "continuous" && !continuousChatVoiceRef.current) {
          return;
        }

        if (source === "manual" && chatVoiceSendMode === "review") {
          setTextDraft((currentDraft) => {
            const trimmedCurrentDraft = currentDraft.trim();

            if (trimmedCurrentDraft.length === 0) {
              return recognizedText;
            }

            return `${trimmedCurrentDraft} ${recognizedText}`;
          });
          addTranscript("system", "语音已转写并填入输入框。");
          return;
        }

        const shouldContinue =
          source === "continuous" && continuousChatVoiceRef.current;

        // M4.2 多模态输入融合：连续语音中若画面同时变化，合并为单次请求。
        const fusedFrame =
          shouldContinue && hasMedia
            ? await captureFrameAsync("auto")
            : null;
        const multimodalTurn = buildMultimodalTurn(recognizedText, {
          ...(fusedFrame === null
            ? {}
            : {
                frame: toMultimodalFrame(
                  fusedFrame.frameDataUrl,
                  Date.now(),
                  fusedFrame.signature.width,
                  fusedFrame.signature.height,
                ),
              }),
          utteranceEndAt: Date.now(),
        });

        // M4.2 融合统计：量化“融合 vs 分离”的调用往返与图像 token，供 UI 展示。
        if (multimodalTurn.fused) {
          const comparison = compareFusionStrategies(
            multimodalTurn,
            fusedFrame !== null
              ? toMultimodalFrame(
                  fusedFrame.frameDataUrl,
                  Date.now(),
                  fusedFrame.signature.width,
                  fusedFrame.signature.height,
                )
              : undefined,
          );
          setFusionStats((current) => ({
            count: current.count + 1,
            savedCalls: current.savedCalls + comparison.savedCallCount,
            imageTokens:
              current.imageTokens + estimateFusedFrameTokens(
                toMultimodalFrame(
                  fusedFrame?.frameDataUrl ?? "",
                  Date.now(),
                  fusedFrame?.signature.width ?? 0,
                  fusedFrame?.signature.height ?? 0,
                ),
              ),
          }));
        }

        const userEntryId = addTranscript("user", recognizedText, "sent");
        const sent = await sendChatTurn({
          userEntryId,
          message: multimodalTurn.message,
          ...(multimodalTurn.imageDataUrl === undefined
            ? {}
            : {
                imageDataUrl: multimodalTurn.imageDataUrl,
                signature:
                  fusedFrame !== null ? fusedFrame.signature : undefined,
              }),
          awaitSpeech: shouldContinue,
          forceSpeech: shouldContinue,
        });

        if (!sent) {
          if (shouldContinue) {
            disableContinuousChatVoice();
            addTranscript("system", "连续语音对话已停止。");
          }
          return;
        }

        if (shouldContinue && continuousChatVoiceRef.current) {
          scheduleNextContinuousRecording();
        }
      } finally {
        isCompletingChatVoiceRef.current = false;
      }
    },
    [
      addTranscript,
      captureFrameAsync,
      chatVoiceSendMode,
      disableContinuousChatVoice,
      hasMedia,
      scheduleNextContinuousRecording,
      sendChatTurn,
      setFusionStats,
      setTextDraft,
      stopChatVoiceRecording,
    ],
  );

  const stopContinuousChatVoice = useCallback((): void => {
    const wasEnabled = continuousChatVoiceRef.current;
    disableContinuousChatVoice();

    if (isChatVoiceRecording) {
      cancelChatVoiceRecording();
    }

    if (isSpeaking) {
      cancelChatSpeech();
    }

    if (wasEnabled) {
      addTranscript("system", "连续语音对话已停止。");
    }
  }, [
    addTranscript,
    cancelChatSpeech,
    cancelChatVoiceRecording,
    disableContinuousChatVoice,
    isChatVoiceRecording,
    isSpeaking,
  ]);

  const startContinuousChatVoice = useCallback((): void => {
    if (
      !canStartContinuousChatVoice({
        hasMedia,
        isRecordingSupported: transcriptionRecordingSupported,
        isBusy: isChatVoiceBusy,
        isChatSending: chatStateIsSending,
      })
    ) {
      return;
    }

    clearContinuousChatRestart();
    continuousChatVoiceRef.current = true;
    setIsContinuousChatVoiceEnabled(true);
    setChatVoiceSendMode("auto-send");

    if (isSynthesisSupported) {
      setIsChatAnswerSpeechEnabled(true);
    }

    const started = startChatVoiceRecording();

    if (!started) {
      disableContinuousChatVoice();
      return;
    }

    addTranscript(
      "system",
      resolveContinuousStartMessage(isSynthesisSupported),
    );
  }, [
    addTranscript,
    chatStateIsSending,
    clearContinuousChatRestart,
    disableContinuousChatVoice,
    hasMedia,
    isChatVoiceBusy,
    isSynthesisSupported,
    setChatVoiceSendMode,
    setIsChatAnswerSpeechEnabled,
    startChatVoiceRecording,
    transcriptionRecordingSupported,
  ]);

  const handleContinuousChatVoiceClick = (): void => {
    if (isContinuousChatVoiceEnabled) {
      stopContinuousChatVoice();
      return;
    }

    startContinuousChatVoice();
  };

  // 卸载清理：复位连续语音状态并取消待重启定时器。
  useEffect(() => {
    return () => {
      continuousChatVoiceRef.current = false;
      clearContinuousChatRestart();
    };
  }, [clearContinuousChatRestart]);

  // 连续语音开启期间若失去媒体或退出 Chat 模式，自动停止。
  useEffect(() => {
    if (isContinuousChatVoiceEnabled && (!hasMedia || !isChatMode)) {
      stopContinuousChatVoice();
    }
  }, [
    hasMedia,
    isChatMode,
    isContinuousChatVoiceEnabled,
    stopContinuousChatVoice,
  ]);

  return {
    isContinuousChatVoiceEnabled,
    startContinuousChatVoice,
    stopContinuousChatVoice,
    completeChatVoiceRecording,
    handleContinuousChatVoiceClick,
    clearContinuousChatRestart,
    disableContinuousChatVoice,
  };
}
