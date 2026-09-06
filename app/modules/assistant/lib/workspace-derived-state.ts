import { isActiveAssistantPhase } from "@/modules/assistant/lib/assistant-session";
import type {
  AssistantPhase,
  MediaPermissionStatus,
  RealtimeConnectionStatus,
} from "@/modules/assistant/types";
import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";
import type { ProviderMode } from "../../../../src/worker/routes/provider/types";

/**
 * 工作台派生状态计算（纯函数）。
 *
 * `assistant-workspace.tsx` 中有一组从媒体 / 会话 / 供应商 / 转写状态
 * 派生的布尔与值（`hasMedia`、`isChatMode`、`activeResponseBudget` 等），
 * 此前全部内联在组件里，是不可测的「入参 → 派生值」映射。
 * 与 `resolveWorkspaceGating` / `resolveWorkspaceStatusLabels` 同类，
 * 故沉淀为可单测纯函数。
 *
 * 每次渲染由组件收集一个扁平上下文快照，交给 `resolveWorkspaceDerivedState`
 * 一次性算出全部派生值，主组件只需引用返回的字段即可。
 */

export type WorkspaceDerivedStateContext = {
  mediaStatus: MediaPermissionStatus;
  /** 是否持有本地媒体流（`stream !== null`）。 */
  hasStream: boolean;
  assistantPhase: AssistantPhase;
  realtimeStatus: RealtimeConnectionStatus;
  providerMode: ProviderMode;
  /** 语音转写状态（Worker ASR）。 */
  transcriptionStatus: "unsupported" | "idle" | "recording" | "transcribing" | "error";
  /** 用户侧可配置的默认值，被服务端 costPolicy 覆盖前生效。 */
  turnDetectionMode: RealtimeTurnDetectionMode;
  responseBudget: RealtimeResponseBudget;
  /** 服务端下发的实时 cost policy（未下发时 undefined）。 */
  costPolicyTurnDetectionMode?: RealtimeTurnDetectionMode;
  costPolicyResponseBudget?: RealtimeResponseBudget;
};

export type WorkspaceDerivedState = {
  hasMedia: boolean;
  hasActiveSession: boolean;
  hasRealtimeConnection: boolean;
  isChatMode: boolean;
  isRealtimeMode: boolean;
  isChatVoiceRecording: boolean;
  isChatVoiceTranscribing: boolean;
  isChatVoiceBusy: boolean;
  activeTurnDetectionMode: RealtimeTurnDetectionMode;
  activeResponseBudget: RealtimeResponseBudget;
  isPushToTalkMode: boolean;
};

/**
 * 一次性计算工作台全部派生状态。
 * 输入为扁平上下文快照，输出全部派生布尔与值。
 */
export function resolveWorkspaceDerivedState(
  ctx: WorkspaceDerivedStateContext,
): WorkspaceDerivedState {
  const hasMedia = ctx.mediaStatus === "granted" && ctx.hasStream;
  const hasActiveSession = isActiveAssistantPhase(ctx.assistantPhase);

  const hasRealtimeConnection = ctx.realtimeStatus === "connected";

  const isChatMode = ctx.providerMode === "chat";
  const isRealtimeMode = ctx.providerMode === "realtime";

  const isChatVoiceRecording = ctx.transcriptionStatus === "recording";
  const isChatVoiceTranscribing = ctx.transcriptionStatus === "transcribing";
  const isChatVoiceBusy = isChatVoiceRecording || isChatVoiceTranscribing;

  const activeTurnDetectionMode =
    ctx.costPolicyTurnDetectionMode ?? ctx.turnDetectionMode;
  const activeResponseBudget =
    ctx.costPolicyResponseBudget ?? ctx.responseBudget;
  const isPushToTalkMode = activeTurnDetectionMode === "push-to-talk";

  return {
    hasMedia,
    hasActiveSession,
    hasRealtimeConnection,
    isChatMode,
    isRealtimeMode,
    isChatVoiceRecording,
    isChatVoiceTranscribing,
    isChatVoiceBusy,
    activeTurnDetectionMode,
    activeResponseBudget,
    isPushToTalkMode,
  };
}
