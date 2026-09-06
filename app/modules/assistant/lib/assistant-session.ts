import type { AssistantPhase } from "@/modules/assistant/types";

/**
 * 统一会话编排的纯决策层。
 *
 * M1.6 目标是把 Realtime / Chat 两套底层实现收敛到唯一对外接口，并在模式
 * 切换时完整清理上一会话。这里先把"模式切换需要执行哪些清理动作"抽成纯函数，
 * 供 `assistant-workspace.tsx` 的 `handleProviderModeChange` 直接消费，后续
 * 再随剩余编排逻辑（语音/帧采样）一起下沉到 `use-assistant-session` hook。
 */

export type AssistantSessionMode = "chat" | "realtime";

export type ModeSwitchCleanupPlan = {
  /** 从 Realtime 切走时应关闭 WebRTC 会话。 */
  stopRealtime: boolean;
  /** 切入 Realtime 时应停止连续语音与浏览器朗读，避免争夺麦克风。 */
  cancelContinuousChatVoice: boolean;
  cancelChatVoiceRecording: boolean;
  cancelChatSpeech: boolean;
};

export function createEmptyCleanupPlan(): ModeSwitchCleanupPlan {
  return {
    stopRealtime: false,
    cancelContinuousChatVoice: false,
    cancelChatVoiceRecording: false,
    cancelChatSpeech: false,
  };
}

/**
 * 计算从 previous 模式切换到 next 模式所需的清理动作。
 *
 * @param previous 当前模式
 * @param next 目标模式
 * @param hasRealtimeConnection 当前是否持有 Realtime 连接
 */
export function planModeSwitchCleanup(
  previous: AssistantSessionMode,
  next: AssistantSessionMode,
  hasRealtimeConnection: boolean,
): ModeSwitchCleanupPlan {
  const plan = createEmptyCleanupPlan();

  if (previous === next) {
    return plan;
  }

  if (next === "chat") {
    plan.stopRealtime = hasRealtimeConnection;
  }

  if (next === "realtime") {
    plan.cancelContinuousChatVoice = true;
    plan.cancelChatVoiceRecording = true;
    plan.cancelChatSpeech = true;
  }

  return plan;
}

/**
 * 一次模式切换需要按序执行的副作用动作列表。
 *
 * 将 `ModeSwitchCleanupPlan` 展开为有序的可执行动作，便于统一编排层
 * 按顺序消费，也让动作序列成为可单测的纯逻辑。
 */
export type ModeSwitchAction =
  | { kind: "stop-realtime" }
  | { kind: "set-phase"; phase: AssistantPhase }
  | { kind: "notify-stopped-realtime" }
  | { kind: "cancel-continuous-chat-voice" }
  | { kind: "cancel-chat-voice-recording" }
  | { kind: "cancel-chat-speech" };

/**
 * 把清理计划解析为按序执行的副作用动作列表。
 *
 * 停止 Realtime 后需要先把 phase 重置为切换后目标状态，再提示用户；
 * 其余 Chat 侧语音清理动作依次追加。
 */
export function resolveModeSwitchActions(
  plan: ModeSwitchCleanupPlan,
  mediaGranted: boolean,
): ModeSwitchAction[] {
  const actions: ModeSwitchAction[] = [];

  if (plan.stopRealtime) {
    actions.push(
      { kind: "stop-realtime" },
      { kind: "set-phase", phase: resolvePhaseAfterSwitch(mediaGranted) },
      { kind: "notify-stopped-realtime" },
    );
  }

  if (plan.cancelContinuousChatVoice) {
    actions.push({ kind: "cancel-continuous-chat-voice" });
  }
  if (plan.cancelChatVoiceRecording) {
    actions.push({ kind: "cancel-chat-voice-recording" });
  }
  if (plan.cancelChatSpeech) {
    actions.push({ kind: "cancel-chat-speech" });
  }

  return actions;
}

/**
 * 副作用处理器：统一编排层在逐个消费 `ModeSwitchAction` 时注入的清理回调。
 */
export type ModeSwitchActionHandlers = {
  stopRealtime: () => void;
  setPhase: (phase: AssistantPhase) => void;
  notifyStoppedRealtime: () => void;
  cancelContinuousChatVoice: () => void;
  cancelChatVoiceRecording: () => void;
  cancelChatSpeech: () => void;
};

/**
 * 按序执行模式切换动作列表（可单测的分派逻辑）。
 *
 * 副作用通过注入的 `handlers` 执行，因此可在不渲染 React 的前提下
 * 直接验证动作序列到副作用调用的映射与顺序。
 */
export function runModeSwitchActions(
  actions: readonly ModeSwitchAction[],
  handlers: ModeSwitchActionHandlers,
): void {
  for (const action of actions) {
    switch (action.kind) {
      case "stop-realtime":
        handlers.stopRealtime();
        break;
      case "set-phase":
        handlers.setPhase(action.phase);
        break;
      case "notify-stopped-realtime":
        handlers.notifyStoppedRealtime();
        break;
      case "cancel-continuous-chat-voice":
        handlers.cancelContinuousChatVoice();
        break;
      case "cancel-chat-voice-recording":
        handlers.cancelChatVoiceRecording();
        break;
      case "cancel-chat-speech":
        handlers.cancelChatSpeech();
        break;
    }
  }
}

export function isActiveAssistantPhase(phase: AssistantPhase): boolean {
  return (
    phase === "connecting" ||
    phase === "listening" ||
    phase === "thinking" ||
    phase === "responding"
  );
}

/**
 * 模式切换后，目标侧的初始 phase。
 *
 * 切换后媒体仍可用则进入 ready，否则回到 idle。
 */
export function resolvePhaseAfterSwitch(
  mediaGranted: boolean,
): AssistantPhase {
  return mediaGranted ? "ready" : "idle";
}
