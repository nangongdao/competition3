import type { AssistantPhase } from "@/modules/assistant/types";

/**
 * 会话启动编排的纯决策层。
 *
 * 将 `assistant-workspace` 主组件 `handleStartSession` 的前置判定抽为可单测纯函数：
 * 何时应拒绝（Chat 模式无需启动 / 媒体未授权）、何时应放行进入 Realtime 创建流程。
 * 副作用（dispatch / addTranscript / startRealtimeSession）由组件侧注入执行。
 */

export type SessionStartDecision =
  | { kind: "blocked-chat-mode" }
  | { kind: "blocked-no-media" }
  | { kind: "proceed" };

export type SessionStartContext = {
  /** 当前是否处于 Chat 模式（Chat 无需启动 Realtime）。 */
  isChatMode: boolean;
  /** 摄像头 / 麦克风是否已授权。 */
  mediaGranted: boolean;
};

/**
 * 计算一次"开始会话"应执行的决策。
 *
 * - Chat 模式：无需启动 Realtime，拒绝并提示。
 * - Realtime 模式但媒体未授权：拒绝并提示先授权。
 * - Realtime 模式且媒体已授权：放行进入创建流程。
 */
export function resolveSessionStart(
  context: SessionStartContext,
): SessionStartDecision {
  if (context.isChatMode) {
    return { kind: "blocked-chat-mode" };
  }

  if (!context.mediaGranted) {
    return { kind: "blocked-no-media" };
  }

  return { kind: "proceed" };
}

/**
 * 被拒绝时目标侧应进入的 phase。
 *
 * Chat 模式无需改动 phase（维持现状，直接提示）；媒体未授权则进入 error 态。
 */
export function resolveBlockedPhase(
  decision: SessionStartDecision,
): AssistantPhase | null {
  if (decision.kind === "blocked-no-media") {
    return "error";
  }

  return null;
}
