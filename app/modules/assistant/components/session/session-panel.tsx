import { memo } from "react";
import {
  Camera,
  CircleStop,
  GripVertical,
  Hand,
  Image as ImageIcon,
  Play,
  Radio,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { CostControlPanel } from "@/modules/assistant/components/session/cost-control-panel";
import { UsagePanel } from "@/modules/assistant/components/usage/usage-panel";
import {
  mediaLabels,
  phaseLabels,
  providerModeLabels,
  realtimeLabels,
  visionCapabilityBadgeLevels,
  visionCapabilityDetailLabels,
  visionCapabilityLabels,
  type ChatVoiceSendMode,
} from "@/modules/assistant/lib/workspace-labels";
import type {
  AssistantPhase,
  CostControlSetting,
  MediaPermissionStatus,
} from "@/modules/assistant/types";
import type { RealtimeResponseMode } from "@/modules/assistant/lib/realtime-protocol";
import type { UsageReport } from "@/modules/assistant/lib/cost-model";
import type { UsageTrendSeries } from "@/modules/assistant/lib/usage-trend";
import type { RealtimeConnectionStatus } from "@/modules/assistant/types";
import type { ProviderMode, VisionCapability } from "../../../../../src/worker/routes/provider/types";
import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../../src/worker/routes/realtime/types";

type UsageExport = {
  jsonDownloadUrl: string;
  csvDownloadUrl: string;
  jsonFilename: string;
  csvFilename: string;
};

/** Linear/Modern 主控按钮：玻璃表面 + 多层阴影 + expo hover/active。 */
const CONTROL_BTN =
  "inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-[9px] rounded-[var(--radius-md)] border border-white/10 bg-white/[0.05] px-3.5 text-sm font-[600] text-[color:var(--color-foreground)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-[background,border-color,box-shadow,transform] duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] enabled:hover:border-white/20 enabled:hover:bg-white/[0.09] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-2";

/** Linear/Modern 主按钮（靛蓝实底 + 环境光 glow）。 */
const CONTROL_BTN_PRIMARY =
  "inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-[9px] rounded-[var(--radius-md)] border-0 bg-[color:var(--color-primary)] px-3.5 text-sm font-[600] text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2)] transition-[background,box-shadow,transform] duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] enabled:hover:bg-[#6872d9] enabled:hover:shadow-[0_0_0_1px_rgba(94,106,210,0.6),0_6px_16px_rgba(94,106,210,0.35),inset_0_1px_0_0_rgba(255,255,255,0.25)] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-2";

/** Linear/Modern 危险按钮。 */
const CONTROL_BTN_DANGER =
  "inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-[9px] rounded-[var(--radius-md)] border-0 bg-[color:var(--color-destructive)] px-3.5 text-sm font-[600] text-white shadow-[0_4px_12px_rgba(239,109,109,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2)] transition-[background,box-shadow,transform] duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] enabled:hover:bg-[#d9534f] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-2";

/** Linear/Modern 全宽次按钮（关闭设备）。 */
const CONTROL_BTN_WIDE =
  "inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-[9px] rounded-[var(--radius-md)] border border-white/10 bg-white/[0.05] px-3.5 text-sm font-[600] text-[color:var(--color-foreground)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-[background,border-color,box-shadow,transform] duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] enabled:hover:border-white/20 enabled:hover:bg-white/[0.09] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-ring)] focus-visible:outline-offset-2";

export type SessionPanelProps = {
  hasMedia: boolean;
  assistantPhase: AssistantPhase;
  mediaStatus: MediaPermissionStatus;
  isChatMode: boolean;
  providerMode: ProviderMode;
  realtimeStatus: RealtimeConnectionStatus;
  providerDetail: string;
  visibleError?: string;
  visionCapability: VisionCapability;
  isProviderConfigLoading: boolean;
  onRequestAccess: () => void;
  onStartSession: () => void;
  canUseSessionButton: boolean;
  startSessionLabel: string;
  isPushToTalkActive: boolean;
  canPushToTalk: boolean;
  pushToTalkLabel: string;
  pushToTalkTitle: string;
  onPushToTalkPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPushToTalkPointerEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPushToTalkKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onPushToTalkKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  canVisualQuestion: boolean;
  onVisualQuestion: () => void;
  onManualFrameCapture: () => void;
  canStopSession: boolean;
  onStopSession: () => void;
  onReleaseMedia: () => void;
  onPanelDragStart: (event: React.DragEvent<HTMLElement>, panel: "session" | "vision") => void;
  onPanelDrop: (event: React.DragEvent<HTMLElement>, panel: "session" | "vision") => void;
  costPanelVisible: boolean;
  costControls: readonly CostControlSetting[];
  canChangeProviderMode: boolean;
  onProviderModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
  canChangeTurnMode: boolean;
  turnDetectionMode: RealtimeTurnDetectionMode;
  onTurnDetectionModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isMicrophoneMuted: boolean;
  onMicrophoneMutedChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
  isAutoSampling: boolean;
  onAutoSamplingChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  samplingIntervalSeconds: number;
  onSamplingIntervalChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isFramePruningEnabled: boolean;
  onFramePruningChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isTextHistorySummaryEnabled: boolean;
  onTextHistorySummaryChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  usageReport: UsageReport;
  usageExport: UsageExport;
  /** ③ 会话级用量导出 bundle（D1 持久化用量记录）；null 表示未加载。 */
  sessionUsageExport: UsageExport | null;
  /** ② 会话级用量趋势序列（供用量面板渲染趋势图表）；null 表示无记录。 */
  sessionUsageTrend?: UsageTrendSeries | null;
  /** 会话级成本预算上限（USD）；null 表示未设置。 */
  budgetUsd?: number | null;
  /** 用户确认设置/清除预算时的回调（null 表示清除）。 */
  onBudgetSet?: (usd: number | null) => void;
  usagePanelVisible: boolean;
  /** 已自动跳过的帧数（用于成本节省展示）。 */
  skippedAutoFrameCount: number;
  /** 采样帧宽度（像素）。 */
  sampleWidth: number;
  /** 采样帧高度（像素）。 */
  sampleHeight: number;
};

export const SessionPanel = memo(function SessionPanel({
  hasMedia,
  assistantPhase,
  mediaStatus,
  isChatMode,
  providerMode,
  realtimeStatus,
  providerDetail,
  visibleError,
  visionCapability,
  isProviderConfigLoading,
  onRequestAccess,
  onStartSession,
  canUseSessionButton,
  startSessionLabel,
  isPushToTalkActive,
  canPushToTalk,
  pushToTalkLabel,
  pushToTalkTitle,
  onPushToTalkPointerDown,
  onPushToTalkPointerEnd,
  onPushToTalkKeyDown,
  onPushToTalkKeyUp,
  canVisualQuestion,
  onVisualQuestion,
  onManualFrameCapture,
  canStopSession,
  onStopSession,
  onReleaseMedia,
  onPanelDragStart,
  onPanelDrop,
  costPanelVisible,
  costControls,
  canChangeProviderMode,
  onProviderModeChange,
  isContinuousChatVoiceEnabled,
  canStartContinuousChatVoice,
  onContinuousChatVoiceClick,
  isChatVoiceRecording,
  canToggleChatSpeechInput,
  onChatSpeechInputClick,
  isChatVoiceBusy,
  isChatSending,
  chatVoiceSendMode,
  onChatVoiceSendModeChange,
  chatSpeechStatusLabel,
  canChangeTurnMode,
  turnDetectionMode,
  onTurnDetectionModeChange,
  isMicrophoneMuted,
  onMicrophoneMutedChange,
  canChangeResponseBudget,
  responseBudget,
  onResponseBudgetChange,
  isChatAnswerSpeechEnabled,
  isSpeechSynthesisSupported,
  onChatAnswerSpeechChange,
  isSpeechSpeaking,
  onCancelChatSpeech,
  responseMode,
  onResponseModeChange,
  isAutoSampling,
  onAutoSamplingChange,
  samplingIntervalSeconds,
  onSamplingIntervalChange,
  isFramePruningEnabled,
  onFramePruningChange,
  isTextHistorySummaryEnabled,
  onTextHistorySummaryChange,
  usageReport,
  usageExport,
  sessionUsageExport,
  sessionUsageTrend,
  budgetUsd,
  onBudgetSet,
  usagePanelVisible,
  skippedAutoFrameCount,
  sampleWidth,
  sampleHeight,
}: SessionPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <section
      className="row-start-2 flex flex-col gap-[22px] border-r border-panel-border bg-panel-bg px-[clamp(18px,3vw,38px)] max-[480px]:px-3.5 max-[768px]:border-b max-[768px]:border-r-0"
      aria-labelledby="assistant-title"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onPanelDrop(event, "session")}
    >
      <div
        className="inline-flex cursor-grab select-none items-center gap-[5px] self-start text-[0.72rem] font-[600] text-muted-foreground [-moz-user-select:none] [-webkit-user-select:none] max-[768px]:hidden"
        draggable
        aria-hidden="true"
        onDragStart={(event) => onPanelDragStart(event, "session")}
      >
        <GripVertical size={17} />
        {t("session.dragHandle")}
      </div>
      <div className="flex items-center gap-4 max-[480px]:grid max-[480px]:grid-cols-1 max-[480px]:items-stretch">
        <div
          className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-xl bg-[color:var(--color-primary)] text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_16px_rgba(94,106,210,0.35),inset_0_1px_0_0_rgba(255,255,255,0.25)]"
          aria-hidden="true"
        >
          <Radio size={25} strokeWidth={2} />
        </div>
        <div>
          <p className="m-0 text-[0.72rem] font-[600] uppercase tracking-[0.14em] text-muted-foreground">{t("session.title")}</p>
          <h1 id="assistant-title" className="m-0 text-[3.1rem] font-[600] leading-[0.95] tracking-tight text-foreground max-[480px]:text-[2.4rem]">{t("session.subtitle")}</h1>
        </div>
      </div>

      <div
        className="grid grid-cols-[112px_1fr] items-center gap-[18px] rounded-2xl border border-white/[0.06] bg-white/[0.03] p-[18px] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] max-[480px]:grid-cols-1 max-[480px]:items-stretch"
        aria-label={t("session.statusOverview")}
      >
        <div className="grid h-[112px] w-[112px] place-items-center rounded-full p-3.5 text-center text-foreground max-[480px]:h-24 max-[480px]:w-24" data-state-ring data-phase={assistantPhase}>
          <span className="max-w-[74px] text-[0.92rem] font-[600] leading-[1.15]">{t(phaseLabels[assistantPhase])}</span>
        </div>
        <div className="min-w-0 [&>p:not(:first-child)]:mt-3.5">
          <p className="m-0 text-[0.72rem] font-[600] uppercase tracking-[0.14em] text-muted-foreground">{t("session.media")}</p>
          <strong className="my-2 block text-[1.4rem] leading-[1.1] text-foreground">{t(mediaLabels[mediaStatus])}</strong>
          <span className="text-[0.95rem] leading-[1.45] text-muted">{hasMedia ? t("session.mediaReady") : t("session.mediaWaiting")}</span>
          <p className="m-0 text-[0.72rem] font-[600] uppercase tracking-[0.14em] text-muted-foreground">{t("session.connection")}</p>
          <strong className="my-2 block text-[1.4rem] leading-[1.1] text-foreground">
            {isChatMode
              ? t(providerModeLabels[providerMode])
              : t(realtimeLabels[realtimeStatus])}
          </strong>
          <span className="text-[0.95rem] leading-[1.45] text-muted">{providerDetail}</span>
        </div>
      </div>

      {visibleError ? (
        <p className="m-0 rounded-lg border border-[color:var(--color-danger-soft-border)] bg-[color:var(--color-error-soft-bg)] px-3.5 py-3 text-sm leading-[1.5] text-[color:var(--color-danger-text)]" role="alert">
          {visibleError}
        </p>
      ) : null}

      {!isProviderConfigLoading ? (
        <div
          className="flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-[13px] leading-[1.5]"
          data-vision-capability={visionCapability}
          data-badge-level={visionCapabilityBadgeLevels[visionCapability]}
          aria-label={t("visionNotice.capability")}
        >
          <span className="font-[800]">{t(visionCapabilityLabels[visionCapability])}</span>
          <span className="text-muted">{t(visionCapabilityDetailLabels[visionCapability])}</span>
        </div>
      ) : null}

      {isChatMode && visionCapability === "none" && !isProviderConfigLoading ? (
        <p
          className="m-0 rounded-md border border-warn-border bg-warn-bg px-3.5 py-3 text-[13px] leading-[1.5] text-warn-fg"
          role="note"
        >
          {t("visionNotice.unavailable")}
          {t("visionNotice.suggestion")}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1" aria-label={t("session.mainControls")}>
        <button
          className={CONTROL_BTN_PRIMARY}
          type="button"
          onClick={onRequestAccess}
          disabled={mediaStatus === "requesting"}
        >
          <Camera size={18} aria-hidden="true" />
          <span>{hasMedia ? t("session.reauthorize") : t("session.authorize")}</span>
        </button>

        <button
          className={CONTROL_BTN}
          type="button"
          onClick={onStartSession}
          disabled={!canUseSessionButton}
        >
          <Play size={18} aria-hidden="true" />
          <span>{startSessionLabel}</span>
        </button>

        <button
          className={CONTROL_BTN_PRIMARY}
          type="button"
          data-active={isPushToTalkActive ? "true" : "false"}
          onPointerDown={onPushToTalkPointerDown}
          onPointerUp={onPushToTalkPointerEnd}
          onPointerCancel={onPushToTalkPointerEnd}
          onKeyDown={onPushToTalkKeyDown}
          onKeyUp={onPushToTalkKeyUp}
          disabled={!canPushToTalk}
          title={pushToTalkTitle}
          aria-pressed={isPushToTalkActive}
        >
          <Hand size={18} aria-hidden="true" />
          <span>{pushToTalkLabel}</span>
        </button>

        <button
          className={CONTROL_BTN}
          type="button"
          onClick={onVisualQuestion}
          disabled={!canVisualQuestion}
        >
          <Sparkles size={18} aria-hidden="true" />
          <span>{t("session.askWithVision")}</span>
        </button>

        <button
          className={CONTROL_BTN}
          type="button"
          onClick={onManualFrameCapture}
          disabled={!hasMedia}
        >
          <ImageIcon size={18} aria-hidden="true" />
          <span>{t("session.sampleFrame")}</span>
        </button>

        <button
          className={CONTROL_BTN_DANGER}
          type="button"
          onClick={onStopSession}
          disabled={!canStopSession}
        >
          <CircleStop size={18} aria-hidden="true" />
          <span>{t("session.stopSession")}</span>
        </button>
      </div>

      <button
        className={CONTROL_BTN_WIDE}
        type="button"
        onClick={onReleaseMedia}
        disabled={!hasMedia}
      >
        <RefreshCcw size={17} aria-hidden="true" />
        {t("session.closeDevice")}
      </button>

      <CostControlPanel
        isVisible={costPanelVisible}
        costControls={costControls}
        providerMode={providerMode}
        isChatMode={isChatMode}
        canChangeProviderMode={canChangeProviderMode}
        onProviderModeChange={onProviderModeChange}
        isContinuousChatVoiceEnabled={isContinuousChatVoiceEnabled}
        canStartContinuousChatVoice={canStartContinuousChatVoice}
        onContinuousChatVoiceClick={onContinuousChatVoiceClick}
        isChatVoiceRecording={isChatVoiceRecording}
        canToggleChatSpeechInput={canToggleChatSpeechInput}
        onChatSpeechInputClick={onChatSpeechInputClick}
        isChatVoiceBusy={isChatVoiceBusy}
        isChatSending={isChatSending}
        chatVoiceSendMode={chatVoiceSendMode}
        onChatVoiceSendModeChange={onChatVoiceSendModeChange}
        chatSpeechStatusLabel={chatSpeechStatusLabel}
        canChangeTurnMode={canChangeTurnMode}
        turnDetectionMode={turnDetectionMode}
        onTurnDetectionModeChange={onTurnDetectionModeChange}
        isMicrophoneMuted={isMicrophoneMuted}
        hasMedia={hasMedia}
        onMicrophoneMutedChange={onMicrophoneMutedChange}
        canChangeResponseBudget={canChangeResponseBudget}
        responseBudget={responseBudget}
        onResponseBudgetChange={onResponseBudgetChange}
        isChatAnswerSpeechEnabled={isChatAnswerSpeechEnabled}
        isSpeechSynthesisSupported={isSpeechSynthesisSupported}
        onChatAnswerSpeechChange={onChatAnswerSpeechChange}
        isSpeechSpeaking={isSpeechSpeaking}
        onCancelChatSpeech={onCancelChatSpeech}
        responseMode={responseMode}
        onResponseModeChange={onResponseModeChange}
        isAutoSampling={isAutoSampling}
        onAutoSamplingChange={onAutoSamplingChange}
        samplingIntervalSeconds={samplingIntervalSeconds}
        onSamplingIntervalChange={onSamplingIntervalChange}
        isFramePruningEnabled={isFramePruningEnabled}
        onFramePruningChange={onFramePruningChange}
        isTextHistorySummaryEnabled={isTextHistorySummaryEnabled}
        onTextHistorySummaryChange={onTextHistorySummaryChange}
      />

      <UsagePanel
        usageReport={usageReport}
        usageExport={usageExport}
        sessionUsageExport={sessionUsageExport}
        sessionUsageTrend={sessionUsageTrend}
        budgetUsd={budgetUsd}
        onBudgetSet={onBudgetSet}
        isVisible={usagePanelVisible}
        skippedAutoFrameCount={skippedAutoFrameCount}
        sampleWidth={sampleWidth}
        sampleHeight={sampleHeight}
        isChatMode={isChatMode}
      />
    </section>
  );
});
