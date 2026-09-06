/**
 * 转写 / 相位 dispatch 编排收敛 hook。
 *
 * 收敛 `assistant-workspace` 主组件中内联的三个 dispatch 回调：
 * - `addTranscript`：生成自增条目 id → dispatch `transcript-appended`
 * - `setTranscriptDeliveryStatus`：投递状态更新（undefined 跳过）
 * - `handleRealtimePhaseChange`：相位更新
 *
 * action 构建逻辑沉淀为纯函数（`lib/transcript-dispatch.ts`）并由单测覆盖；
 * 本 hook 仅保留 ref 递增与 dispatch 副作用接线。
 */

import { useCallback } from "react";

import type { AssistantAction } from "@/modules/assistant/state/assistant-reducer";
import type {
  AssistantPhase,
  TranscriptEntry,
  TranscriptSpeaker,
} from "@/modules/assistant/types";

import {
  buildPhaseSetAction,
  buildTranscriptAppendAction,
  buildTranscriptDeliveryAction,
} from "@/modules/assistant/lib/transcript-dispatch";

export type TranscriptDispatchInput = {
  /** 自增条目 id 计数器 ref（由调用方持有，读后自增）。 */
  nextEntryIdRef: React.MutableRefObject<number>;
  /** reducer dispatch。 */
  dispatch: (action: AssistantAction) => void;
};

export type TranscriptDispatchResult = {
  /** 追加一条转写记录，返回生成的条目 id。 */
  addTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
    deliveryStatus?: TranscriptEntry["deliveryStatus"],
  ) => string;
  /** 更新某条转写的投递状态（undefined 跳过）。 */
  setTranscriptDeliveryStatus: (
    entryId: string,
    deliveryStatus: TranscriptEntry["deliveryStatus"],
  ) => void;
  /** 更新助手相位。 */
  handleRealtimePhaseChange: (phase: AssistantPhase) => void;
};

/**
 * 收敛转写 / 相位 dispatch 回调，行为与主组件原内联逻辑完全一致。
 */
export function useTranscriptDispatch({
  nextEntryIdRef,
  dispatch,
}: TranscriptDispatchInput): TranscriptDispatchResult {
  const addTranscript = useCallback(
    (
      speaker: TranscriptSpeaker,
      text: string,
      deliveryStatus?: TranscriptEntry["deliveryStatus"],
    ): string => {
      const id = `entry-${nextEntryIdRef.current}`;
      nextEntryIdRef.current += 1;

      dispatch(
        buildTranscriptAppendAction({
          id,
          speaker,
          text,
          createdAt: Date.now(),
          ...(deliveryStatus === undefined ? {} : { deliveryStatus }),
        }),
      );

      return id;
    },
    [dispatch, nextEntryIdRef],
  );

  const setTranscriptDeliveryStatus = useCallback(
    (
      entryId: string,
      deliveryStatus: TranscriptEntry["deliveryStatus"],
    ): void => {
      const action = buildTranscriptDeliveryAction(entryId, deliveryStatus);
      if (action !== null) {
        dispatch(action);
      }
    },
    [dispatch],
  );

  const handleRealtimePhaseChange = useCallback(
    (phase: AssistantPhase): void => {
      dispatch(buildPhaseSetAction(phase));
    },
    [dispatch],
  );

  return { addTranscript, setTranscriptDeliveryStatus, handleRealtimePhaseChange };
}
