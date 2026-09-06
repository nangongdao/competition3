import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { persistLanguage, type AppLanguage } from "@/i18n";
import type { CommandAction } from "@/modules/assistant/lib/command-registry";

import { useChatCompletion } from "@/modules/assistant/hooks/use-chat-completion";
import { useAutoFrameSampling } from "@/modules/assistant/hooks/use-auto-frame-sampling";
import { useContinuousChatVad } from "@/modules/assistant/hooks/use-continuous-chat-vad";
import { useContinuousChatVoice } from "@/modules/assistant/hooks/use-continuous-chat-voice";
import { useSendChatTurn } from "@/modules/assistant/hooks/use-send-chat-turn";
import { useMessageSend } from "@/modules/assistant/hooks/use-message-send";
import { useConversationActions } from "@/modules/assistant/hooks/use-conversation-actions";
import { usePushToTalkEvents } from "@/modules/assistant/hooks/use-push-to-talk-events";
import { useSessionStart } from "@/modules/assistant/hooks/use-session-start";
import { useMediaAccess } from "@/modules/assistant/hooks/use-media-access";
import { useWorkspaceControls } from "@/modules/assistant/hooks/use-workspace-controls";
import { useWorkspaceControlsState } from "@/modules/assistant/hooks/use-workspace-controls-state";
import { useWorkspaceActions } from "@/modules/assistant/hooks/use-workspace-actions";
import { useBrowserSpeechAdapter } from "@/modules/assistant/hooks/use-browser-speech-adapter";
import { useMediaCapture } from "@/modules/assistant/hooks/use-media-capture";
import { useMediaPhaseSync } from "@/modules/assistant/hooks/use-media-phase-sync";
import { useMediaStreamBinding } from "@/modules/assistant/hooks/use-media-stream-binding";
import { useSpeechTranscript } from "@/modules/assistant/hooks/use-speech-transcript";
import { useFrameCapture } from "@/modules/assistant/hooks/use-frame-capture";
import { useSessionRestore } from "@/modules/assistant/hooks/use-session-restore";
import { useAssistantStats } from "@/modules/assistant/hooks/use-assistant-stats";
import { useProviderConfig } from "@/modules/assistant/hooks/use-provider-config";
import { useSessions } from "@/modules/assistant/hooks/use-sessions";
import { useSessionManagement } from "@/modules/assistant/hooks/use-session-management";
import { useAssistantSession } from "@/modules/assistant/hooks/use-assistant-session";
import { useWorkerSpeechTranscription } from "@/modules/assistant/hooks/use-worker-speech-transcription";
import { useChatUsageCollector } from "@/modules/assistant/hooks/use-chat-usage-collector";
import { useGlobalUsage } from "@/modules/assistant/hooks/use-global-usage";
import { useGlobalBudget } from "@/modules/assistant/hooks/use-global-budget";
import { useCalibration } from "@/modules/assistant/hooks/use-calibration";
import { useCalibrationWriteback } from "@/modules/assistant/hooks/use-calibration-writeback";
import { useCalibratedCost } from "@/modules/assistant/hooks/use-calibrated-cost";
import { useCostAlertNotifications } from "@/modules/assistant/hooks/use-cost-alert-notifications";
import { CostAlertCenter } from "@/modules/assistant/components/usage/cost-alert-center";
import {
  GlobalShortcutHost,
  type GlobalShortcutHostHandle,
} from "@/modules/assistant/components/global-shortcut-host";
import { useWorkspaceLayout } from "@/modules/assistant/hooks/use-workspace-layout";
import { useWorkspacePanelInteraction } from "@/modules/assistant/hooks/use-workspace-panel-interaction";
import { useTheme } from "@/modules/assistant/hooks/use-theme";
import { isTauriRuntime } from "@/modules/assistant/hooks/use-tauri";
import { DesktopWindowControls } from "@/modules/assistant/components/desktop-window-controls";
import { TerminalPanel } from "@/modules/assistant/components/terminal/terminal-panel";
import { WorkspaceLayoutToolbar } from "@/modules/assistant/components/workspace-layout-toolbar";
import { SessionPanel } from "@/modules/assistant/components/session/session-panel";
import { SessionSidebarDrawer } from "@/modules/assistant/components/session/session-sidebar-drawer";
import { VisionColumn } from "@/modules/assistant/components/media/vision-column";
import { buildWorkspacePanelProps } from "@/modules/assistant/lib/workspace-panel-props";
import {
  useRealtimeSession,
} from "@/modules/assistant/hooks/use-realtime-session";
import { type FrameSignature } from "@/modules/assistant/lib/frame-diff";
import { MAX_FRAME_WIDTH } from "@/modules/assistant/lib/frame-processing";
import {
  deriveFrameTelemetryStats,
  deriveSampleRateStats,
  EMPTY_FRAME_TELEMETRY,
  recordFrameTelemetry,
  recordSampleTick,
  type FrameTelemetryState,
} from "@/modules/assistant/lib/frame-telemetry";
import {
  createInitialSceneMemoryState,
  type SceneMemoryState,
} from "@/modules/assistant/lib/scene-memory";
import {
  type SpatialAnnotation,
} from "@/modules/assistant/lib/spatial-annotation";
import { resolveVisibleError } from "@/modules/assistant/lib/error-resolution";
import { resolveWorkspaceDerivedState } from "@/modules/assistant/lib/workspace-derived-state";
import { useTranscriptDispatch } from "@/modules/assistant/hooks/use-transcript-dispatch";
import { useWorkspaceShell } from "@/modules/assistant/hooks/use-workspace-shell";
import { buildCalibratedUsageExport } from "@/modules/assistant/lib/usage-export";
import {
  chatUsageToUsageReport,
  type ChatTurnEstimate,
} from "@/modules/assistant/lib/chat-cost-model";
import {
  estimateCostUsd,
  type UsageBuckets,
} from "@/modules/assistant/lib/cost-model";
import { realtimeUsageToRecord } from "@/modules/assistant/lib/usage-persistence";
import { buildRetryableEntryIds } from "@/modules/assistant/lib/retryable-entry-ids";
import { buildInitialTranscript } from "@/modules/assistant/lib/workspace-shell";
import { resolveWorkspaceGating } from "@/modules/assistant/lib/workspace-gating";
import {
  resolveCostControlItems,
  resolveWorkspaceStatusLabels,
} from "@/modules/assistant/lib/workspace-status-labels";
import { renderWorkspaceDisplayLabels } from "@/modules/assistant/lib/workspace-labels-render";
import {
  assistantReducer,
  createInitialAssistantState,
} from "@/modules/assistant/state/assistant-reducer";

const initialTranscript = buildInitialTranscript();

type RetryableChatTurn = {
  message: string;
  imageDataUrl?: string;
  signature?: FrameSignature;
};

export function AssistantWorkspace(): React.JSX.Element {
  const { t, i18n: i18nClient } = useTranslation();
  const navigate = useNavigate();
  // 桌面终端开关：仅 Tauri 环境启用，浏览器隐藏终端入口。
  const isDesktop = isTauriRuntime();
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const handleToggleTerminal = useCallback(() => {
    setIsTerminalOpen((open) => !open);
  }, []);
  const assistantShellRef = useRef<HTMLElement | null>(null);
  const {
    layout,
    resetLayout,
    setFocusMode,
    setSessionWidthPercent,
    swapPanels,
    togglePanel,
  } = useWorkspaceLayout();
  const { preference, setPreference } = useTheme();
  const { mediaState, requestAccess, stopAccess, stream } = useMediaCapture();
  const {
    providerMode,
    visionCapability,
    isProviderConfigLoading,
    providerConfigError,
    setProviderMode,
  } = useProviderConfig();
  const { chatState, sendChatCompletion } = useChatCompletion();
  const {
    sessionState,
    initialize: initializeSessions,
    newSession: newPersistedSession,
    switchSession: switchPersistedSession,
    persistMessage,
    restoreSceneMemory,
    persistSceneMemory,
    restoreUsage,
    persistUsage,
    loadGlobalUsageTotals,
    rename: renamePersistedSession,
    remove: removePersistedSession,
    exportSession: exportPersistedSession,
    pruneEmptySessions,
  } = useSessions();
  // 会话级用量持久化：把每轮 Chat 用量写入当前会话的 D1 记录。
  const persistChatUsage = useCallback(
    (estimate: ChatTurnEstimate) => {
      void persistUsage({
        mode: "chat",
        inputTokens: estimate.inputTokens,
        inputTextTokens: estimate.inputTextTokens,
        inputAudioTokens: 0,
        inputImageTokens: estimate.inputImageTokens,
        outputTokens: estimate.outputTokens,
        outputTextTokens: estimate.outputTextTokens,
        outputAudioTokens: 0,
        estimatedCostUsd: estimate.estimatedCostUsd,
      });
    },
    [persistUsage],
  );
  const { chatUsageReport, resetChatUsage, recordChatTurn, seedFromPersistedTotals } =
    useChatUsageCollector({ persistUsage: persistChatUsage });
  const [assistantState, dispatch] = useReducer(
    assistantReducer,
    initialTranscript,
    createInitialAssistantState,
  );
  const assistantPhase = assistantState.phase;
  const transcript = assistantState.transcript;
  const lastFrameDataUrl = assistantState.lastFrameDataUrl;
  const sampledFrameCount = assistantState.frameStats.sampled;
  const sentFrameCount = assistantState.frameStats.sent;
  const skippedAutoFrameCount = assistantState.frameStats.skippedAuto;
  const {
    isAutoSampling,
    setIsAutoSampling,
    samplingIntervalSeconds,
    setSamplingIntervalSeconds,
    isFramePruningEnabled,
    setIsFramePruningEnabled,
    turnDetectionMode,
    setTurnDetectionMode,
    responseBudget,
    setResponseBudget,
    responseMode,
    setResponseMode,
    isChatAnswerSpeechEnabled,
    setIsChatAnswerSpeechEnabled,
    chatVoiceSendMode,
    setChatVoiceSendMode,
    textDraft,
    setTextDraft,
    isTextHistorySummaryEnabled,
    setIsTextHistorySummaryEnabled,
  } = useWorkspaceControlsState();
  const [retryableChatTurns, setRetryableChatTurns] = useState<
    Readonly<Record<string, RetryableChatTurn>>
  >({});
  const {
    isClearConfirmationVisible,
    setIsClearConfirmationVisible,
    isSessionSidebarOpen,
    toggleSessionSidebar,
    closeSessionSidebar,
    requestClear,
    cancelClear,
  } = useWorkspaceShell();

  // M10.8 全局命令面板命令表：导航 / 面板 / 偏好三类动作，统一键盘入口。
  const commandPaletteCommands = useMemo<readonly CommandAction[]>(() => {
    const switchLanguage = (language: AppLanguage): void => {
      persistLanguage(language);
      void i18nClient.changeLanguage(language);
    };
    return [
      {
        id: "nav-home",
        group: "navigation",
        labelKey: "commandPalette.navHome",
        hintKey: "commandPalette.navHomeHint",
        keywords: ["home", "workspace", "工作台", "assistant"],
        action: () => navigate("/"),
      },
      {
        id: "nav-costs",
        group: "navigation",
        labelKey: "commandPalette.navCosts",
        hintKey: "commandPalette.navCostsHint",
        keywords: ["cost", "dashboard", "驾驶舱", "成本", "usage"],
        action: () => navigate("/costs"),
      },
      {
        id: "panel-cost",
        group: "panels",
        labelKey: "commandPalette.panelCost",
        hintKey: "commandPalette.panelCostHint",
        keywords: ["console", "控制台", "成本", "cost"],
        action: () => togglePanel("cost"),
      },
      {
        id: "panel-usage",
        group: "panels",
        labelKey: "commandPalette.panelUsage",
        hintKey: "commandPalette.panelUsageHint",
        keywords: ["usage", "用量", "成本"],
        action: () => togglePanel("usage"),
      },
      {
        id: "panel-visual-context",
        group: "panels",
        labelKey: "commandPalette.panelVisualContext",
        hintKey: "commandPalette.panelVisualContextHint",
        keywords: ["frames", "frames", "画面", "recent", "visual"],
        action: () => togglePanel("visualContext"),
      },
      {
        id: "panel-sessions",
        group: "panels",
        labelKey: "commandPalette.panelSessions",
        hintKey: "commandPalette.panelSessionsHint",
        keywords: ["sessions", "会话", "列表", "sidebar"],
        action: () => toggleSessionSidebar(),
      },
      ...(isDesktop
        ? [
            {
              id: "terminal-toggle",
              group: "panels",
              labelKey: "commandPalette.terminalToggle",
              hintKey: "commandPalette.terminalToggleHint",
              keywords: ["terminal", "终端", "xterm"],
              action: handleToggleTerminal,
            } as const,
          ]
        : []),
      {
        id: "pref-theme-dark",
        group: "preferences",
        labelKey: "commandPalette.themeDark",
        hintKey: "commandPalette.themeDarkHint",
        keywords: ["dark", "暗色", "主题", "theme"],
        action: () => setPreference("dark"),
      },
      {
        id: "pref-theme-light",
        group: "preferences",
        labelKey: "commandPalette.themeLight",
        hintKey: "commandPalette.themeLightHint",
        keywords: ["light", "亮色", "主题", "theme"],
        action: () => setPreference("light"),
      },
      {
        id: "pref-theme-system",
        group: "preferences",
        labelKey: "commandPalette.themeSystem",
        hintKey: "commandPalette.themeSystemHint",
        keywords: ["system", "系统", "主题", "theme"],
        action: () => setPreference("system"),
      },
      {
        id: "pref-language-zh",
        group: "preferences",
        labelKey: "commandPalette.languageZh",
        keywords: ["zh", "中文", "语言", "language"],
        action: () => switchLanguage("zh"),
      },
      {
        id: "pref-language-en",
        group: "preferences",
        labelKey: "commandPalette.languageEn",
        keywords: ["en", "english", "语言", "language"],
        action: () => switchLanguage("en"),
      },
      {
        id: "pref-reset-layout",
        group: "preferences",
        labelKey: "commandPalette.resetLayout",
        hintKey: "commandPalette.resetLayoutHint",
        keywords: ["reset", "reset", "默认", "layout", "布局"],
        action: () => resetLayout(),
      },
    ];
  }, [
    navigate,
    isDesktop,
    togglePanel,
    toggleSessionSidebar,
    handleToggleTerminal,
    setPreference,
    resetLayout,
    i18nClient,
  ]);

  // M10.8 全局命令面板 + 快捷键宿主句柄（供工具栏按钮打开面板）。
  const commandPaletteHostRef = useRef<GlobalShortcutHostHandle>(null);

  const nextEntryIdRef = useRef(initialTranscript.length);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastUploadedFrameSignatureRef = useRef<FrameSignature | null>(null);
  const hasRestoredSessionRef = useRef(false);
  // M3.2 会话持久化：首次挂载防重复初始化（兼容 StrictMode 双执行）。
  const hasInitializedRef = useRef(false);
  // M4.1 场景记忆：最近 N 个关键帧的文字摘要（替代历史图片的低成本上下文）。
  const sceneMemoryRef = useRef<SceneMemoryState>(createInitialSceneMemoryState());
  // M4.1/M4.2 UI 统计状态：场景记忆摘要 + 多模态融合 + 文本历史摘要（领域聚合 hook）。
  const {
    sceneMemoryStats,
    setSceneMemoryStats,
    fusionStats,
    setFusionStats,
    textHistoryStats,
    setTextHistoryStats,
  } = useAssistantStats();
  // M4.3 空间定位标注：模型回复中解析出的归一化坐标标注（叠加在摄像头预览上）。
  const [spatialAnnotations, setSpatialAnnotations] = useState<readonly SpatialAnnotation[]>([]);
  // 帧采样性能遥测：离屏 Worker 帧处理耗时统计（平均/最大/最近）。
  const [frameTelemetry, setFrameTelemetry] = useState<FrameTelemetryState>(EMPTY_FRAME_TELEMETRY);

  const { addTranscript, setTranscriptDeliveryStatus, handleRealtimePhaseChange } =
    useTranscriptDispatch({
      nextEntryIdRef,
      dispatch,
    });

  // M3.2 会话持久化 + M4.1 场景记忆：会话列表加载完成后恢复历史消息与场景摘要。
  useSessionRestore({
    initializeSessions,
    hasInitializedRef,
    isLoaded: sessionState.isLoaded,
    activeSessionId: sessionState.activeSessionId,
    dispatch,
    addTranscript,
    switchPersistedSession,
    restoreSceneMemory,
    nextEntryIdRef,
    sceneMemoryRef,
    hasRestoredSessionRef,
  });

  const { handleChatSpeechTranscript, handleBrowserSpeechStatus } =
    useSpeechTranscript({ setTextDraft, addTranscript });

  const {
    speechState,
    speak: speakChatAnswer,
    cancelSpeech: cancelChatSpeech,
  } = useBrowserSpeechAdapter({
    language: "zh-CN",
    onTranscript: handleChatSpeechTranscript,
    onStatusMessage: handleBrowserSpeechStatus,
  });
  const {
    transcriptionState,
    startRecording: startChatVoiceRecording,
    stopRecording: stopChatVoiceRecording,
    cancelRecording: cancelChatVoiceRecording,
  } = useWorkerSpeechTranscription({
    stream,
    language: "zh",
    onStatusMessage: handleBrowserSpeechStatus,
  });

  // 会话级用量持久化：把每轮 Realtime 权威用量写入当前会话的 D1 记录。
  const persistRealtimeUsage = useCallback(
    (usage: UsageBuckets) => {
      void persistUsage(realtimeUsageToRecord(usage, estimateCostUsd(usage)));
    },
    [persistUsage],
  );

  const {
    realtimeState,
    remoteStream,
    usageReport,
    prunedFrameCount,
    seedUsageFromPersistedTotals,
    resetUsage: resetRealtimeUsage,
    startSession: startRealtimeSession,
    stopSession: stopRealtimeSession,
    sendVisualContext,
    sendTextMessage,
    isMicrophoneMuted,
    isPushToTalkActive,
    setMicrophoneMuted,
    startPushToTalk,
    stopPushToTalk,
  } = useRealtimeSession({
    stream,
    onTranscript: addTranscript,
    onPhaseChange: handleRealtimePhaseChange,
    pruneConsumedFrames: isFramePruningEnabled,
    responseMode,
    persistUsage: persistRealtimeUsage,
  });

  // 会话级用量持久化：切换/恢复当前会话时，从 D1 恢复该会话的历史累计用量。
  // 让跨会话累计在切换回某个会话后依然可见（替代仅当前页面内的内存计量）。
  useEffect(() => {
    if (!sessionState.isLoaded || sessionState.activeSessionId === null) {
      return;
    }

    void restoreUsage().then((usage) => {
      if (usage === null) {
        resetChatUsage();
        resetRealtimeUsage();
        return;
      }
      seedFromPersistedTotals(usage.totals);
      seedUsageFromPersistedTotals(usage.totals);
    });
  }, [
    sessionState.isLoaded,
    sessionState.activeSessionId,
    restoreUsage,
    resetChatUsage,
    resetRealtimeUsage,
    seedFromPersistedTotals,
    seedUsageFromPersistedTotals,
  ]);

  // ①③ 全局预算护栏 + 跨会话成本对比状态（收敛为 useGlobalBudget hook）。
  const {
    guardrail: budgetGuardrail,
    monthSpentUsd,
    monthEndForecast,
    comparison: sessionComparison,
    costCockpit,
    budgetHistory,
    saveBudget: handleSaveBudget,
    isSavingBudget,
  } = useGlobalBudget({
    isLoaded: sessionState.isLoaded,
  });

  const {
    isPruningEmptySessions,
    handleNewSession,
    handleSessionSwitch,
    handleSessionRename,
    handleSessionRemove,
    handleSessionExport,
    handlePruneEmptySessions,
  } = useSessionManagement({
    dispatch,
    addTranscript,
    cancelChatSpeech,
    sceneMemoryRef,
    nextEntryIdRef,
    setRetryableChatTurns,
    setSpatialAnnotations,
    activeSessionId: sessionState.activeSessionId,
    newPersistedSession,
    switchPersistedSession,
    renamePersistedSession,
    removePersistedSession,
    exportPersistedSession,
    pruneEmptySessions,
    restoreSceneMemory,
  });

  // Live cost measurement：新建会话时同步重置 Chat 用量计量。
  const handleNewSessionWithUsageReset = useCallback(() => {
    resetChatUsage();
    handleNewSession();
  }, [resetChatUsage, handleNewSession]);

  const {
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
  } = resolveWorkspaceDerivedState({
    mediaStatus: mediaState.status,
    hasStream: stream !== null,
    assistantPhase,
    realtimeStatus: realtimeState.status,
    providerMode,
    transcriptionStatus: transcriptionState.status,
    turnDetectionMode,
    responseBudget,
    costPolicyTurnDetectionMode: realtimeState.costPolicy?.turnDetectionMode,
    costPolicyResponseBudget: realtimeState.costPolicy?.responseBudget,
  });
  const retryableEntryIds = useMemo(() => buildRetryableEntryIds(retryableChatTurns), [retryableChatTurns]);
  // Live cost measurement：按当前模式选择展示的用量报告——Realtime 用权威
  // `response.done` 计量，Chat 模式用前端估算计量。
  const displayUsageReport = useMemo(() => {
    return isChatMode
      ? chatUsageToUsageReport(chatUsageReport)
      : usageReport;
  }, [isChatMode, chatUsageReport, usageReport]);
  // 成本校准工作台：记录「实际账单金额」对比前端估算（localStorage 持久化）。
  const {
    viewModel: calibrationView,
    addCalibration: handleRecordCalibration,
    removeCalibration: handleRemoveCalibration,
    clearCalibrations: handleClearCalibrations,
  } = useCalibration({
    isLoaded: sessionState.isLoaded,
    activeSessionId: sessionState.activeSessionId,
    currentEstimateUsd: displayUsageReport.estimatedCostUsd,
  });
  // 校准偏差自动回写估算单价：由校准样本推导校正系数，可一键回写 / 重置（localStorage 持久化）。
  const {
    writeback: calibrationWriteback,
    applyWriteback: handleApplyCalibrationWriteback,
    resetWriteback: handleResetCalibrationWriteback,
  } = useCalibrationWriteback({
    viewModel: calibrationView,
    isLoaded: sessionState.isLoaded,
  });
  // 仅在「需校准且尚未回写」时展示「自动回写校正估算单价」入口。
  const showWritebackApply =
    calibrationView.needsCalibration && !calibrationWriteback.applied;

  // 已应用的校准回写系数（未回写 → 1，即不校正）。
  const calibrationFactor =
    calibrationWriteback.applied && Number.isFinite(calibrationWriteback.factor)
      ? calibrationWriteback.factor
      : 1;

  // ②③ 全局累计用量 + 会话级用量导出状态（收敛为 useGlobalUsage hook）。
  // 会话内 / 全局成本导出应用校准回写系数，使导出成本与实测账单一致。
  const {
    globalUsageTotals,
    globalUsageExport,
    sessionUsageExport,
    sessionUsageTrend,
    budgetUsd,
    setBudget,
  } = useGlobalUsage({
    isLoaded: sessionState.isLoaded,
    activeSessionId: sessionState.activeSessionId,
    loadGlobalUsageTotals,
    restoreUsage,
    calibrationFactor,
  });

  // 会话内用量导出：应用校准回写系数，使导出的估算成本与实测账单一致。
  const usageExport = useMemo(
    () => buildCalibratedUsageExport(displayUsageReport, calibrationFactor),
    [displayUsageReport, calibrationFactor],
  );

  // 对全局成本视图（护栏 / 驾驶舱 / 预算历史 / 月度外推 / 跨会话对比）应用
  // 校准回写系数，使侧边栏全局金额与实测账单一致（与 /costs 驾驶舱一致）。
  const calibratedBudget = useCalibratedCost(
    {
      guardrail: budgetGuardrail,
      monthSpentUsd,
      monthEndForecast,
      comparison: sessionComparison,
      costCockpit,
      budgetHistory,
    },
    calibrationFactor,
    budgetGuardrail.alertThresholdPct,
  );

  // ⑥ 成本告警通知：把护栏 / 月度外推 / 历史审计 / 校准回写折叠为可去重、可忽略的通知。
  const {
    notifications: costAlertNotifications,
    activeCount: costAlertActiveCount,
    hasFreshAlert: costAlertHasFreshAlert,
    dismiss: dismissCostAlert,
    dismissAll: dismissAllCostAlerts,
  } = useCostAlertNotifications({
    isLoaded: sessionState.isLoaded,
    input: {
      guardrail: calibratedBudget.guardrail,
      monthEndForecast: calibratedBudget.monthEndForecast,
      budgetHistory: calibratedBudget.budgetHistory,
      calibrationWriteback,
      calibrationNeedsWriteback:
        calibrationView.needsCalibration && !calibrationWriteback.applied,
    },
  });
  const frameTelemetryStats = useMemo(
    () => deriveFrameTelemetryStats(frameTelemetry),
    [frameTelemetry],
  );
  const sampleRateStats = useMemo(
    () => deriveSampleRateStats(frameTelemetry),
    [frameTelemetry],
  );

  const {
    captureFrameAsync,
    recordUploadedFrame,
  } = useFrameCapture({
    hasMedia,
    videoRef,
    canvasRef,
    lastUploadedFrameSignatureRef,
    dispatch,
    addTranscript,
    recordFrameSample: (processMs) => {
      setFrameTelemetry((prev) => recordFrameTelemetry(prev, processMs));
    },
    recordSampleTick: (timestampMs) => {
      setFrameTelemetry((prev) => recordSampleTick(prev, timestampMs));
    },
  });

  const { sendChatTurn } = useSendChatTurn({
    dispatch,
    addTranscript,
    persistMessage,
    sceneMemoryRef,
    setSceneMemoryStats,
    persistSceneMemory,
    setSpatialAnnotations,
    sendChatCompletion,
    responseBudget,
    recordUploadedFrame,
    setTranscriptDeliveryStatus,
    setRetryableChatTurns,
    isChatAnswerSpeechEnabled,
    speakChatAnswer,
    mediaGranted: mediaState.status === "granted",
    transcript,
    isTextHistorySummaryEnabled,
    setTextHistoryStats,
    onTurnCompleted: recordChatTurn,
  });

  const { handleTextMessageSubmit, handleRealtimeTurn } = useMessageSend({
    textDraft,
    setTextDraft,
    isChatMode,
    hasMedia,
    hasRealtimeConnection,
    assistantPhase,
    addTranscript,
    dispatch,
    sendChatTurn,
    sendTextMessage,
    sendVisualContext,
    captureFrameAsync,
    recordUploadedFrame,
  });

  const {
    handleConversationExport,
    handleClearConversation,
    handleRetryChatTurn,
    handleManualFrameCapture,
  } = useConversationActions({
    transcript,
    retryableChatTurns,
    isChatSending: chatState.isSending,
    hasRealtimeConnection,
    addTranscript,
    dispatch,
    cancelChatSpeech,
    sendChatTurn,
    setTranscriptDeliveryStatus,
    setRetryableChatTurns,
    setSpatialAnnotations,
    setIsClearConfirmationVisible,
    nextEntryIdRef,
    captureFrameAsync,
    recordUploadedFrame,
    sendVisualContext,
  });

  const {
    isContinuousChatVoiceEnabled,
    stopContinuousChatVoice,
    completeChatVoiceRecording,
    handleContinuousChatVoiceClick,
  } = useContinuousChatVoice({
    hasMedia,
    isChatMode,
    isChatVoiceRecording,
    isChatVoiceBusy,
    chatStateIsSending: chatState.isSending,
    transcriptionRecordingSupported: transcriptionState.isRecordingSupported,
    addTranscript,
    startChatVoiceRecording,
    stopChatVoiceRecording,
    cancelChatVoiceRecording,
    cancelChatSpeech,
    isSpeaking: speechState.isSpeaking,
    isSynthesisSupported: speechState.isSynthesisSupported,
    captureFrameAsync,
    sendChatTurn,
    chatVoiceSendMode,
    setChatVoiceSendMode,
    setIsChatAnswerSpeechEnabled,
    setTextDraft,
    setFusionStats,
  });
  const {
    handleAutoSamplingChange,
    handleFramePruningChange,
    handleTurnDetectionModeChange,
    handleResponseBudgetChange,
    handleResponseModeChange,
    handleMicrophoneMutedChange,
    handleChatSpeechInputClick,
    handleChatVoiceSendModeChange,
    handleChatAnswerSpeechChange,
    handleCancelChatSpeech,
    handleTextDraftChange,
    handleSamplingIntervalChange,
    handleTextHistorySummaryChange,
  } = useWorkspaceControls({
    isChatVoiceRecording,
    setAutoSampling: setIsAutoSampling,
    setFramePruning: setIsFramePruningEnabled,
    setTurnDetectionMode,
    setResponseBudget,
    setResponseMode,
    setMicrophoneMuted,
    setChatVoiceSendMode,
    setChatAnswerSpeechEnabled: setIsChatAnswerSpeechEnabled,
    setTextDraft,
    setSamplingIntervalSeconds,
    setTextHistorySummaryEnabled: setIsTextHistorySummaryEnabled,
    startChatVoiceRecording,
    completeChatVoiceRecording,
    cancelChatSpeech,
    addTranscript,
  });
  const statusLabels = resolveWorkspaceStatusLabels({
    hasMedia,
    isChatMode,
    isContinuousChatVoiceEnabled,
    isChatVoiceRecording,
    isChatVoiceTranscribing,
    isChatSending: chatState.isSending,
    isSpeaking: speechState.isSpeaking,
    transcriptionIsRecordingSupported: transcriptionState.isRecordingSupported,
    transcriptionStatus: transcriptionState.status,
    transcriptionErrorMessage: transcriptionState.errorMessage ?? null,
    chatVoiceSendMode,
    isMicrophoneMuted,
    isPushToTalkMode,
    isPushToTalkActive,
    hasRealtimeConnection,
    peerConnectionState: realtimeState.peerConnectionState,
    realtimeStatus: realtimeState.status,
  });
  const costControlItems = resolveCostControlItems({
    providerMode,
    isChatMode,
    isAutoSampling,
    costPolicy: realtimeState.costPolicy
      ? {
          visualContextMode: realtimeState.costPolicy.visualContextMode,
          maxSessionSeconds: realtimeState.costPolicy.maxSessionSeconds,
          maxResponseOutputTokens: realtimeState.costPolicy.maxResponseOutputTokens,
        }
      : null,
    activeResponseBudget,
    responseMode,
    isContinuousChatVoiceEnabled,
    isChatAnswerSpeechEnabled,
    transcriptionIsRecordingSupported: transcriptionState.isRecordingSupported,
    activeTurnDetectionMode,
    microphoneStatus: statusLabels.microphoneStatus,
    isMicrophoneMuted,
  });
  const {
    microphoneStatusLabel,
    chatSpeechStatusLabel,
    providerDetail,
    startSessionLabel,
    pushToTalkLabel,
    pushToTalkTitle,
    costControls,
  } = renderWorkspaceDisplayLabels(t, statusLabels, costControlItems);
  // 媒体元素绑定：本地流 → video，远端 Realtime 音频流 → audio（卸载时解绑）。
  useMediaStreamBinding({
    videoRef,
    audioRef,
    stream,
    remoteStream,
  });

  // M1.2 连续对话 VAD：监听音频电平，检测用户说完话（或达到最长录音时长）时结束本轮录音。
  const continuousChatAudioTrack = stream?.getAudioTracks()[0] ?? null;
  useContinuousChatVad({
    audioTrack: continuousChatAudioTrack,
    enabled:
      isContinuousChatVoiceEnabled && isChatMode && isChatVoiceRecording,
    onUtteranceComplete: () => {
      void completeChatVoiceRecording("continuous");
    },
  });

  // 媒体相位同步：授权后推进到 ready，撤销时回退到 idle。
  useMediaPhaseSync({
    mediaState,
    assistantPhase,
    dispatch,
  });

  useAutoFrameSampling({
    enabled: isAutoSampling,
    hasActiveSession,
    hasMedia,
    hasRealtimeConnection,
    intervalSeconds: samplingIntervalSeconds,
    lastUploadedFrameSignatureRef,
    captureFrameAsync,
    recordUploadedFrame,
    sendVisualContext,
    onFrameSkipped: () => dispatch({ type: "frame-skipped" }),
  });

  const { changeProviderMode } = useAssistantSession({
    hasRealtimeConnection,
    mediaGranted: mediaState.status === "granted",
    setProviderMode,
    dispatch,
    addTranscript,
    cleanup: {
      stopRealtime: stopRealtimeSession,
      cancelContinuousChatVoice: stopContinuousChatVoice,
      cancelChatVoiceRecording,
      cancelChatSpeech,
    },
  });

  const { handleStopSession, handleProviderModeChange } = useWorkspaceActions({
    hasActiveSession,
    hasRealtimeConnection,
    mediaGranted: mediaState.status === "granted",
    providerMode,
    dispatch,
    addTranscript,
    stopRealtimeSession,
    changeProviderMode,
  });

  const { handleRequestAccess, handleReleaseMedia } = useMediaAccess({
    requestAccess,
    stopAccess,
    stopContinuousChatVoice,
    cancelChatVoiceRecording,
    stopSession: handleStopSession,
    setAutoSampling: setIsAutoSampling,
    dispatch,
    lastUploadedFrameSignatureRef,
    setMicrophoneMuted,
    addTranscript,
  });

  const { handleStartSession } = useSessionStart({
    isChatMode,
    mediaGranted: mediaState.status === "granted",
    dispatch,
    addTranscript,
    lastUploadedFrameSignatureRef,
    isAutoSampling,
    turnDetectionMode,
    responseBudget,
    startRealtimeSession,
  });

  const {
    canUseSessionButton,
    canChangeTurnMode,
    canChangeProviderMode,
    canChangeResponseBudget,
    canVisualQuestion,
    canSendTextMessage,
    canToggleChatSpeechInput,
    canStartContinuousChatVoice,
    canPushToTalk,
    canStopSession,
  } = resolveWorkspaceGating({
    isChatMode,
    isRealtimeMode,
    hasMedia,
    hasActiveSession,
    assistantPhase,
    realtimeStatus: realtimeState.status,
    hasRealtimeConnection,
    isProviderConfigLoading,
    isChatSending: chatState.isSending,
    isChatVoiceRecording,
    isChatVoiceTranscribing,
    isContinuousChatVoiceEnabled,
    transcriptionIsRecordingSupported:
      transcriptionState.isRecordingSupported,
    isPushToTalkMode,
    isMicrophoneMuted,
  });

  const {
    handlePushToTalkPointerDown,
    handlePushToTalkPointerEnd,
    handlePushToTalkKeyDown,
    handlePushToTalkKeyUp,
  } = usePushToTalkEvents({
    canPushToTalk,
    startPushToTalk,
    stopPushToTalk,
  });

  const visibleError = resolveVisibleError(
    mediaState.errorMessage,
    providerConfigError,
    realtimeState.errorMessage,
    transcriptionState.errorMessage,
    chatState.errorMessage,
  );

  const {
    handleWorkspaceResizeStart,
    handlePanelDragStart,
    handlePanelDrop,
  } = useWorkspacePanelInteraction({
    setSessionWidthPercent,
    swapPanels,
  });

  // ── 领域分组 props 组装区 ───────────────────────────────
  // 把 SessionPanel / VisionColumn 的扁平 props 按领域收拢为分组对象，
  // 使主组件清晰区分为「逻辑构建区」与下方「展示装配区」（spread 展开）。
  // 组装逻辑抽为纯函数 `buildWorkspacePanelProps`，便于单测与复用。
  const { sessionPanelProps, visionColumnProps } = buildWorkspacePanelProps({
    hasMedia,
    mediaStatus: mediaState.status,
    videoRef,
    audioRef,
    canvasRef,
    isMicrophoneMuted,
    onMicrophoneMutedChange: handleMicrophoneMutedChange,
    microphoneStatusLabel,
    assistantPhase,
    isChatMode,
    providerMode,
    realtimeStatus: realtimeState.status,
    hasRealtimeConnection,
    isProviderConfigLoading,
    providerDetail,
    visionCapability,
    visibleError,
    onRequestAccess: handleRequestAccess,
    onStartSession: handleStartSession,
    canUseSessionButton,
    startSessionLabel,
    canStopSession,
    onStopSession: handleStopSession,
    onReleaseMedia: handleReleaseMedia,
    isPushToTalkActive,
    canPushToTalk,
    pushToTalkLabel,
    pushToTalkTitle,
    onPushToTalkPointerDown: handlePushToTalkPointerDown,
    onPushToTalkPointerEnd: handlePushToTalkPointerEnd,
    onPushToTalkKeyDown: handlePushToTalkKeyDown,
    onPushToTalkKeyUp: handlePushToTalkKeyUp,
    canVisualQuestion,
    onVisualQuestion: handleRealtimeTurn,
    onManualFrameCapture: handleManualFrameCapture,
    onPanelDragStart: handlePanelDragStart,
    onPanelDrop: handlePanelDrop,
    panelVisibility: layout.panelVisibility,
    costControls,
    canChangeProviderMode,
    onProviderModeChange: handleProviderModeChange,
    isContinuousChatVoiceEnabled,
    canStartContinuousChatVoice,
    onContinuousChatVoiceClick: handleContinuousChatVoiceClick,
    isChatVoiceRecording,
    canToggleChatSpeechInput,
    onChatSpeechInputClick: handleChatSpeechInputClick,
    isChatVoiceBusy,
    isChatSending: chatState.isSending,
    chatVoiceSendMode,
    onChatVoiceSendModeChange: handleChatVoiceSendModeChange,
    chatSpeechStatusLabel,
    canChangeTurnMode,
    turnDetectionMode,
    onTurnDetectionModeChange: handleTurnDetectionModeChange,
    canChangeResponseBudget,
    responseBudget,
    onResponseBudgetChange: handleResponseBudgetChange,
    isChatAnswerSpeechEnabled,
    isSpeechSynthesisSupported: speechState.isSynthesisSupported,
    onChatAnswerSpeechChange: handleChatAnswerSpeechChange,
    isSpeechSpeaking: speechState.isSpeaking,
    onCancelChatSpeech: handleCancelChatSpeech,
    responseMode,
    onResponseModeChange: handleResponseModeChange,
    isAutoSampling,
    onAutoSamplingChange: handleAutoSamplingChange,
    samplingIntervalSeconds,
    onSamplingIntervalChange: handleSamplingIntervalChange,
    isFramePruningEnabled,
    onFramePruningChange: handleFramePruningChange,
    isTextHistorySummaryEnabled,
    onTextHistorySummaryChange: handleTextHistorySummaryChange,
    usageReport: displayUsageReport,
    usageExport,
    sessionUsageExport,
    sessionUsageTrend,
    budgetUsd,
    onBudgetSet: setBudget,
    skippedAutoFrameCount,
    sampleWidth: MAX_FRAME_WIDTH,
    sampleHeight: Math.round(MAX_FRAME_WIDTH * (9 / 16)),
    transcript,
    retryableEntryIds,
    isRetryDisabled: chatState.isSending,
    onRetry: handleRetryChatTurn,
    isClearConfirmationVisible,
    onRequestClear: requestClear,
    onCancelClear: cancelClear,
    onConfirmClear: handleClearConversation,
    onExport: handleConversationExport,
    textDraft,
    canSendTextMessage,
    onTextDraftChange: handleTextDraftChange,
    onTextMessageSubmit: handleTextMessageSubmit,
    lastFrameDataUrl,
    sampledFrameCount,
    sentFrameCount,
    prunedFrameCount,
    spatialAnnotations,
    sceneMemoryStats,
    fusionStats,
    textHistoryStats,
    frameTelemetryStats,
    sampleRateStats,
  });

  return (
    <main
      ref={assistantShellRef}
      className="assistant-shell"
      data-focus-mode={layout.focusMode}
      data-session-first={layout.panelOrder[0] === "session" ? "true" : "false"}
      style={{ "--session-width": `${layout.sessionWidthPercent}%` } as React.CSSProperties}
    >
      <div className="ambient-blobs" aria-hidden="true">
        <div className="ambient-blob ambient-blob--primary" aria-hidden="true" />
        <div className="ambient-blob ambient-blob--secondary" aria-hidden="true" />
        <div className="ambient-blob ambient-blob--tertiary" aria-hidden="true" />
      </div>
      <div className="ambient-noise" aria-hidden="true" />
      {/* 桌面原生窗口控制栏（最小化/最大化/关闭）——仅 Tauri 环境显示。 */}
      <DesktopWindowControls />

      <WorkspaceLayoutToolbar
        layout={layout}
        onFocusModeChange={setFocusMode}
        onReset={resetLayout}
        onSessionWidthChange={setSessionWidthPercent}
        onSwapPanels={swapPanels}
        onTogglePanel={togglePanel}
        onToggleSessions={toggleSessionSidebar}
        themePreference={preference}
        onThemePreferenceChange={setPreference}
        terminalEnabled={isDesktop}
        terminalOpen={isTerminalOpen}
        onToggleTerminal={handleToggleTerminal}
        onOpenCommandPalette={() => commandPaletteHostRef.current?.openPalette()}
      />

      <SessionSidebarDrawer
        open={isSessionSidebarOpen}
        sessions={sessionState.sessions}
        activeSessionId={sessionState.activeSessionId}
        onNew={handleNewSessionWithUsageReset}
        onSwitch={handleSessionSwitch}
        onRename={handleSessionRename}
        onRemove={handleSessionRemove}
        onExport={handleSessionExport}
        onPrune={() => void handlePruneEmptySessions()}
        onClose={closeSessionSidebar}
        isPruning={isPruningEmptySessions}
        globalUsageTotals={globalUsageTotals}
        globalUsageExport={globalUsageExport}
        budgetGuardrail={calibratedBudget.guardrail}
        monthSpentUsd={calibratedBudget.monthSpentUsd}
        monthEndForecast={calibratedBudget.monthEndForecast}
        onSaveBudget={handleSaveBudget}
        isSavingBudget={isSavingBudget}
        sessionUsageTrend={sessionUsageTrend}
        sessionComparison={calibratedBudget.comparison}
        costCockpit={calibratedBudget.costCockpit}
        costCockpitFactor={calibrationFactor}
        budgetHistory={calibratedBudget.budgetHistory}
        calibrationView={calibrationView}
        currentEstimateUsd={displayUsageReport.estimatedCostUsd}
        calibrationWriteback={calibrationWriteback}
        showWritebackApply={showWritebackApply}
        onApplyWriteback={handleApplyCalibrationWriteback}
        onResetWriteback={handleResetCalibrationWriteback}
        onRecordCalibration={handleRecordCalibration}
        onRemoveCalibration={handleRemoveCalibration}
        onClearCalibration={handleClearCalibrations}
      />

      <SessionPanel {...sessionPanelProps} />

      <button
        className="workspace-resize-handle"
        type="button"
        aria-label={t("toolbar.resizeHandle")}
        title={t("toolbar.resizeTitle")}
        onPointerDown={(event) =>
          handleWorkspaceResizeStart(event, assistantShellRef.current, layout.panelOrder)
        }
      >
        <GripVertical size={18} aria-hidden="true" />
      </button>

      <VisionColumn {...visionColumnProps} />

      {/* ⑥ 成本告警通知中心（铃铛 + 一次性横幅）。 */}
      <CostAlertCenter
        notifications={costAlertNotifications}
        activeCount={costAlertActiveCount}
        showBanner={costAlertHasFreshAlert}
        onDismiss={dismissCostAlert}
        onDismissAll={dismissAllCostAlerts}
      />

      {/* 全局命令面板 + 快捷键 + 桌面通知（Cmd+K / 快捷键配置）。 */}
      <GlobalShortcutHost
        ref={commandPaletteHostRef}
        scope="home"
        commands={commandPaletteCommands}
        terminalEnabled={isDesktop}
        onToggleTerminal={handleToggleTerminal}
        onToggleSessions={toggleSessionSidebar}
        onToggleConsole={() => togglePanel("cost")}
        onNewSession={handleNewSessionWithUsageReset}
      />

      {/* 内置桌面终端（xterm.js）——仅 Tauri 环境可用。 */}
      {isDesktop ? (
        <TerminalPanel open={isTerminalOpen} onToggle={handleToggleTerminal} />
      ) : null}
    </main>
  );
}
