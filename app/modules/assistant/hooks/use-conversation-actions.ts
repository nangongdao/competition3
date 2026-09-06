import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { AssistantAction } from "@/modules/assistant/state/assistant-reducer";
import type { FrameSignature } from "@/modules/assistant/lib/frame-diff";
import {
  isChatTurnRetryAllowed,
} from "@/modules/assistant/lib/conversation";
import {
  type ConversationExportFormat,
  resolveConversationExport,
} from "@/modules/assistant/lib/conversation-actions";
import type { SpatialAnnotation } from "@/modules/assistant/lib/spatial-annotation";
import { downloadTextFile } from "@/modules/assistant/lib/download";
import type {
  TranscriptEntry,
  TranscriptSpeaker,
} from "@/modules/assistant/types";
import type { ChatTurnInput } from "@/modules/assistant/hooks/use-send-chat-turn";

/** 从摄像头采样的画面帧。 */
export type CapturedFrame = {
  frameDataUrl: string;
  signature: FrameSignature;
};

/** Realtime 会话发送视觉上下文的输入。 */
export type SendVisualContextInput = {
  frameDataUrl: string;
  prompt: string;
  requestResponse: boolean;
};

/** 可重试的 Chat 回合载荷。 */
export type RetryableChatTurn = {
  message: string;
  imageDataUrl?: string;
  signature?: FrameSignature;
};

/** 会话动作依赖的副作用回调集合。 */
export type ConversationActionDeps = {
  /** 追加一条转写条目，返回条目 id。 */
  addTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
    deliveryStatus?: "sent" | "failed",
  ) => string;
  /** 会话 reducer 的 dispatch。 */
  dispatch: Dispatch<AssistantAction>;
  /** 停止 TTS 朗读。 */
  cancelChatSpeech: () => void;
  /** Chat 模式发送一轮回合。 */
  sendChatTurn: (input: ChatTurnInput) => Promise<boolean>;
  /** 更新某条转写的投递状态。 */
  setTranscriptDeliveryStatus: (
    entryId: string,
    deliveryStatus: TranscriptEntry["deliveryStatus"],
  ) => void;
  /** 更新可重试的 Chat 回合表。 */
  setRetryableChatTurns: (
    updater: SetStateAction<Readonly<Record<string, RetryableChatTurn>>>,
  ) => void;
  /** 更新空间标注。 */
  setSpatialAnnotations: (
    updater: SetStateAction<readonly SpatialAnnotation[]>,
  ) => void;
  /** 更新清空确认弹窗可见性。 */
  setIsClearConfirmationVisible: (visible: boolean) => void;
  /** 下一条转写条目的 id 计数器（可变 ref）。 */
  nextEntryIdRef: MutableRefObject<number>;
  /** 采样一帧摄像头画面。 */
  captureFrameAsync: (source: "manual" | "auto") => Promise<CapturedFrame | null>;
  /** 记录一帧已上传。 */
  recordUploadedFrame: (signature: FrameSignature) => void;
  /** Realtime 模式发送一帧视觉上下文。 */
  sendVisualContext: (input: SendVisualContextInput) => boolean;
};

/** 手动帧采样会话动作的依赖子集（需要流式状态读取）。 */
export type ConversationActionReadonly = {
  /** 会话转写条目。 */
  transcript: readonly TranscriptEntry[];
  /** 可重试的 Chat 回合表。 */
  retryableChatTurns: Readonly<Record<string, RetryableChatTurn>>;
  /** Chat 请求是否正在发送中。 */
  isChatSending: boolean;
  /** Realtime 通道是否已建立连接。 */
  hasRealtimeConnection: boolean;
};

export type UseConversationActionsOptions = ConversationActionDeps &
  ConversationActionReadonly;

export type UseConversationActionsResult = {
  /** 导出会话为 json / md 文件。 */
  handleConversationExport: (format: ConversationExportFormat) => void;
  /** 清空当前会话（停止朗读、清空转写与标注）。 */
  handleClearConversation: () => void;
  /** 重试某条失败的 Chat 回合。 */
  handleRetryChatTurn: (entryId: string) => void;
  /** 手动采样一帧画面并作为视觉上下文发送。 */
  handleManualFrameCapture: () => Promise<void>;
};

/**
 * 会话动作编排 hook。
 *
 * 收敛 `assistant-workspace` 主组件中的会话导出 / 清空 / 重试 / 手动帧采样
 * 四个 handler，将决策逻辑委托给可单测纯函数（如 `resolveConversationExport`），
 * 组件仅收集依赖并触发副作用。
 */
export function useConversationActions({
  transcript,
  retryableChatTurns,
  isChatSending,
  hasRealtimeConnection,
  addTranscript,
  dispatch,
  cancelChatSpeech,
  sendChatTurn,
  setTranscriptDeliveryStatus,
  setRetryableChatTurns,
  setSpatialAnnotations,
  setIsClearConfirmationVisible,
  nextEntryIdRef,
  captureFrameAsync,
  recordUploadedFrame,
  sendVisualContext,
}: UseConversationActionsOptions): UseConversationActionsResult {
  const handleConversationExport = useCallback(
    (format: ConversationExportFormat): void => {
      const exportedAt = Date.now();
      const payload = resolveConversationExport(format, transcript, exportedAt);
      downloadTextFile(payload.content, payload.mimeType, payload.filename);
    },
    [transcript],
  );

  const handleClearConversation = useCallback((): void => {
    cancelChatSpeech();
    dispatch({ type: "transcript-cleared" });
    setRetryableChatTurns({});
    setSpatialAnnotations([]);
    setIsClearConfirmationVisible(false);
    nextEntryIdRef.current = 0;
  }, [
    cancelChatSpeech,
    dispatch,
    setRetryableChatTurns,
    setSpatialAnnotations,
    setIsClearConfirmationVisible,
    nextEntryIdRef,
  ]);

  const handleRetryChatTurn = useCallback(
    (entryId: string): void => {
      const retryInput = retryableChatTurns[entryId];

      if (
        !isChatTurnRetryAllowed(retryInput !== undefined, isChatSending) ||
        retryInput === undefined
      ) {
        return;
      }

      setTranscriptDeliveryStatus(entryId, "sent");
      void sendChatTurn({ userEntryId: entryId, ...retryInput });
    },
    [
      isChatSending,
      retryableChatTurns,
      sendChatTurn,
      setTranscriptDeliveryStatus,
    ],
  );

  const handleManualFrameCapture = useCallback(
    async (): Promise<void> => {
      const capturedFrame = await captureFrameAsync("manual");

      if (capturedFrame !== null && hasRealtimeConnection) {
        const sent = sendVisualContext({
          frameDataUrl: capturedFrame.frameDataUrl,
          prompt:
            "这是用户手动采样的摄像头画面，请作为后续回答的视觉上下文。",
          requestResponse: false,
        });

        if (sent) {
          recordUploadedFrame(capturedFrame.signature);
          addTranscript("system", "已把当前画面加入 Realtime 上下文。");
        }
      }
    },
    [
      addTranscript,
      captureFrameAsync,
      hasRealtimeConnection,
      recordUploadedFrame,
      sendVisualContext,
    ],
  );

  return {
    handleConversationExport,
    handleClearConversation,
    handleRetryChatTurn,
    handleManualFrameCapture,
  };
}
