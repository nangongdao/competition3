/**
 * 工作台面板 props 组装纯函数（按领域拆分）。
 *
 * 收敛 `assistant-workspace` 主组件「展示装配区」中内联的 `sessionPanelProps` /
 * `visionColumnProps` 两个分组对象构造。按项目约定「纯逻辑 → lib 纯函数 + 单测，
 * 组件仅做薄编排」，把该 props 组装抽为可单测、可复用的纯函数模块。
 *
 * 本模块在单一 `buildWorkspacePanelProps` 入口之上，按「领域」拆分为多个更小的
 * build 函数（`buildSessionPanelProps` / `buildVisionColumnProps`，以及各自内部的
 * 领域子 builder），每个子 builder 只负责一个领域的分组映射。全部只做纯对象映射
 * （source 值 → props 字段），不触发任何副作用；最终结果仍以 `SessionPanelProps` /
 * `VisionColumnProps` 为编译期约束（`satisfies`，捕获拼写 / 缺参）。
 */

import type {
  AssistantPhase,
  CostControlSetting,
  MediaPermissionStatus,
  RealtimeConnectionStatus,
  TranscriptEntry,
} from "@/modules/assistant/types";
import type { RealtimeResponseMode } from "@/modules/assistant/lib/realtime-protocol";
import type { UsageReport } from "@/modules/assistant/lib/cost-model";
import type { UsageExportBundle } from "@/modules/assistant/lib/usage-export";
import type { UsageTrendSeries } from "@/modules/assistant/lib/usage-trend";
import type { FrameTelemetryStats, SampleRateStats } from "@/modules/assistant/lib/frame-telemetry";
import type { SpatialAnnotation } from "@/modules/assistant/lib/spatial-annotation";
import type { ChatVoiceSendMode } from "@/modules/assistant/lib/workspace-labels";
import type { ProviderMode, VisionCapability } from "../../../../src/worker/routes/provider/types";
import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";
import type { SessionPanelProps } from "@/modules/assistant/components/session/session-panel";
import type { VisionColumnProps } from "@/modules/assistant/components/media/vision-column";

/** 面板可见性开关（layout.panelVisibility）。 */
export type WorkspacePanelVisibility = {
  cost: boolean;
  usage: boolean;
  visualContext: boolean;
};

/** 场景记忆统计（sceneMemoryStats）。 */
export type WorkspaceSceneMemoryStats = {
  count: number;
  savingsTokens: number;
};

/** 多模态融合统计（fusionStats）。 */
export type WorkspaceFusionStats = {
  count: number;
  savedCalls: number;
  imageTokens: number;
};

/** 文本历史摘要统计（textHistoryStats）。 */
export type WorkspaceTextHistoryStats = {
  summarizedEntryCount: number;
  savedTextTokens: number;
};

/** `buildWorkspacePanelProps` 的输入：聚合组件作用域内全部源值（按领域组织）。 */
export type WorkspacePanelPropsInput = {
  // ── 媒体 ──
  hasMedia: boolean;
  mediaStatus: MediaPermissionStatus;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isMicrophoneMuted: boolean;
  onMicrophoneMutedChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  microphoneStatusLabel: string;
  // ── 会话 / 阶段 ──
  assistantPhase: AssistantPhase;
  isChatMode: boolean;
  providerMode: ProviderMode;
  realtimeStatus: RealtimeConnectionStatus;
  hasRealtimeConnection: boolean;
  isProviderConfigLoading: boolean;
  providerDetail: string;
  visionCapability: VisionCapability;
  visibleError?: string;
  // ── 会话启停 / 访问 ──
  onRequestAccess: () => void;
  onStartSession: () => void;
  canUseSessionButton: boolean;
  startSessionLabel: string;
  canStopSession: boolean;
  onStopSession: () => void;
  onReleaseMedia: () => void;
  // ── PTT ──
  isPushToTalkActive: boolean;
  canPushToTalk: boolean;
  pushToTalkLabel: string;
  pushToTalkTitle: string;
  onPushToTalkPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPushToTalkPointerEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPushToTalkKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onPushToTalkKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  // ── 视觉提问 / 手动采样 ──
  canVisualQuestion: boolean;
  onVisualQuestion: () => void;
  onManualFrameCapture: () => void;
  // ── 面板拖拽 ──
  onPanelDragStart: (
    event: React.DragEvent<HTMLElement>,
    panel: "session" | "vision",
  ) => void;
  onPanelDrop: (
    event: React.DragEvent<HTMLElement>,
    panel: "session" | "vision",
  ) => void;
  // ── 布局可见性 ──
  panelVisibility: WorkspacePanelVisibility;
  // ── 成本 / Provider 切换 ──
  costControls: readonly CostControlSetting[];
  canChangeProviderMode: boolean;
  onProviderModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // ── 连续语音 ──
  isContinuousChatVoiceEnabled: boolean;
  canStartContinuousChatVoice: boolean;
  onContinuousChatVoiceClick: () => void;
  isChatVoiceRecording: boolean;
  canToggleChatSpeechInput: boolean;
  onChatSpeechInputClick: () => void;
  isChatVoiceBusy: boolean;
  isChatSending: boolean;
  chatVoiceSendMode: ChatVoiceSendMode;
  onChatVoiceSendModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  chatSpeechStatusLabel: string;
  // ── 回合检测 / 响应预算 / 朗读 ──
  canChangeTurnMode: boolean;
  turnDetectionMode: RealtimeTurnDetectionMode;
  onTurnDetectionModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  canChangeResponseBudget: boolean;
  responseBudget: RealtimeResponseBudget;
  onResponseBudgetChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isChatAnswerSpeechEnabled: boolean;
  isSpeechSynthesisSupported: boolean;
  onChatAnswerSpeechChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isSpeechSpeaking: boolean;
  onCancelChatSpeech: () => void;
  responseMode: RealtimeResponseMode;
  onResponseModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // ── 自动采样 / 帧剪枝 / 文本历史摘要 ──
  isAutoSampling: boolean;
  onAutoSamplingChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  samplingIntervalSeconds: number;
  onSamplingIntervalChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isFramePruningEnabled: boolean;
  onFramePruningChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isTextHistorySummaryEnabled: boolean;
  onTextHistorySummaryChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // ── 用量 ──
  usageReport: UsageReport;
  usageExport: UsageExportBundle;
  /** ③ 会话级用量导出 bundle（D1 持久化用量记录）。 */
  sessionUsageExport?: UsageExportBundle | null;
  /** ② 会话级用量趋势序列（供用量面板渲染趋势图表）。 */
  sessionUsageTrend?: UsageTrendSeries | null;
  /** 会话级成本预算上限（USD）；null 表示未设置。 */
  budgetUsd?: number | null;
  /** 用户确认设置/清除预算时的回调（null 表示清除）。 */
  onBudgetSet?: (usd: number | null) => void;
  skippedAutoFrameCount: number;
  sampleWidth: number;
  sampleHeight: number;
  // ── 转写 / 会话清理 / 导出 ──
  transcript: readonly TranscriptEntry[];
  retryableEntryIds: ReadonlySet<string>;
  isRetryDisabled: boolean;
  onRetry: (entryId: string) => void;
  isClearConfirmationVisible: boolean;
  onRequestClear: () => void;
  onCancelClear: () => void;
  onConfirmClear: () => void;
  onExport: (format: "json" | "md") => void;
  // ── 文本消息 ──
  textDraft: string;
  canSendTextMessage: boolean;
  onTextDraftChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTextMessageSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  // ── 帧统计 / 遥测 ──
  lastFrameDataUrl: string | null;
  sampledFrameCount: number;
  sentFrameCount: number;
  prunedFrameCount: number;
  // ── 视觉上下文 / 场景记忆 / 融合 / 文本历史摘要展示 ──
  spatialAnnotations: readonly SpatialAnnotation[];
  sceneMemoryStats: WorkspaceSceneMemoryStats;
  fusionStats: WorkspaceFusionStats;
  textHistoryStats: WorkspaceTextHistoryStats;
  frameTelemetryStats: FrameTelemetryStats;
  sampleRateStats: SampleRateStats;
};

/** 纯函数组装结果：两个分组 props 对象。 */
export type WorkspacePanelProps = {
  sessionPanelProps: SessionPanelProps;
  visionColumnProps: VisionColumnProps;
};

// ─────────────────────────────────────────────────────────────────────────────
// SessionPanel 领域子 builder
// ─────────────────────────────────────────────────────────────────────────────

/** 媒体 / 会话身份 / Provider 相关字段（SessionPanel）。 */
function buildSessionIdentity(
  input: WorkspacePanelPropsInput,
): Pick<
  SessionPanelProps,
  | "hasMedia"
  | "mediaStatus"
  | "assistantPhase"
  | "isChatMode"
  | "providerMode"
  | "realtimeStatus"
  | "providerDetail"
  | "visibleError"
  | "visionCapability"
  | "isProviderConfigLoading"
> {
  return {
    hasMedia: input.hasMedia,
    mediaStatus: input.mediaStatus,
    assistantPhase: input.assistantPhase,
    isChatMode: input.isChatMode,
    providerMode: input.providerMode,
    realtimeStatus: input.realtimeStatus,
    providerDetail: input.providerDetail,
    visibleError: input.visibleError,
    visionCapability: input.visionCapability,
    isProviderConfigLoading: input.isProviderConfigLoading,
  };
}

/** 会话访问 / 启停相关字段（SessionPanel）。 */
function buildSessionAccess(
  input: WorkspacePanelPropsInput,
): Pick<
  SessionPanelProps,
  | "onRequestAccess"
  | "onStartSession"
  | "canUseSessionButton"
  | "startSessionLabel"
  | "canStopSession"
  | "onStopSession"
  | "onReleaseMedia"
> {
  return {
    onRequestAccess: input.onRequestAccess,
    onStartSession: input.onStartSession,
    canUseSessionButton: input.canUseSessionButton,
    startSessionLabel: input.startSessionLabel,
    canStopSession: input.canStopSession,
    onStopSession: input.onStopSession,
    onReleaseMedia: input.onReleaseMedia,
  };
}

/** PTT / 视觉提问 / 手动采样 / 面板拖拽相关字段（SessionPanel）。 */
function buildSessionPttVisual(
  input: WorkspacePanelPropsInput,
): Pick<
  SessionPanelProps,
  | "isPushToTalkActive"
  | "canPushToTalk"
  | "pushToTalkLabel"
  | "pushToTalkTitle"
  | "onPushToTalkPointerDown"
  | "onPushToTalkPointerEnd"
  | "onPushToTalkKeyDown"
  | "onPushToTalkKeyUp"
  | "canVisualQuestion"
  | "onVisualQuestion"
  | "onManualFrameCapture"
  | "onPanelDragStart"
  | "onPanelDrop"
> {
  return {
    isPushToTalkActive: input.isPushToTalkActive,
    canPushToTalk: input.canPushToTalk,
    pushToTalkLabel: input.pushToTalkLabel,
    pushToTalkTitle: input.pushToTalkTitle,
    onPushToTalkPointerDown: input.onPushToTalkPointerDown,
    onPushToTalkPointerEnd: input.onPushToTalkPointerEnd,
    onPushToTalkKeyDown: input.onPushToTalkKeyDown,
    onPushToTalkKeyUp: input.onPushToTalkKeyUp,
    canVisualQuestion: input.canVisualQuestion,
    onVisualQuestion: input.onVisualQuestion,
    onManualFrameCapture: input.onManualFrameCapture,
    onPanelDragStart: input.onPanelDragStart,
    onPanelDrop: input.onPanelDrop,
  };
}

/** 成本 / Provider 切换 / 连续语音相关字段（SessionPanel）。 */
function buildSessionVoiceControls(
  input: WorkspacePanelPropsInput,
): Pick<
  SessionPanelProps,
  | "costPanelVisible"
  | "costControls"
  | "canChangeProviderMode"
  | "onProviderModeChange"
  | "isContinuousChatVoiceEnabled"
  | "canStartContinuousChatVoice"
  | "onContinuousChatVoiceClick"
  | "isChatVoiceRecording"
  | "canToggleChatSpeechInput"
  | "onChatSpeechInputClick"
  | "isChatVoiceBusy"
  | "isChatSending"
  | "chatVoiceSendMode"
  | "onChatVoiceSendModeChange"
  | "chatSpeechStatusLabel"
> {
  return {
    costPanelVisible: input.panelVisibility.cost,
    costControls: input.costControls,
    canChangeProviderMode: input.canChangeProviderMode,
    onProviderModeChange: input.onProviderModeChange,
    isContinuousChatVoiceEnabled: input.isContinuousChatVoiceEnabled,
    canStartContinuousChatVoice: input.canStartContinuousChatVoice,
    onContinuousChatVoiceClick: input.onContinuousChatVoiceClick,
    isChatVoiceRecording: input.isChatVoiceRecording,
    canToggleChatSpeechInput: input.canToggleChatSpeechInput,
    onChatSpeechInputClick: input.onChatSpeechInputClick,
    isChatVoiceBusy: input.isChatVoiceBusy,
    isChatSending: input.isChatSending,
    chatVoiceSendMode: input.chatVoiceSendMode,
    onChatVoiceSendModeChange: input.onChatVoiceSendModeChange,
    chatSpeechStatusLabel: input.chatSpeechStatusLabel,
  };
}

/** 回合检测 / 响应预算 / 朗读 / 响应模式相关字段（SessionPanel）。 */
function buildSessionResponseControls(
  input: WorkspacePanelPropsInput,
): Pick<
  SessionPanelProps,
  | "canChangeTurnMode"
  | "turnDetectionMode"
  | "onTurnDetectionModeChange"
  | "isMicrophoneMuted"
  | "onMicrophoneMutedChange"
  | "canChangeResponseBudget"
  | "responseBudget"
  | "onResponseBudgetChange"
  | "isChatAnswerSpeechEnabled"
  | "isSpeechSynthesisSupported"
  | "onChatAnswerSpeechChange"
  | "isSpeechSpeaking"
  | "onCancelChatSpeech"
  | "responseMode"
  | "onResponseModeChange"
> {
  return {
    canChangeTurnMode: input.canChangeTurnMode,
    turnDetectionMode: input.turnDetectionMode,
    onTurnDetectionModeChange: input.onTurnDetectionModeChange,
    isMicrophoneMuted: input.isMicrophoneMuted,
    onMicrophoneMutedChange: input.onMicrophoneMutedChange,
    canChangeResponseBudget: input.canChangeResponseBudget,
    responseBudget: input.responseBudget,
    onResponseBudgetChange: input.onResponseBudgetChange,
    isChatAnswerSpeechEnabled: input.isChatAnswerSpeechEnabled,
    isSpeechSynthesisSupported: input.isSpeechSynthesisSupported,
    onChatAnswerSpeechChange: input.onChatAnswerSpeechChange,
    isSpeechSpeaking: input.isSpeechSpeaking,
    onCancelChatSpeech: input.onCancelChatSpeech,
    responseMode: input.responseMode,
    onResponseModeChange: input.onResponseModeChange,
  };
}

/** 自动采样 / 帧剪枝 / 文本历史摘要相关字段（SessionPanel）。 */
function buildSessionSampling(
  input: WorkspacePanelPropsInput,
): Pick<
  SessionPanelProps,
  | "isAutoSampling"
  | "onAutoSamplingChange"
  | "samplingIntervalSeconds"
  | "onSamplingIntervalChange"
  | "isFramePruningEnabled"
  | "onFramePruningChange"
  | "isTextHistorySummaryEnabled"
  | "onTextHistorySummaryChange"
> {
  return {
    isAutoSampling: input.isAutoSampling,
    onAutoSamplingChange: input.onAutoSamplingChange,
    samplingIntervalSeconds: input.samplingIntervalSeconds,
    onSamplingIntervalChange: input.onSamplingIntervalChange,
    isFramePruningEnabled: input.isFramePruningEnabled,
    onFramePruningChange: input.onFramePruningChange,
    isTextHistorySummaryEnabled: input.isTextHistorySummaryEnabled,
    onTextHistorySummaryChange: input.onTextHistorySummaryChange,
  };
}

/** 用量 / 面板可见性相关字段（SessionPanel）。 */
function buildSessionUsage(
  input: WorkspacePanelPropsInput,
): Pick<
  SessionPanelProps,
  | "usageReport"
  | "usageExport"
  | "sessionUsageExport"
  | "sessionUsageTrend"
  | "budgetUsd"
  | "onBudgetSet"
  | "usagePanelVisible"
  | "skippedAutoFrameCount"
  | "sampleWidth"
  | "sampleHeight"
> {
  return {
    usageReport: input.usageReport,
    usageExport: input.usageExport,
    sessionUsageExport: input.sessionUsageExport ?? null,
    sessionUsageTrend: input.sessionUsageTrend ?? null,
    budgetUsd: input.budgetUsd ?? null,
    onBudgetSet: input.onBudgetSet,
    usagePanelVisible: input.panelVisibility.usage,
    skippedAutoFrameCount: input.skippedAutoFrameCount,
    sampleWidth: input.sampleWidth,
    sampleHeight: input.sampleHeight,
  };
}

/** 按领域组装 `SessionPanel` 的分组 props（含 `satisfies` 编译期校验）。 */
export function buildSessionPanelProps(
  input: WorkspacePanelPropsInput,
): SessionPanelProps {
  return {
    ...buildSessionIdentity(input),
    ...buildSessionAccess(input),
    ...buildSessionPttVisual(input),
    ...buildSessionVoiceControls(input),
    ...buildSessionResponseControls(input),
    ...buildSessionSampling(input),
    ...buildSessionUsage(input),
  } satisfies SessionPanelProps;
}

// ─────────────────────────────────────────────────────────────────────────────
// VisionColumn 领域子 builder
// ─────────────────────────────────────────────────────────────────────────────

/** 媒体引用 / 麦克风状态 / 标注 / 面板拖拽相关字段（VisionColumn）。 */
function buildVisionMedia(
  input: WorkspacePanelPropsInput,
): Pick<
  VisionColumnProps,
  | "videoRef"
  | "audioRef"
  | "canvasRef"
  | "hasMedia"
  | "isMicrophoneMuted"
  | "microphoneStatusLabel"
  | "phase"
  | "annotations"
  | "onPanelDragStart"
  | "onPanelDrop"
> {
  return {
    videoRef: input.videoRef,
    audioRef: input.audioRef,
    canvasRef: input.canvasRef,
    hasMedia: input.hasMedia,
    isMicrophoneMuted: input.isMicrophoneMuted,
    microphoneStatusLabel: input.microphoneStatusLabel,
    phase: input.assistantPhase,
    annotations: input.spatialAnnotations,
    onPanelDragStart: input.onPanelDragStart,
    onPanelDrop: input.onPanelDrop,
  };
}

/** 转写 / 重试 / 会话清理 / 导出相关字段（VisionColumn）。 */
function buildVisionTranscript(
  input: WorkspacePanelPropsInput,
): Pick<
  VisionColumnProps,
  | "transcript"
  | "retryableEntryIds"
  | "isRetryDisabled"
  | "onRetry"
  | "isClearConfirmationVisible"
  | "onRequestClear"
  | "onCancelClear"
  | "onConfirmClear"
  | "onExport"
> {
  return {
    transcript: input.transcript,
    retryableEntryIds: input.retryableEntryIds,
    isRetryDisabled: input.isRetryDisabled,
    onRetry: input.onRetry,
    isClearConfirmationVisible: input.isClearConfirmationVisible,
    onRequestClear: input.onRequestClear,
    onCancelClear: input.onCancelClear,
    onConfirmClear: input.onConfirmClear,
    onExport: input.onExport,
  };
}

/** 文本消息 / 发送相关字段（VisionColumn）。 */
function buildVisionMessage(
  input: WorkspacePanelPropsInput,
): Pick<
  VisionColumnProps,
  | "textDraft"
  | "canSendTextMessage"
  | "isChatMode"
  | "hasRealtimeConnection"
  | "isSending"
  | "onTextDraftChange"
  | "onTextMessageSubmit"
> {
  return {
    textDraft: input.textDraft,
    canSendTextMessage: input.canSendTextMessage,
    isChatMode: input.isChatMode,
    hasRealtimeConnection: input.hasRealtimeConnection,
    isSending: input.isChatSending,
    onTextDraftChange: input.onTextDraftChange,
    onTextMessageSubmit: input.onTextMessageSubmit,
  };
}

/** 帧统计 / 采样 / 遥测相关字段（VisionColumn）。 */
function buildVisionFrameStats(
  input: WorkspacePanelPropsInput,
): Pick<
  VisionColumnProps,
  | "lastFrameDataUrl"
  | "sampledFrameCount"
  | "sentFrameCount"
  | "skippedAutoFrameCount"
  | "prunedFrameCount"
  | "isAutoSampling"
  | "samplingIntervalSeconds"
  | "visualContextVisible"
  | "frameTelemetryStats"
  | "sampleRateStats"
  | "sampleWidth"
  | "sampleHeight"
> {
  return {
    lastFrameDataUrl: input.lastFrameDataUrl,
    sampledFrameCount: input.sampledFrameCount,
    sentFrameCount: input.sentFrameCount,
    skippedAutoFrameCount: input.skippedAutoFrameCount,
    prunedFrameCount: input.prunedFrameCount,
    isAutoSampling: input.isAutoSampling,
    samplingIntervalSeconds: input.samplingIntervalSeconds,
    visualContextVisible: input.panelVisibility.visualContext,
    frameTelemetryStats: input.frameTelemetryStats,
    sampleRateStats: input.sampleRateStats,
    sampleWidth: input.sampleWidth,
    sampleHeight: input.sampleHeight,
  };
}

/** 场景记忆 / 融合 / 文本历史摘要展示相关字段（VisionColumn）。 */
function buildVisionContextStats(
  input: WorkspacePanelPropsInput,
): Pick<
  VisionColumnProps,
  | "sceneMemoryCount"
  | "sceneMemorySavingsTokens"
  | "fusionCount"
  | "fusionSavedCalls"
  | "fusionImageTokens"
  | "textHistorySummarizedCount"
  | "textHistorySavedTokens"
> {
  return {
    sceneMemoryCount: input.sceneMemoryStats.count,
    sceneMemorySavingsTokens: input.sceneMemoryStats.savingsTokens,
    fusionCount: input.fusionStats.count,
    fusionSavedCalls: input.fusionStats.savedCalls,
    fusionImageTokens: input.fusionStats.imageTokens,
    textHistorySummarizedCount: input.textHistoryStats.summarizedEntryCount,
    textHistorySavedTokens: input.textHistoryStats.savedTextTokens,
  };
}

/** 按领域组装 `VisionColumn` 的分组 props（含 `satisfies` 编译期校验）。 */
export function buildVisionColumnProps(
  input: WorkspacePanelPropsInput,
): VisionColumnProps {
  return {
    ...buildVisionMedia(input),
    ...buildVisionTranscript(input),
    ...buildVisionMessage(input),
    ...buildVisionFrameStats(input),
    ...buildVisionContextStats(input),
  } satisfies VisionColumnProps;
}

/**
 * 由组件作用域内源值组装 `SessionPanel` / `VisionColumn` 的分组 props。
 *
 * 纯函数：相同输入必得相同输出；字段映射与 `assistant-workspace.tsx` 原内联构造完全一致。
 * 内部按「领域」委派给 `buildSessionPanelProps` / `buildVisionColumnProps`（及各自的
 * 领域子 builder），返回值分别以 `SessionPanelProps` / `VisionColumnProps` 为编译期约束
 * （捕获拼写 / 缺参）。
 */
export function buildWorkspacePanelProps(
  input: WorkspacePanelPropsInput,
): WorkspacePanelProps {
  return {
    sessionPanelProps: buildSessionPanelProps(input),
    visionColumnProps: buildVisionColumnProps(input),
  };
}
