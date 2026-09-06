import { getStringField } from "@/modules/assistant/lib/type-guards";

/**
 * Realtime 服务器事件分类的纯函数层。
 *
 * 把 `use-realtime-session.ts` 中 `handleServerEvent` 的 if/else 判定链抽为
 * 可单测的纯函数：给定一条服务器事件，返回一个结构化的「动作描述」。
 * hook 只负责按动作执行副作用（写 ref / 更新状态 / 回调），判定本身
 * 不再依赖浏览器 API 或 React 状态，保证 oai-events 分发可测。
 */

export type RealtimeServerEventAction =
  /** 事件缺少 `type` 字段，或不属于任何已知分支——忽略。 */
  | { kind: "none" }
  /** 服务器返回 error 事件（含会话错误）。 */
  | { kind: "error" }
  /** conversation.item.created —— 由调用方记录新创建的画面条目。 */
  | { kind: "image-created" }
  /** input_audio_buffer.speech_started —— 用户开始说话。 */
  | { kind: "speech-started" }
  /** response.created —— 服务器开始生成响应。 */
  | { kind: "response-created" }
  /** response.*.delta —— 流式增量文本（追加到缓冲）。 */
  | { kind: "text-delta"; delta: string }
  /** response.audio_transcript.done —— 一段完整助手转写结束。 */
  | { kind: "transcript-done"; text: string | null }
  /** response.output_text.done / response.text.done —— 一段完整助手文本结束。 */
  | { kind: "text-done"; text: string | null }
  /** conversation.item.input_audio_transcription.completed —— 用户转写完成。 */
  | { kind: "user-transcript"; transcript: string | null }
  /** response.done —— 一次响应完整结束。 */
  | { kind: "response-done" };

export const REALTIME_SERVER_EVENT_TYPES = {
  ERROR: "error",
  CONVERSATION_ITEM_CREATED: "conversation.item.created",
  SPEECH_STARTED: "input_audio_buffer.speech_started",
  RESPONSE_CREATED: "response.created",
  AUDIO_TRANSCRIPT_DELTA: "response.audio_transcript.delta",
  OUTPUT_TEXT_DELTA: "response.output_text.delta",
  TEXT_DELTA: "response.text.delta",
  AUDIO_TRANSCRIPT_DONE: "response.audio_transcript.done",
  OUTPUT_TEXT_DONE: "response.output_text.done",
  TEXT_DONE: "response.text.done",
  INPUT_AUDIO_TRANSCRIPTION_COMPLETED:
    "conversation.item.input_audio_transcription.completed",
  RESPONSE_DONE: "response.done",
} as const;

const DELTA_EVENT_TYPES = new Set<string>([
  REALTIME_SERVER_EVENT_TYPES.AUDIO_TRANSCRIPT_DELTA,
  REALTIME_SERVER_EVENT_TYPES.OUTPUT_TEXT_DELTA,
  REALTIME_SERVER_EVENT_TYPES.TEXT_DELTA,
]);

const TEXT_DONE_EVENT_TYPES = new Set<string>([
  REALTIME_SERVER_EVENT_TYPES.OUTPUT_TEXT_DONE,
  REALTIME_SERVER_EVENT_TYPES.TEXT_DONE,
]);

/**
 * Classifies a raw server event into a structured action descriptor.
 *
 * Pure decision: reads `type` and the minimal payload fields, and returns a
 * discriminated action the caller can dispatch on. Unknown or `null`-typed
 * events collapse to `{ kind: "none" }`.
 *
 * @param event - a parsed server event (plain record).
 * @returns the action descriptor to execute.
 */
export function resolveServerEventAction(
  event: Record<string, unknown>,
): RealtimeServerEventAction {
  const eventType = getStringField(event, "type");

  if (eventType === null) {
    return { kind: "none" };
  }

  if (eventType === REALTIME_SERVER_EVENT_TYPES.ERROR) {
    return { kind: "error" };
  }

  if (eventType === REALTIME_SERVER_EVENT_TYPES.CONVERSATION_ITEM_CREATED) {
    return { kind: "image-created" };
  }

  if (eventType === REALTIME_SERVER_EVENT_TYPES.SPEECH_STARTED) {
    return { kind: "speech-started" };
  }

  if (eventType === REALTIME_SERVER_EVENT_TYPES.RESPONSE_CREATED) {
    return { kind: "response-created" };
  }

  if (DELTA_EVENT_TYPES.has(eventType)) {
    return { kind: "text-delta", delta: getStringField(event, "delta") ?? "" };
  }

  if (eventType === REALTIME_SERVER_EVENT_TYPES.AUDIO_TRANSCRIPT_DONE) {
    return { kind: "transcript-done", text: getStringField(event, "transcript") };
  }

  if (TEXT_DONE_EVENT_TYPES.has(eventType)) {
    return { kind: "text-done", text: getStringField(event, "text") };
  }

  if (eventType === REALTIME_SERVER_EVENT_TYPES.INPUT_AUDIO_TRANSCRIPTION_COMPLETED) {
    return {
      kind: "user-transcript",
      transcript: getStringField(event, "transcript"),
    };
  }

  if (eventType === REALTIME_SERVER_EVENT_TYPES.RESPONSE_DONE) {
    return { kind: "response-done" };
  }

  return { kind: "none" };
}

/**
 * Returns true when a user transcription carries meaningful text worth relaying.
 *
 * @param transcript - the transcript value read from the event.
 * @returns true for non-null, non-whitespace text.
 */
export function isMeaningfulUserTranscript(transcript: string | null): boolean {
  return transcript !== null && transcript.trim().length > 0;
}
