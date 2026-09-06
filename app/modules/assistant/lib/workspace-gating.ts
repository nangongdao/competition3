import type { AssistantPhase, RealtimeConnectionStatus } from "@/modules/assistant/types";

/**
 * 工作台 UI 派生门控逻辑（纯函数）。
 *
 * `assistant-workspace.tsx` 中大量 `canXxx` 布尔值是纯逻辑派生，不依赖
 * React 生命周期，因此沉淀为可单测的纯函数。每次渲染由组件收集一个
 * 扁平的上下文快照，交给 `resolveWorkspaceGating` 一次性算出全部门控，
 * 主组件只需引用返回的字段即可。
 */

export type WorkspaceGatingContext = {
  isChatMode: boolean;
  isRealtimeMode: boolean;
  hasMedia: boolean;
  hasActiveSession: boolean;
  assistantPhase: AssistantPhase;
  realtimeStatus: RealtimeConnectionStatus;
  hasRealtimeConnection: boolean;
  isProviderConfigLoading: boolean;
  isChatSending: boolean;
  isChatVoiceRecording: boolean;
  isChatVoiceTranscribing: boolean;
  isContinuousChatVoiceEnabled: boolean;
  transcriptionIsRecordingSupported: boolean;
  isPushToTalkMode: boolean;
  isMicrophoneMuted: boolean;
};

export type WorkspaceGating = {
  canStartSession: boolean;
  canUseSessionButton: boolean;
  canChangeTurnMode: boolean;
  canChangeProviderMode: boolean;
  canChangeResponseBudget: boolean;
  canRealtimeTurn: boolean;
  canVisualQuestion: boolean;
  canSendTextMessage: boolean;
  canToggleChatSpeechInput: boolean;
  canStartContinuousChatVoice: boolean;
  canPushToTalk: boolean;
  canStopSession: boolean;
};

const isRealtimeBusy = (ctx: WorkspaceGatingContext): boolean =>
  ctx.realtimeStatus === "creating-session" || ctx.realtimeStatus === "connecting";

const isChatVoiceBusy = (ctx: WorkspaceGatingContext): boolean =>
  ctx.isChatVoiceRecording || ctx.isChatVoiceTranscribing;

/**
 * 一次性计算工作台全部派生门控布尔。
 * 输入为扁平上下文快照，输出全部 `canXxx` 派生值。
 */
export function resolveWorkspaceGating(
  ctx: WorkspaceGatingContext,
): WorkspaceGating {
  const realtimeBusy = isRealtimeBusy(ctx);
  const chatVoiceBusy = isChatVoiceBusy(ctx);
  const chatBlocked = ctx.isChatSending || chatVoiceBusy;

  const canStartSession =
    ctx.isRealtimeMode &&
    ctx.hasMedia &&
    !ctx.hasActiveSession &&
    !realtimeBusy &&
    !ctx.hasRealtimeConnection;

  const canUseSessionButton = ctx.isChatMode
    ? !ctx.isProviderConfigLoading &&
      !ctx.isChatSending &&
      !chatVoiceBusy &&
      !ctx.isContinuousChatVoiceEnabled
    : canStartSession;

  const canChangeTurnMode =
    ctx.isRealtimeMode &&
    !ctx.hasActiveSession &&
    !realtimeBusy &&
    !ctx.hasRealtimeConnection;

  const canChangeProviderMode =
    !ctx.isProviderConfigLoading &&
    !ctx.isChatSending &&
    !chatVoiceBusy &&
    !ctx.isContinuousChatVoiceEnabled &&
    !realtimeBusy;

  const canChangeResponseBudget = ctx.isChatMode
    ? !ctx.isChatSending && !chatVoiceBusy && !ctx.isContinuousChatVoiceEnabled
    : canChangeTurnMode;

  const canRealtimeTurn =
    ctx.isRealtimeMode &&
    ctx.assistantPhase === "listening" &&
    ctx.hasRealtimeConnection;

  const canVisualQuestion = ctx.isChatMode
    ? ctx.hasMedia && !chatBlocked && !ctx.isContinuousChatVoiceEnabled
    : canRealtimeTurn;

  const canSendTextMessage = ctx.isChatMode
    ? !ctx.isChatSending && !chatVoiceBusy && !ctx.isContinuousChatVoiceEnabled
    : ctx.hasRealtimeConnection;

  const canToggleChatSpeechInput =
    ctx.isChatMode &&
    ctx.transcriptionIsRecordingSupported &&
    ctx.hasMedia &&
    !ctx.isContinuousChatVoiceEnabled &&
    !ctx.isChatVoiceTranscribing &&
    (!ctx.isChatSending || ctx.isChatVoiceRecording);

  const canStartContinuousChatVoice =
    ctx.isChatMode &&
    ctx.transcriptionIsRecordingSupported &&
    ctx.hasMedia &&
    !ctx.isContinuousChatVoiceEnabled &&
    !chatVoiceBusy &&
    !ctx.isChatSending;

  const canPushToTalk =
    ctx.isRealtimeMode &&
    ctx.assistantPhase === "listening" &&
    ctx.hasRealtimeConnection &&
    ctx.isPushToTalkMode &&
    !ctx.isMicrophoneMuted;

  const canStopSession =
    (ctx.isRealtimeMode && ctx.hasActiveSession) ||
    ctx.hasRealtimeConnection ||
    ctx.realtimeStatus === "creating-session" ||
    ctx.realtimeStatus === "connecting";

  return {
    canStartSession,
    canUseSessionButton,
    canChangeTurnMode,
    canChangeProviderMode,
    canChangeResponseBudget,
    canRealtimeTurn,
    canVisualQuestion,
    canSendTextMessage,
    canToggleChatSpeechInput,
    canStartContinuousChatVoice,
    canPushToTalk,
    canStopSession,
  };
}
