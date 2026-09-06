import type { RealtimeConnectionStatus } from "@/modules/assistant/types";
import {
  providerModeLabels,
  responseBudgetLabels,
  responseModeLabels,
  turnDetectionLabels,
  visualContextModeLabels,
  type ChatVoiceSendMode,
} from "@/modules/assistant/lib/workspace-labels";
import { formatTokens } from "@/modules/assistant/lib/cost-model";
import { FRAME_DIFF_SEND_THRESHOLD } from "@/modules/assistant/lib/frame-diff";
import {
  REALTIME_IDLE_DISCONNECT_MS,
  REALTIME_IDLE_WARNING_MS,
} from "@/modules/assistant/lib/realtime-protocol";
import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";
import type { RealtimeResponseMode } from "@/modules/assistant/lib/realtime-protocol";
import type { ProviderMode } from "../../../../src/worker/routes/provider/types";

/**
 * 工作台状态标签的派生决策（纯函数）。
 *
 * `assistant-workspace.tsx` 中有 6 个条件状态标签（麦克风状态、语音输入状态、
 * 供应商详情、启动按钮、PTT 按钮文案/提示）此前全部内联在组件里，不可测。
 * 与 `resolveWorkspaceGating` 同理，这些决策不依赖 React 生命周期，因此沉淀为
 * 可单测的纯函数：每次渲染由组件收集一个扁平上下文快照，交给
 * `resolveWorkspaceStatusLabels` 一次性算出全部标签（翻译 key + 插值参数，
 * 或当存在动态错误文案时直接返回最终文本）。
 *
 * 同时提供 `resolveCostControlItems` 收敛成本面板的 10 行派生标签（label/value/detail），
 * 组件仅负责把返回的 `LocalizedText` 交给 `t()` 渲染，不做任何分支判断。
 */

/**
 * 一段可渲染文本：
 * - `{ key; options? }`：i18n key（可带插值参数）；
 * - `{ text }`：已解析的动态文本（错误文案、格式化数值等）；
 * - `{ segments }`：多个片段拼接（如「预算标签 / token 数」）。
 */
export type LocalizedText =
  | { key: string; options?: Record<string, string | number> }
  | { text: string }
  | { segments: readonly LocalizedText[] };

/** 渲染辅助：组件用它把 `LocalizedText` 交给 i18n 引擎。 */
export function renderLocalizedText(
  t: (key: string, options?: Record<string, string | number>) => string,
  label: LocalizedText,
): string {
  if ("segments" in label) {
    return label.segments.map((segment) => renderLocalizedText(t, segment)).join("");
  }
  if ("text" in label) {
    return label.text;
  }
  return t(label.key, label.options);
}

export type WorkspaceStatusContext = {
  hasMedia: boolean;
  isChatMode: boolean;
  isContinuousChatVoiceEnabled: boolean;
  isChatVoiceRecording: boolean;
  isChatVoiceTranscribing: boolean;
  isChatSending: boolean;
  isSpeaking: boolean;
  transcriptionIsRecordingSupported: boolean;
  /** 语音转写 hook 的 status 字段（error / idle / recording / transcribing 等）。 */
  transcriptionStatus: string;
  /** 转写 hook 的错误文案（status 为 error 时展示，否则为 null）。 */
  transcriptionErrorMessage: string | null;
  chatVoiceSendMode: ChatVoiceSendMode;
  isMicrophoneMuted: boolean;
  isPushToTalkMode: boolean;
  isPushToTalkActive: boolean;
  hasRealtimeConnection: boolean;
  /** Realtime peerConnection 状态；未创建连接时为 null。 */
  peerConnectionState: string | null;
  realtimeStatus: RealtimeConnectionStatus;
};

export type WorkspaceStatusLabels = {
  microphoneStatus: LocalizedText;
  chatSpeechStatus: LocalizedText;
  providerDetail: LocalizedText;
  startSessionLabel: LocalizedText;
  pushToTalkLabel: LocalizedText;
  pushToTalkTitle: LocalizedText;
};

/**
 * 一次性计算工作台全部状态标签。
 * 输入为扁平上下文快照，输出全部标签的翻译 key（含插值）或动态文本。
 */
export function resolveWorkspaceStatusLabels(
  ctx: WorkspaceStatusContext,
): WorkspaceStatusLabels {
  return {
    microphoneStatus: resolveMicrophoneStatus(ctx),
    chatSpeechStatus: resolveChatSpeechStatus(ctx),
    providerDetail: resolveProviderDetail(ctx),
    startSessionLabel: resolveStartSessionLabel(ctx),
    pushToTalkLabel: resolvePushToTalkLabel(ctx),
    pushToTalkTitle: ctx.isChatMode
      ? { key: "status.pttRealtimeHint" }
      : { key: "status.pttHoldHint" },
  };
}

function resolveMicrophoneStatus(
  ctx: WorkspaceStatusContext,
): LocalizedText {
  if (!ctx.hasMedia) {
    return { key: "status.micWaiting" };
  }

  if (ctx.isChatMode) {
    if (ctx.isContinuousChatVoiceEnabled) {
      if (ctx.isChatVoiceRecording) {
        return { key: "status.chatListening" };
      }
      if (ctx.isChatVoiceTranscribing) {
        return { key: "status.transcribing" };
      }
      if (ctx.isChatSending) {
        return { key: "status.waitingReply" };
      }
      if (ctx.isSpeaking) {
        return { key: "status.speaking" };
      }
      return { key: "status.continuousStandby" };
    }

    if (ctx.isChatVoiceRecording) {
      return { key: "status.recording" };
    }
    if (ctx.isChatVoiceTranscribing) {
      return { key: "status.transcribing" };
    }
    if (ctx.transcriptionIsRecordingSupported) {
      return { key: "status.canVoiceAsk" };
    }
    return { key: "status.noRecording" };
  }

  if (ctx.isMicrophoneMuted) {
    return { key: "status.micMuted" };
  }

  if (ctx.isPushToTalkMode) {
    return ctx.isPushToTalkActive
      ? { key: "status.speakingNow" }
      : { key: "status.pushToTalk" };
  }

  return { key: "status.micOn" };
}

function resolveChatSpeechStatus(
  ctx: WorkspaceStatusContext,
): LocalizedText {
  if (!ctx.transcriptionIsRecordingSupported) {
    return { key: "status.chatSpeechUnsupported" };
  }

  if (!ctx.hasMedia) {
    return { key: "status.chatSpeechNeedAccess" };
  }

  if (ctx.isContinuousChatVoiceEnabled) {
    if (ctx.isChatVoiceRecording) {
      return { key: "status.continuousListening" };
    }
    if (ctx.isChatVoiceTranscribing) {
      return { key: "status.continuousTranscribing" };
    }
    if (ctx.isChatSending) {
      return { key: "status.continuousWaiting" };
    }
    if (ctx.isSpeaking) {
      return { key: "status.continuousSpeaking" };
    }
    return { key: "status.continuousOn" };
  }

  if (ctx.isChatVoiceRecording) {
    return { key: "status.recordingStop" };
  }
  if (ctx.isChatVoiceTranscribing) {
    return { key: "status.workerTranscribing" };
  }
  if (ctx.transcriptionStatus === "error") {
    // 错误时优先展示上游返回的原始文案，否则用通用错误提示。
    return ctx.transcriptionErrorMessage !== null
      ? { text: ctx.transcriptionErrorMessage }
      : { key: "status.speechError" };
  }

  return ctx.chatVoiceSendMode === "auto-send"
    ? { key: "status.autoSendVoice" }
    : { key: "status.reviewVoice" };
}

function resolveProviderDetail(ctx: WorkspaceStatusContext): LocalizedText {
  if (ctx.isChatMode) {
    if (ctx.isContinuousChatVoiceEnabled) {
      return { key: "status.providerContinuousOn" };
    }
    if (ctx.isChatVoiceTranscribing) {
      return { key: "status.providerTranscribing" };
    }
    if (ctx.isChatSending) {
      return { key: "status.providerSending" };
    }
    return { key: "status.providerChat" };
  }

  if (ctx.hasRealtimeConnection) {
    return { key: "status.providerRealtimeConnected" };
  }
  if (ctx.peerConnectionState === null) {
    return { key: "status.providerWaitingCreate" };
  }
  return {
    key: "status.providerConnecting",
    options: { state: ctx.peerConnectionState },
  };
}

function resolveStartSessionLabel(
  ctx: WorkspaceStatusContext,
): LocalizedText {
  const realtimeBusy =
    ctx.realtimeStatus === "creating-session" ||
    ctx.realtimeStatus === "connecting";

  if (realtimeBusy) {
    return { key: "status.connecting" };
  }
  if (ctx.isChatMode) {
    return { key: "status.directAsk" };
  }
  return { key: "status.startSession" };
}

function resolvePushToTalkLabel(ctx: WorkspaceStatusContext): LocalizedText {
  if (ctx.isChatMode) {
    return { key: "status.realtimeOnly" };
  }
  if (ctx.isPushToTalkActive) {
    return { key: "status.releaseSubmit" };
  }
  return { key: "status.pushToTalk" };
}

// ---------------------------------------------------------------------------
// 成本面板派生标签
// ---------------------------------------------------------------------------

/** 成本面板中某项的 label/value/detail，均为可本地化文本。 */
export type CostControlItem = {
  label: LocalizedText;
  value: LocalizedText;
  detail: LocalizedText;
};

/** Realtime 成本策略中与 UI 展示相关的字段子集。 */
export type CostPolicyView = {
  visualContextMode: "manual" | "interval";
  maxSessionSeconds: number;
  maxResponseOutputTokens: number;
};

export type CostControlContext = {
  providerMode: ProviderMode;
  isChatMode: boolean;
  isAutoSampling: boolean;
  costPolicy: CostPolicyView | null;
  activeResponseBudget: RealtimeResponseBudget;
  responseMode: RealtimeResponseMode;
  isContinuousChatVoiceEnabled: boolean;
  isChatAnswerSpeechEnabled: boolean;
  transcriptionIsRecordingSupported: boolean;
  activeTurnDetectionMode: RealtimeTurnDetectionMode;
  /** 已收敛的麦克风状态标签（复用 `resolveWorkspaceStatusLabels`）。 */
  microphoneStatus: LocalizedText;
  isMicrophoneMuted: boolean;
};

/**
 * 一次性计算成本面板全部派生标签（label / value / detail）。
 * 输入为扁平上下文快照，输出各字段的翻译 key（含插值）或动态文本，
 * 由组件通过 `renderLocalizedText` 渲染为最终文案。
 */
export function resolveCostControlItems(
  ctx: CostControlContext,
): readonly CostControlItem[] {
  const activeVisualMode =
    ctx.costPolicy?.visualContextMode ??
    (ctx.isAutoSampling ? "interval" : "manual");
  const sessionMinutes = ctx.costPolicy
    ? Math.round(ctx.costPolicy.maxSessionSeconds / 60)
    : 10;

  return [
    {
      label: { key: "status.costProviderLabel" },
      value: { key: providerModeLabels[ctx.providerMode] },
      detail: ctx.isChatMode
        ? { key: "status.costProviderChatDetail" }
        : { key: "status.costProviderRealtimeDetail" },
    },
    {
      label: { key: "status.costVisionLabel" },
      value: ctx.isChatMode
        ? { key: "status.costVisionChatValue" }
        : { key: visualContextModeLabels[activeVisualMode] },
      detail: ctx.isChatMode
        ? { key: "status.costVisionChatDetail" }
        : { key: "status.costVisionIntervalDetail" },
    },
    {
      label: { key: "status.costSessionLabel" },
      value: ctx.isChatMode
        ? { key: "status.costSessionChatValue" }
        : { key: "status.costSessionMinutes", options: { count: sessionMinutes } },
      detail: ctx.isChatMode
        ? { key: "status.costSessionChatDetail" }
        : { key: "status.costSessionDetail" },
    },
    {
      label: { key: "status.costIdleLabel" },
      value: {
        key: "status.costIdleSeconds",
        options: { count: Math.round(REALTIME_IDLE_DISCONNECT_MS / 1000) },
      },
      detail: {
        key: "status.costIdleDetail",
        options: { count: Math.round(REALTIME_IDLE_WARNING_MS / 1000) },
      },
    },
    {
      label: { key: "status.costBudgetLabel" },
      value: ctx.costPolicy
        ? {
            segments: [
              { key: responseBudgetLabels[ctx.activeResponseBudget] },
              { text: " / " },
              { text: formatTokens(ctx.costPolicy.maxResponseOutputTokens) },
            ],
          }
        : { key: responseBudgetLabels[ctx.activeResponseBudget] },
      detail: { key: "status.costBudgetDetail" },
    },
    {
      label: { key: "status.costModeLabel" },
      value: ctx.isChatMode
        ? ctx.isContinuousChatVoiceEnabled
          ? { key: "status.costModeChatContinuous" }
          : ctx.isChatAnswerSpeechEnabled
            ? { key: "status.costModeChatLocalSpeak" }
            : { key: "status.costModeChatText" }
        : { key: responseModeLabels[ctx.responseMode] },
      detail: ctx.isChatMode
        ? { key: "status.costModeChatDetail" }
        : ctx.responseMode === "text-only"
          ? { key: "status.costModeTextOnlyDetail" }
          : { key: "status.costModeBothDetail" },
    },
    {
      label: { key: "status.costKeyLabel" },
      value: { key: "status.costKeyValue" },
      detail: { key: "status.costKeyDetail" },
    },
    {
      label: { key: "status.costTurnLabel" },
      value: ctx.isChatMode
        ? ctx.isContinuousChatVoiceEnabled
          ? { key: "status.costTurnContinuousWorker" }
          : ctx.transcriptionIsRecordingSupported
            ? { key: "status.costTurnWorker" }
            : { key: "status.costTurnKeyboard" }
        : { key: turnDetectionLabels[ctx.activeTurnDetectionMode] },
      detail: ctx.isChatMode
        ? { key: "status.costTurnChatDetail" }
        : ctx.activeTurnDetectionMode === "push-to-talk"
          ? { key: "status.costTurnPttDetail" }
          : { key: "status.costTurnVadDetail" },
    },
    {
      label: { key: "status.costMicLabel" },
      value: ctx.microphoneStatus,
      detail: ctx.isChatMode
        ? { key: "status.costMicChatDetail" }
        : ctx.isMicrophoneMuted
          ? { key: "status.costMicMutedDetail" }
          : { key: "status.costMicRealtimeDetail" },
    },
    {
      label: { key: "status.costFrameLabel" },
      value: {
        text: `${Math.round(FRAME_DIFF_SEND_THRESHOLD * 100)}%`,
      },
      detail: { key: "status.costFrameDetail" },
    },
  ] as const;
}
