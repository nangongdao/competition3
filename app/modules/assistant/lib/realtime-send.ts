import {
  buildAudioBufferCommitEvent,
  buildConversationEvent,
  buildResponseCreateEvent,
  buildTextConversationEvent,
  type RealtimeResponseMode,
} from "@/modules/assistant/lib/realtime-protocol";
import type { RealtimeConnectionStatus } from "@/modules/assistant/types";
import type { RealtimeTurnDetectionMode } from "../../../../src/worker/routes/realtime/types";

/**
 * Realtime 发送链路的纯函数决策层。
 *
 * 把 `use-realtime-session.ts` 中 `sendVisualContext` / `sendTextMessage` /
 * `startPushToTalk` / `stopPushToTalk` 的判定与事件组装抽为可单测的纯函数：
 * 输入是快照式的「当前通道 / 模式 / 静音 / PTT 状态」，输出是结构化结果
 * （拒绝 / 激活 / 需要发送哪些事件）。hook 只负责按结果执行浏览器副作用
 * （dataChannel.send / 更新 ref 与 state）。
 */

/** 图片帧地址前缀——判定某帧是否为可发送的 data URL。 */
export const DATA_IMAGE_PREFIX = "data:image/";

export type RealtimeChannelSendResult =
  | { kind: "none" }
  | {
      kind: "send";
      /** 序列化后应依次发往数据通道的事件列表。 */
      events: unknown[];
      /** 本次发送是否同时触发了响应生成。 */
      responseRequested: boolean;
    };

/** 文本消息发送的纯决策。 */
export type RealtimeSendTextInput = {
  text: string;
  channelReady: boolean;
  responseMode: RealtimeResponseMode;
};

export function resolveSendText(
  input: RealtimeSendTextInput,
): RealtimeChannelSendResult {
  if (!input.channelReady) {
    return { kind: "none" };
  }

  const trimmedText = input.text.trim();

  if (trimmedText.length === 0) {
    return { kind: "none" };
  }

  return {
    kind: "send",
    events: [
      buildTextConversationEvent(trimmedText),
      buildResponseCreateEvent(input.responseMode),
    ],
    responseRequested: true,
  };
}

/** 画面上下文发送的纯决策。 */
export type RealtimeSendVisualContextInput = {
  frameDataUrl: string;
  prompt: string;
  requestResponse: boolean;
  channelReady: boolean;
  responseMode: RealtimeResponseMode;
};

export function resolveSendVisualContext(
  input: RealtimeSendVisualContextInput,
): RealtimeChannelSendResult {
  if (!input.channelReady) {
    return { kind: "none" };
  }

  if (!input.frameDataUrl.startsWith(DATA_IMAGE_PREFIX)) {
    return { kind: "none" };
  }

  const events: unknown[] = [
    buildConversationEvent({
      frameDataUrl: input.frameDataUrl,
      prompt: input.prompt,
    }),
  ];

  let responseRequested = false;

  if (input.requestResponse) {
    events.push(buildResponseCreateEvent(input.responseMode));
    responseRequested = true;
  }

  return { kind: "send", events, responseRequested };
}

/** PTT 启动的纯决策。 */
export type RealtimePushToTalkStartInput = {
  status: RealtimeConnectionStatus;
  turnDetectionMode: RealtimeTurnDetectionMode;
  isMicrophoneMuted: boolean;
  isPushToTalkActive: boolean;
};

export type RealtimePushToTalkStartResult =
  | { kind: "denied" }
  | { kind: "already-active" }
  | { kind: "activate" };

export function resolvePushToTalkStart(
  input: RealtimePushToTalkStartInput,
): RealtimePushToTalkStartResult {
  if (
    input.status !== "connected" ||
    input.turnDetectionMode !== "push-to-talk" ||
    input.isMicrophoneMuted
  ) {
    return { kind: "denied" };
  }

  if (input.isPushToTalkActive) {
    return { kind: "already-active" };
  }

  return { kind: "activate" };
}

/** PTT 停止的纯决策。 */
export type RealtimePushToTalkStopInput = {
  turnDetectionMode: RealtimeTurnDetectionMode;
  isPushToTalkActive: boolean;
  isMicrophoneMuted: boolean;
  channelReady: boolean;
  responseMode: RealtimeResponseMode;
};

export type RealtimePushToTalkStopResult =
  | { kind: "none" }
  | { kind: "deactivate" }
  | {
      kind: "deactivate-and-send";
      events: unknown[];
    };

export function resolvePushToTalkStop(
  input: RealtimePushToTalkStopInput,
): RealtimePushToTalkStopResult {
  if (
    input.turnDetectionMode !== "push-to-talk" ||
    !input.isPushToTalkActive
  ) {
    return { kind: "none" };
  }

  if (input.isMicrophoneMuted || !input.channelReady) {
    return { kind: "deactivate" };
  }

  return {
    kind: "deactivate-and-send",
    events: [
      buildAudioBufferCommitEvent(),
      buildResponseCreateEvent(input.responseMode),
    ],
  };
}
