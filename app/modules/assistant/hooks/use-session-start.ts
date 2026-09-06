import { useCallback, type Dispatch, type MutableRefObject } from "react";

import type { AssistantAction } from "@/modules/assistant/state/assistant-reducer";
import type { FrameSignature } from "@/modules/assistant/lib/frame-diff";
import {
  resolveSessionStart,
  resolveBlockedPhase,
} from "@/modules/assistant/lib/session-start";
import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";
import type { TranscriptSpeaker } from "@/modules/assistant/types";
/**
 * M4.3 空间定位标注：引导模型在用户询问对象位置时输出结构化标注块。
 *
 * 模型以文本方式返回 `[ANNOTATIONS] JSON数组 [/ANNOTATIONS]` 分块，
 * 前端解析后在摄像头预览叠加归一化坐标框。未询问位置时模型应不输出，
 * 减少 token 开销。
 */
const SPATIAL_ANNOTATION_INSTRUCTION =
  "当用户询问画面中某个对象在哪里（如“在哪/位置/哪个方向”）时，" +
  "在回答末尾额外输出一个标注块：[ANNOTATIONS][{\"label\":\"对象名\",\"box\":{\"x\":0.5,\"y\":0.4,\"w\":0.3,\"h\":0.2}}][/ANNOTATIONS]，" +
  "其中 x/y/w/h 均为 0~1 归一化坐标（x 向右、y 向下）。不在上述场景时不要输出标注块。";

/** Realtime 会话启动时的基础系统指令。 */
const BASE_SESSION_INSTRUCTIONS =
  "你是一个中文视觉对话助手。请结合摄像头画面和用户语音或文字进行简洁、自然、准确的回应。" +
  `\n${SPATIAL_ANNOTATION_INSTRUCTION}`;

export type SessionStartDeps = {
  /** 当前是否处于 Chat 模式（Chat 无需启动 Realtime）。 */
  isChatMode: boolean;
  /** 摄像头 / 麦克风是否已授权。 */
  mediaGranted: boolean;
  /** 会话 reducer 的 dispatch。 */
  dispatch: Dispatch<AssistantAction>;
  /** 追加一条转写条目。 */
  addTranscript: (speaker: TranscriptSpeaker, text: string) => string;
  /** 最近一次已上传帧的签名（会话启动时重置）。 */
  lastUploadedFrameSignatureRef: MutableRefObject<FrameSignature | null>;
  /** 是否启用自动帧采样。 */
  isAutoSampling: boolean;
  /** Realtime 会话的 VAD 检测模式。 */
  turnDetectionMode: RealtimeTurnDetectionMode;
  /** Realtime 会话的回答预算。 */
  responseBudget: RealtimeResponseBudget;
  /** 启动 Realtime 会话（来自 use-realtime-session）。 */
  startRealtimeSession: (input: {
    visualContextMode: "interval" | "manual";
    turnDetectionMode: RealtimeTurnDetectionMode;
    responseBudget: RealtimeResponseBudget;
    instructions?: string;
  }) => Promise<boolean>;
};

export type UseSessionStartResult = {
  /** 启动会话（Chat 提示 / Realtime 创建）。 */
  handleStartSession: () => void;
};

/**
 * 会话启动编排 hook。
 *
 * 收敛 `assistant-workspace` 主组件的 `handleStartSession`：将"是否放行启动
 * Realtime"的前置判定委托给 `lib/session-start.ts` 纯函数，组件仅收集依赖并
 * 触发 dispatch / 提示 / 启动副作用。
 */
export function useSessionStart({
  isChatMode,
  mediaGranted,
  dispatch,
  addTranscript,
  lastUploadedFrameSignatureRef,
  isAutoSampling,
  turnDetectionMode,
  responseBudget,
  startRealtimeSession,
}: SessionStartDeps): UseSessionStartResult {
  const handleStartSession = useCallback((): void => {
    const decision = resolveSessionStart({ isChatMode, mediaGranted });

    if (decision.kind === "blocked-chat-mode") {
      addTranscript(
        "system",
        "Chat Completions 模式无需启动 Realtime，会在发送问题时按次请求。",
      );
      return;
    }

    if (decision.kind === "blocked-no-media") {
      const phase = resolveBlockedPhase(decision);
      if (phase !== null) {
        dispatch({ type: "phase-set", phase });
      }
      addTranscript("system", "请先授权摄像头和麦克风。");
      return;
    }

    addTranscript("system", "正在创建 Realtime 会话。");
    lastUploadedFrameSignatureRef.current = null;
    dispatch({ type: "frame-upload-counters-reset" });
    void startRealtimeSession({
      visualContextMode: isAutoSampling ? "interval" : "manual",
      turnDetectionMode,
      responseBudget,
      instructions: BASE_SESSION_INSTRUCTIONS,
    });
  }, [
    addTranscript,
    dispatch,
    isAutoSampling,
    isChatMode,
    lastUploadedFrameSignatureRef,
    mediaGranted,
    responseBudget,
    startRealtimeSession,
    turnDetectionMode,
  ]);

  return { handleStartSession };
}
