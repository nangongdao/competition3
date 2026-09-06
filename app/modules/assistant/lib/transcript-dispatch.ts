/**
 * 转写 / 相位 dispatch 决策纯函数。
 *
 * 收敛 `assistant-workspace` 主组件中内联的 `addTranscript`、
 * `setTranscriptDeliveryStatus`、`handleRealtimePhaseChange` 三个
 * dispatch 回调的「入参 → action」构建逻辑，使 dispatch 决策可单测。
 *
 * 本模块只负责构建 action，不包含副作用（ref 递增、dispatch 调用），
 * 副作用接线保留在 `hooks/use-transcript-dispatch.ts` 与调用方。
 */

import type {
  AssistantAction,
} from "@/modules/assistant/state/assistant-reducer";
import type {
  AssistantPhase,
  TranscriptEntry,
  TranscriptSpeaker,
} from "@/modules/assistant/types";

/** 构建「转写追加」action 的入参。 */
export type TranscriptAppendInput = {
  /** 转写条目标识符（由调用方生成并维护自增）。 */
  id: string;
  speaker: TranscriptSpeaker;
  text: string;
  /** 条目创建时间戳（毫秒）。 */
  createdAt: number;
  /** 可选的投递状态（缺省时条目不含 deliveryStatus 字段）。 */
  deliveryStatus?: TranscriptEntry["deliveryStatus"];
};

/**
 * 构建 `transcript-appended` action。
 *
 * `deliveryStatus` 仅在显式提供时写入条目，缺省保持 undefined。
 */
export function buildTranscriptAppendAction(
  input: TranscriptAppendInput,
): Extract<AssistantAction, { type: "transcript-appended" }> {
  const { id, speaker, text, createdAt, deliveryStatus } = input;

  return {
    type: "transcript-appended",
    entry: {
      id,
      speaker,
      text,
      createdAt,
      ...(deliveryStatus === undefined ? {} : { deliveryStatus }),
    },
  };
}

/**
 * 构建 `transcript-delivery-set` action。
 *
 * 当 `deliveryStatus` 为 undefined 时返回 `null`（调用方跳过 dispatch），
 * 避免无意义的空操作。
 */
export function buildTranscriptDeliveryAction(
  entryId: string,
  deliveryStatus: TranscriptEntry["deliveryStatus"],
): Extract<AssistantAction, { type: "transcript-delivery-set" }> | null {
  if (deliveryStatus === undefined) {
    return null;
  }

  return {
    type: "transcript-delivery-set",
    entryId,
    deliveryStatus,
  };
}

/**
 * 构建 `phase-set` action。
 */
export function buildPhaseSetAction(
  phase: AssistantPhase,
): Extract<AssistantAction, { type: "phase-set" }> {
  return { type: "phase-set", phase };
}
