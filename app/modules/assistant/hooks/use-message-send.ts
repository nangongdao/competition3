import { useCallback, type Dispatch } from "react";

import { type AssistantAction } from "@/modules/assistant/state/assistant-reducer";
import { type FrameSignature } from "@/modules/assistant/lib/frame-diff";
import type { AssistantPhase, TranscriptSpeaker } from "@/modules/assistant/types";
import type { ChatTurnInput } from "@/modules/assistant/hooks/use-send-chat-turn";

/** Realtime 会话发送视觉上下文的输入。 */
export type SendVisualContextInput = {
  frameDataUrl: string;
  prompt: string;
  requestResponse: boolean;
};

/** 从摄像头采样的画面帧。 */
export type CapturedFrame = {
  frameDataUrl: string;
  signature: FrameSignature;
};

/** 文本发送依赖的副作用回调集合。 */
export type TextMessageDeps = {
  /** 追加一条转写条目，返回条目 id。 */
  addTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
    deliveryStatus?: "sent" | "failed",
  ) => string;
  /** Chat 模式发送一轮回合。 */
  sendChatTurn: (input: ChatTurnInput) => Promise<boolean>;
  /** Realtime 模式发送一条文本消息。 */
  sendTextMessage: (text: string) => boolean;
  /** 清空输入框草稿。 */
  clearDraft: () => void;
};

/** 视觉提问依赖的副作用回调集合。 */
export type RealtimeTurnDeps = {
  /** 追加一条转写条目，返回条目 id。 */
  addTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
    deliveryStatus?: "sent" | "failed",
  ) => string;
  /** 会话 reducer 的 dispatch。 */
  dispatch: Dispatch<AssistantAction>;
  /** Chat 模式发送一轮回合（含画面帧）。 */
  sendChatTurn: (input: ChatTurnInput) => Promise<boolean>;
  /** Realtime 模式发送一帧视觉上下文。 */
  sendVisualContext: (input: SendVisualContextInput) => boolean;
  /** 采样一帧摄像头画面。 */
  captureFrameAsync: (source: "manual" | "auto") => Promise<CapturedFrame | null>;
  /** 记录一帧已上传。 */
  recordUploadedFrame: (signature: FrameSignature) => void;
};

const REALTIME_TURN_PROMPT = "请描述你现在看到的画面。";

/**
 * 文本消息分派（纯逻辑）。
 *
 * 按 Chat / Realtime 模式分派 `sendChatTurn` 或 `sendTextMessage`，
 * 空消息直接忽略。返回是否已消费该次提交。
 */
export function dispatchTextMessage(
  textDraft: string,
  isChatMode: boolean,
  hasRealtimeConnection: boolean,
  deps: TextMessageDeps,
): boolean {
  const message = textDraft.trim();

  if (message.length === 0) {
    return false;
  }

  if (isChatMode) {
    const userEntryId = deps.addTranscript("user", message, "sent");
    deps.clearDraft();
    void deps.sendChatTurn({ userEntryId, message });
    return true;
  }

  if (!hasRealtimeConnection) {
    deps.addTranscript("system", "请先启动 Realtime 会话再发送文本。");
    return true;
  }

  const sent = deps.sendTextMessage(message);

  if (!sent) {
    deps.addTranscript("system", "Realtime 通道未就绪，文本发送失败。");
    return true;
  }

  deps.addTranscript("user", message);
  deps.clearDraft();
  return true;
}

/**
 * 视觉提问分派（纯逻辑）。
 *
 * 统一"先采样→再按模式分派"：
 * - Chat 模式：采样一帧作为画面随 `sendChatTurn` 发送；
 * - Realtime 模式：采样后经 `sendVisualContext` 发送并要求回复。
 */
export async function dispatchRealtimeTurn(
  isChatMode: boolean,
  hasMedia: boolean,
  hasRealtimeConnection: boolean,
  assistantPhase: AssistantPhase,
  deps: RealtimeTurnDeps,
): Promise<void> {
  const prompt = REALTIME_TURN_PROMPT;

  if (isChatMode) {
    if (!hasMedia) {
      deps.addTranscript("system", "请先授权摄像头后再提问。");
      return;
    }

    const capturedFrame = await deps.captureFrameAsync("manual");

    if (capturedFrame === null) {
      return;
    }

    const userEntryId = deps.addTranscript("user", prompt, "sent");
    void deps.sendChatTurn({
      userEntryId,
      message: prompt,
      imageDataUrl: capturedFrame.frameDataUrl,
      signature: capturedFrame.signature,
    });
    return;
  }

  if (assistantPhase !== "listening" || !hasRealtimeConnection) {
    return;
  }

  const capturedFrame = await deps.captureFrameAsync("manual");

  if (capturedFrame === null) {
    return;
  }

  deps.addTranscript("user", prompt);

  const sent = deps.sendVisualContext({
    frameDataUrl: capturedFrame.frameDataUrl,
    prompt,
    requestResponse: true,
  });

  if (sent) {
    deps.recordUploadedFrame(capturedFrame.signature);
    deps.addTranscript("system", "已把画面发送给 Realtime 模型。");
    return;
  }

  deps.dispatch({ type: "phase-set", phase: "error" });
  deps.addTranscript("system", "Realtime 通道未就绪，画面发送失败。");
}

/**
 * 文本发送 / 视觉提问编排 hook。
 *
 * 收敛 `assistant-workspace` 主组件中 `handleTextMessageSubmit` 与
 * `handleRealtimeTurn` 两个入口，将分派决策委托给可单测的纯函数
 * `dispatchTextMessage` / `dispatchRealtimeTurn`，组件仅收集依赖并触发。
 *
 * 输入框草稿 `textDraft` 由调用方持有（供语音识别回填等场景共享），
 * hook 通过 `textDraft` / `setTextDraft` 读写。
 */
export type UseMessageSendOptions = {
  /** 输入框草稿内容（由调用方持有，供语音识别回填等场景共享）。 */
  textDraft: string;
  /** 更新输入框草稿。 */
  setTextDraft: (value: string) => void;
  /** 是否处于 Chat Completions 模式（否则为 Realtime 模式）。 */
  isChatMode: boolean;
  /** 是否已授权摄像头且存在视频流。 */
  hasMedia: boolean;
  /** Realtime 通道是否已建立连接。 */
  hasRealtimeConnection: boolean;
  /** 当前助手阶段（决定 Realtime 视觉提问是否可用）。 */
  assistantPhase: AssistantPhase;
  /** 追加一条转写条目。 */
  addTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
    deliveryStatus?: "sent" | "failed",
  ) => string;
  /** 会话 reducer 的 dispatch。 */
  dispatch: Dispatch<AssistantAction>;
  /** Chat 模式发送一轮回合。 */
  sendChatTurn: (input: ChatTurnInput) => Promise<boolean>;
  /** Realtime 模式发送一条文本消息。 */
  sendTextMessage: (text: string) => boolean;
  /** Realtime 模式发送一帧视觉上下文。 */
  sendVisualContext: (input: SendVisualContextInput) => boolean;
  /** 采样一帧摄像头画面。 */
  captureFrameAsync: (source: "manual" | "auto") => Promise<CapturedFrame | null>;
  /** 记录一帧已上传。 */
  recordUploadedFrame: (signature: FrameSignature) => void;
};

export type UseMessageSendResult = {
  /** 提交文本消息（Chat / Realtime 自动分派）。 */
  handleTextMessageSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /** 视觉提问（Chat / Realtime 采样→发送分派）。 */
  handleRealtimeTurn: () => Promise<void>;
};

export function useMessageSend({
  textDraft,
  setTextDraft,
  isChatMode,
  hasMedia,
  hasRealtimeConnection,
  assistantPhase,
  addTranscript,
  dispatch,
  sendChatTurn,
  sendTextMessage,
  sendVisualContext,
  captureFrameAsync,
  recordUploadedFrame,
}: UseMessageSendOptions): UseMessageSendResult {
  const handleTextMessageSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault();

      dispatchTextMessage(textDraft, isChatMode, hasRealtimeConnection, {
        addTranscript,
        sendChatTurn,
        sendTextMessage,
        clearDraft: () => setTextDraft(""),
      });
    },
    [
      addTranscript,
      hasRealtimeConnection,
      isChatMode,
      sendChatTurn,
      sendTextMessage,
      setTextDraft,
      textDraft,
    ],
  );

  const handleRealtimeTurn = useCallback(
    (): Promise<void> =>
      dispatchRealtimeTurn(
        isChatMode,
        hasMedia,
        hasRealtimeConnection,
        assistantPhase,
        {
          addTranscript,
          dispatch,
          sendChatTurn,
          sendVisualContext,
          captureFrameAsync,
          recordUploadedFrame,
        },
      ),
    [
      addTranscript,
      assistantPhase,
      captureFrameAsync,
      dispatch,
      hasMedia,
      hasRealtimeConnection,
      isChatMode,
      recordUploadedFrame,
      sendChatTurn,
      sendVisualContext,
    ],
  );

  return {
    handleTextMessageSubmit,
    handleRealtimeTurn,
  };
}
