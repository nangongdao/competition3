import { getStringField, isRecord } from "@/modules/assistant/lib/type-guards";
import type {
  RealtimeCostPolicy,
  RealtimeSessionSuccessResponse,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";

/**
 * Realtime 会话协议层的纯函数与常量。
 *
 * 从 `use-realtime-session.ts` 抽出，与 React 状态、WebRTC 生命周期解耦，
 * 便于单测：事件构造、空闲判定、上游响应校验、错误本地化、麦克风轨道
 * 开关决策都在这里，不依赖浏览器 API 实例。
 */

export const DEFAULT_TURN_DETECTION_MODE: RealtimeTurnDetectionMode = "server-vad";
export const DATA_CHANNEL_LABEL = "oai-events";
export const DATA_CHANNEL_OPEN_TIMEOUT_MS = 15_000;
export const REALTIME_IDLE_WARNING_MS = 90_000;
export const REALTIME_IDLE_DISCONNECT_MS = 120_000;
export const REALTIME_IDLE_CHECK_INTERVAL_MS = 30_000;

export type RealtimeResponseMode = "audio-text" | "text-only";
export type RealtimeIdleDecision = "none" | "warn" | "disconnect";

export type RealtimeIdleDecisionInput = {
  now: number;
  lastActivityAt: number;
  hasWarned: boolean;
  warningMs?: number;
  disconnectMs?: number;
};

export type RealtimeContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

export type RealtimeConversationItemCreateEvent = {
  type: "conversation.item.create";
  item: {
    type: "message";
    role: "user";
    content: RealtimeContentPart[];
  };
};

export type RealtimeResponseCreateEvent = {
  type: "response.create";
  response: {
    modalities: ["audio", "text"] | ["text"];
  };
};

export type RealtimeInputAudioBufferCommitEvent = {
  type: "input_audio_buffer.commit";
};

export function getRealtimeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Realtime 会话失败。";
}

export function getServerEventErrorMessage(event: Record<string, unknown>): string {
  const directMessage = getStringField(event, "message");

  if (directMessage !== null) {
    return directMessage;
  }

  const errorValue = event.error;

  if (isRecord(errorValue)) {
    const nestedMessage = getStringField(errorValue, "message");

    if (nestedMessage !== null) {
      return nestedMessage;
    }
  }

  return "Realtime 服务返回了错误。";
}

export function getSessionClientSecret(session: unknown): string | null {
  if (!isRecord(session)) {
    return null;
  }

  const clientSecret = session.client_secret;

  if (typeof clientSecret === "string") {
    return clientSecret;
  }

  if (isRecord(clientSecret)) {
    const value = getStringField(clientSecret, "value");

    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function isRealtimeCostPolicy(value: unknown): value is RealtimeCostPolicy {
  return (
    isRecord(value) &&
    (value.visualContextMode === "manual" ||
      value.visualContextMode === "interval") &&
    (value.turnDetectionMode === "server-vad" ||
      value.turnDetectionMode === "push-to-talk") &&
    (value.responseBudget === "brief" ||
      value.responseBudget === "standard" ||
      value.responseBudget === "detailed") &&
    typeof value.maxResponseOutputTokens === "number" &&
    typeof value.maxSessionSeconds === "number" &&
    value.frameUpload === "manual-or-interval"
  );
}

export function isRealtimeSessionSuccessResponse(
  value: unknown,
): value is RealtimeSessionSuccessResponse {
  return (
    isRecord(value) &&
    value.success === true &&
    "session" in value &&
    typeof value.webrtcUrl === "string" &&
    value.webrtcUrl.trim().length > 0 &&
    isRealtimeCostPolicy(value.costPolicy)
  );
}

export function getLocalizedApiErrorMessage(errorResponse: {
  code: string;
  error: string;
}): string {
  if (errorResponse.code === "missing_openai_api_key") {
    return "Worker 尚未配置 OPENAI_API_KEY，无法启动 Realtime 会话。";
  }

  if (errorResponse.code === "invalid_request") {
    return "Realtime 会话请求参数无效。";
  }

  if (errorResponse.code === "realtime_timeout") {
    return "Realtime 服务响应超时，请稍后重试。";
  }

  if (errorResponse.code === "realtime_rate_limited") {
    return "Realtime 服务当前请求过多，请稍后重试。";
  }

  if (
    errorResponse.code === "realtime_circuit_open" ||
    errorResponse.code === "realtime_unavailable"
  ) {
    return "Realtime 服务暂时不可用，请稍后重试。";
  }

  if (errorResponse.code === "request_cancelled") {
    return "Realtime 会话请求已取消。";
  }

  if (errorResponse.code === "openai_session_failed") {
    return `OpenAI 会话创建失败：${errorResponse.error}`;
  }

  return errorResponse.error;
}

export function parseServerEvent(data: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(data) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export function shouldEnableMicrophoneTrack(
  turnDetectionMode: RealtimeTurnDetectionMode,
  isMicrophoneMuted: boolean,
  isPushToTalkActive: boolean,
): boolean {
  if (isMicrophoneMuted) {
    return false;
  }

  return turnDetectionMode === "server-vad" || isPushToTalkActive;
}

export function getRealtimeIdleDecision({
  now,
  lastActivityAt,
  hasWarned,
  warningMs = REALTIME_IDLE_WARNING_MS,
  disconnectMs = REALTIME_IDLE_DISCONNECT_MS,
}: RealtimeIdleDecisionInput): RealtimeIdleDecision {
  const idleForMs = Math.max(0, now - lastActivityAt);

  if (idleForMs >= disconnectMs) {
    return "disconnect";
  }

  if (idleForMs >= warningMs && !hasWarned) {
    return "warn";
  }

  return "none";
}

export function buildConversationEvent(input: {
  frameDataUrl: string;
  prompt: string;
}): RealtimeConversationItemCreateEvent {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: input.prompt },
        { type: "input_image", image_url: input.frameDataUrl },
      ],
    },
  };
}

export function buildTextConversationEvent(
  text: string,
): RealtimeConversationItemCreateEvent {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text }],
    },
  };
}

export function buildResponseCreateEvent(
  responseMode: RealtimeResponseMode,
): RealtimeResponseCreateEvent {
  return {
    type: "response.create",
    response: {
      modalities: responseMode === "text-only" ? ["text"] : ["audio", "text"],
    },
  };
}

export function buildAudioBufferCommitEvent(): RealtimeInputAudioBufferCommitEvent {
  return {
    type: "input_audio_buffer.commit",
  };
}
