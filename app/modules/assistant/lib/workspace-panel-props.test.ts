import { describe, expect, it } from "vitest";

import {
  buildWorkspacePanelProps,
  buildSessionPanelProps,
  buildVisionColumnProps,
} from "@/modules/assistant/lib/workspace-panel-props";
import type { WorkspacePanelPropsInput } from "@/modules/assistant/lib/workspace-panel-props";
import type { AssistantPhase, MediaPermissionStatus } from "@/modules/assistant/types";

const NOOP = () => undefined;
const NOOP_EVENT = () => undefined;

function makeInput(overrides: Partial<WorkspacePanelPropsInput> = {}): WorkspacePanelPropsInput {
  return {
    // ── 媒体 ──
    hasMedia: true,
    mediaStatus: "granted" as MediaPermissionStatus,
    videoRef: { current: null },
    audioRef: { current: null },
    canvasRef: { current: null },
    isMicrophoneMuted: false,
    onMicrophoneMutedChange: NOOP_EVENT,
    microphoneStatusLabel: "labels.mic.on",
    // ── 会话 / 阶段 ──
    assistantPhase: "idle" as AssistantPhase,
    isChatMode: true,
    providerMode: "chat",
    realtimeStatus: "idle",
    hasRealtimeConnection: false,
    isProviderConfigLoading: false,
    providerDetail: "providerDetail",
    visionCapability: "multi-image",
    visibleError: undefined,
    // ── 会话启停 / 访问 ──
    onRequestAccess: NOOP,
    onStartSession: NOOP,
    canUseSessionButton: true,
    startSessionLabel: "labels.start",
    canStopSession: false,
    onStopSession: NOOP,
    onReleaseMedia: NOOP,
    // ── PTT ──
    isPushToTalkActive: false,
    canPushToTalk: false,
    pushToTalkLabel: "labels.ptt",
    pushToTalkTitle: "labels.pttTitle",
    onPushToTalkPointerDown: NOOP_EVENT,
    onPushToTalkPointerEnd: NOOP_EVENT,
    onPushToTalkKeyDown: NOOP_EVENT,
    onPushToTalkKeyUp: NOOP_EVENT,
    // ── 视觉提问 / 手动采样 ──
    canVisualQuestion: true,
    onVisualQuestion: NOOP,
    onManualFrameCapture: NOOP,
    // ── 面板拖拽 ──
    onPanelDragStart: NOOP_EVENT,
    onPanelDrop: NOOP_EVENT,
    // ── 布局可见性 ──
    panelVisibility: { cost: true, usage: true, visualContext: true },
    // ── 成本 / Provider 切换 ──
    costControls: [],
    canChangeProviderMode: true,
    onProviderModeChange: NOOP_EVENT,
    // ── 连续语音 ──
    isContinuousChatVoiceEnabled: false,
    canStartContinuousChatVoice: false,
    onContinuousChatVoiceClick: NOOP,
    isChatVoiceRecording: false,
    canToggleChatSpeechInput: true,
    onChatSpeechInputClick: NOOP,
    isChatVoiceBusy: false,
    isChatSending: false,
    chatVoiceSendMode: "auto-send",
    onChatVoiceSendModeChange: NOOP_EVENT,
    chatSpeechStatusLabel: "labels.speech",
    // ── 回合检测 / 响应预算 / 朗读 ──
    canChangeTurnMode: false,
    turnDetectionMode: "server-vad",
    onTurnDetectionModeChange: NOOP_EVENT,
    canChangeResponseBudget: true,
    responseBudget: "standard",
    onResponseBudgetChange: NOOP_EVENT,
    isChatAnswerSpeechEnabled: false,
    isSpeechSynthesisSupported: true,
    onChatAnswerSpeechChange: NOOP_EVENT,
    isSpeechSpeaking: false,
    onCancelChatSpeech: NOOP,
    responseMode: "text-only",
    onResponseModeChange: NOOP_EVENT,
    // ── 自动采样 / 帧剪枝 / 文本历史摘要 ──
    isAutoSampling: true,
    onAutoSamplingChange: NOOP_EVENT,
    samplingIntervalSeconds: 5,
    onSamplingIntervalChange: NOOP_EVENT,
    isFramePruningEnabled: true,
    onFramePruningChange: NOOP_EVENT,
    isTextHistorySummaryEnabled: false,
    onTextHistorySummaryChange: NOOP_EVENT,
    // ── 用量 ──
    usageReport: {
      turnCount: 0,
      totals: {
        inputTokens: 0,
        inputTextTokens: 0,
        inputAudioTokens: 0,
        inputImageTokens: 0,
        cachedInputTokens: 0,
        cachedTextTokens: 0,
        cachedAudioTokens: 0,
        cachedImageTokens: 0,
        outputTokens: 0,
        outputTextTokens: 0,
        outputAudioTokens: 0,
      },
      lastTurn: null,
      estimatedCostUsd: 0,
      turns: [],
    },
    usageExport: {
      jsonDownloadUrl: "data:application/json",
      csvDownloadUrl: "data:text/csv",
      jsonFilename: "usage.json",
      csvFilename: "usage.csv",
    },
    skippedAutoFrameCount: 3,
    sampleWidth: 640,
    sampleHeight: 360,
    // ── 转写 / 会话清理 / 导出 ──
    transcript: [],
    retryableEntryIds: new Set(),
    isRetryDisabled: false,
    onRetry: () => undefined,
    isClearConfirmationVisible: false,
    onRequestClear: NOOP,
    onCancelClear: NOOP,
    onConfirmClear: NOOP,
    onExport: () => undefined,
    // ── 文本消息 ──
    textDraft: "",
    canSendTextMessage: true,
    onTextDraftChange: NOOP_EVENT,
    onTextMessageSubmit: NOOP_EVENT,
    // ── 帧统计 / 遥测 ──
    lastFrameDataUrl: null,
    sampledFrameCount: 4,
    sentFrameCount: 2,
    prunedFrameCount: 1,
    // ── 视觉上下文 / 场景记忆 / 融合 / 文本历史摘要展示 ──
    spatialAnnotations: [],
    sceneMemoryStats: { count: 1, savingsTokens: 10 },
    fusionStats: { count: 2, savedCalls: 1, imageTokens: 50 },
    textHistoryStats: { summarizedEntryCount: 3, savedTextTokens: 120 },
    frameTelemetryStats: {
      averageMs: 0,
      maxMs: 0,
      lastMs: 0,
      count: 0,
    },
    sampleRateStats: {
      averageFps: 0,
      lastIntervalMs: 0,
      lastFps: 0,
      tickCount: 0,
    },
    ...overrides,
  };
}

describe("buildWorkspacePanelProps — sessionPanelProps", () => {
  it("maps core media / session fields to SessionPanel props", () => {
    const { sessionPanelProps } = buildWorkspacePanelProps(makeInput());

    expect(sessionPanelProps.hasMedia).toBe(true);
    expect(sessionPanelProps.mediaStatus).toBe("granted");
    expect(sessionPanelProps.assistantPhase).toBe("idle");
    expect(sessionPanelProps.isChatMode).toBe(true);
    expect(sessionPanelProps.providerMode).toBe("chat");
    expect(sessionPanelProps.realtimeStatus).toBe("idle");
    expect(sessionPanelProps.providerDetail).toBe("providerDetail");
    expect(sessionPanelProps.visionCapability).toBe("multi-image");
    expect(sessionPanelProps.isProviderConfigLoading).toBe(false);
  });

  it("exposes the visibleError only when provided", () => {
    const noError = buildWorkspacePanelProps(makeInput());
    expect(noError.sessionPanelProps.visibleError).toBeUndefined();

    const withError = buildWorkspacePanelProps(
      makeInput({ visibleError: "err.message" }),
    );
    expect(withError.sessionPanelProps.visibleError).toBe("err.message");
  });

  it("maps gating / start-stop / access callbacks and labels", () => {
    const input = makeInput({
      canUseSessionButton: true,
      startSessionLabel: "labels.start",
      canStopSession: false,
      canPushToTalk: false,
      canVisualQuestion: true,
    });
    const { sessionPanelProps } = buildWorkspacePanelProps(input);

    expect(sessionPanelProps.canUseSessionButton).toBe(true);
    expect(sessionPanelProps.startSessionLabel).toBe("labels.start");
    expect(sessionPanelProps.canStopSession).toBe(false);
    expect(sessionPanelProps.canPushToTalk).toBe(false);
    expect(sessionPanelProps.canVisualQuestion).toBe(true);
    // 回调透传：同一引用。
    expect(sessionPanelProps.onRequestAccess).toBe(input.onRequestAccess);
    expect(sessionPanelProps.onStartSession).toBe(input.onStartSession);
    expect(sessionPanelProps.onStopSession).toBe(input.onStopSession);
    expect(sessionPanelProps.onReleaseMedia).toBe(input.onReleaseMedia);
  });

  it("maps chat-voice, turn-mode, budget and response controls", () => {
    const input = makeInput({
      isChatVoiceRecording: true,
      canToggleChatSpeechInput: true,
      canChangeTurnMode: true,
      canChangeResponseBudget: true,
      responseMode: "text-only",
    });
    const { sessionPanelProps } = buildWorkspacePanelProps(input);

    expect(sessionPanelProps.isChatVoiceRecording).toBe(true);
    expect(sessionPanelProps.canToggleChatSpeechInput).toBe(true);
    expect(sessionPanelProps.onChatSpeechInputClick).toBe(input.onChatSpeechInputClick);
    expect(sessionPanelProps.canChangeTurnMode).toBe(true);
    expect(sessionPanelProps.turnDetectionMode).toBe(input.turnDetectionMode);
    expect(sessionPanelProps.canChangeResponseBudget).toBe(true);
    expect(sessionPanelProps.responseBudget).toBe(input.responseBudget);
    expect(sessionPanelProps.responseMode).toBe("text-only");
  });

  it("maps auto-sampling / pruning / text-history summary switches", () => {
    const input = makeInput({
      isAutoSampling: true,
      samplingIntervalSeconds: 5,
      isFramePruningEnabled: true,
      isTextHistorySummaryEnabled: true,
    });
    const { sessionPanelProps } = buildWorkspacePanelProps(input);

    expect(sessionPanelProps.isAutoSampling).toBe(true);
    expect(sessionPanelProps.onAutoSamplingChange).toBe(input.onAutoSamplingChange);
    expect(sessionPanelProps.samplingIntervalSeconds).toBe(5);
    expect(sessionPanelProps.isFramePruningEnabled).toBe(true);
    expect(sessionPanelProps.isTextHistorySummaryEnabled).toBe(true);
  });

  it("maps usage report / export and sample size", () => {
    const input = makeInput({
      usageReport: makeInput().usageReport,
      usageExport: {
        jsonDownloadUrl: "data:application/json",
        csvDownloadUrl: "data:text/csv",
        jsonFilename: "usage.json",
        csvFilename: "usage.csv",
      },
      skippedAutoFrameCount: 3,
      sampleWidth: 640,
      sampleHeight: 360,
      budgetUsd: 5,
      onBudgetSet: () => undefined,
    });
    const { sessionPanelProps } = buildWorkspacePanelProps(input);

    expect(sessionPanelProps.usageReport).toBe(input.usageReport);
    expect(sessionPanelProps.usageExport).toBe(input.usageExport);
    expect(sessionPanelProps.skippedAutoFrameCount).toBe(3);
    expect(sessionPanelProps.sampleWidth).toBe(640);
    expect(sessionPanelProps.sampleHeight).toBe(360);
    expect(sessionPanelProps.budgetUsd).toBe(5);
    expect(sessionPanelProps.onBudgetSet).toBe(input.onBudgetSet);
  });

  it("defaults budget to null when unset", () => {
    const { sessionPanelProps } = buildWorkspacePanelProps(makeInput());
    expect(sessionPanelProps.budgetUsd).toBeNull();
    expect(sessionPanelProps.onBudgetSet).toBeUndefined();
  });

  it("reads panel visibility flags for cost / usage panels", () => {
    const { sessionPanelProps } = buildWorkspacePanelProps(
      makeInput({ panelVisibility: { cost: false, usage: true, visualContext: false } }),
    );

    expect(sessionPanelProps.costPanelVisible).toBe(false);
    expect(sessionPanelProps.usagePanelVisible).toBe(true);
  });
});

describe("buildWorkspacePanelProps — visionColumnProps", () => {
  it("maps media refs and shared state", () => {
    const input = makeInput({
      isMicrophoneMuted: true,
      microphoneStatusLabel: "labels.mic.off",
    });
    const { visionColumnProps } = buildWorkspacePanelProps(input);

    expect(visionColumnProps.videoRef).toBe(input.videoRef);
    expect(visionColumnProps.audioRef).toBe(input.audioRef);
    expect(visionColumnProps.canvasRef).toBe(input.canvasRef);
    expect(visionColumnProps.hasMedia).toBe(true);
    expect(visionColumnProps.isMicrophoneMuted).toBe(true);
    expect(visionColumnProps.microphoneStatusLabel).toBe("labels.mic.off");
    expect(visionColumnProps.phase).toBe(input.assistantPhase);
  });

  it("maps transcript / retry / clear / export wiring", () => {
    const input = makeInput({
      transcript: [{ id: "1", speaker: "user", text: "hi", createdAt: 0 }],
      isRetryDisabled: true,
      isClearConfirmationVisible: true,
    });
    const { visionColumnProps } = buildWorkspacePanelProps(input);

    expect(visionColumnProps.transcript).toHaveLength(1);
    expect(visionColumnProps.retryableEntryIds).toBe(input.retryableEntryIds);
    expect(visionColumnProps.isRetryDisabled).toBe(true);
    expect(visionColumnProps.isClearConfirmationVisible).toBe(true);
    expect(visionColumnProps.onRetry).toBe(input.onRetry);
    expect(visionColumnProps.onRequestClear).toBe(input.onRequestClear);
    expect(visionColumnProps.onCancelClear).toBe(input.onCancelClear);
    expect(visionColumnProps.onConfirmClear).toBe(input.onConfirmClear);
    expect(visionColumnProps.onExport).toBe(input.onExport);
  });

  it("maps text message state and send / draft handlers", () => {
    const input = makeInput({
      textDraft: "hello",
      canSendTextMessage: true,
    });
    const { visionColumnProps } = buildWorkspacePanelProps(input);

    expect(visionColumnProps.textDraft).toBe("hello");
    expect(visionColumnProps.canSendTextMessage).toBe(true);
    expect(visionColumnProps.onTextDraftChange).toBe(input.onTextDraftChange);
    expect(visionColumnProps.onTextMessageSubmit).toBe(input.onTextMessageSubmit);
    expect(visionColumnProps.isSending).toBe(input.isChatSending);
  });

  it("maps frame counters and telemetry", () => {
    const input = makeInput({
      lastFrameDataUrl: "data:image/png",
      sampledFrameCount: 4,
      sentFrameCount: 2,
      skippedAutoFrameCount: 3,
      prunedFrameCount: 1,
    });
    const { visionColumnProps } = buildWorkspacePanelProps(input);

    expect(visionColumnProps.lastFrameDataUrl).toBe("data:image/png");
    expect(visionColumnProps.sampledFrameCount).toBe(4);
    expect(visionColumnProps.sentFrameCount).toBe(2);
    expect(visionColumnProps.skippedAutoFrameCount).toBe(3);
    expect(visionColumnProps.prunedFrameCount).toBe(1);
    expect(visionColumnProps.frameTelemetryStats).toBe(input.frameTelemetryStats);
    expect(visionColumnProps.sampleRateStats).toBe(input.sampleRateStats);
  });

  it("aggregates scene-memory / fusion / text-history stats", () => {
    const input = makeInput({
      sceneMemoryStats: { count: 1, savingsTokens: 10 },
      fusionStats: { count: 2, savedCalls: 1, imageTokens: 50 },
      textHistoryStats: { summarizedEntryCount: 3, savedTextTokens: 120 },
    });
    const { visionColumnProps } = buildWorkspacePanelProps(input);

    expect(visionColumnProps.sceneMemoryCount).toBe(1);
    expect(visionColumnProps.sceneMemorySavingsTokens).toBe(10);
    expect(visionColumnProps.fusionCount).toBe(2);
    expect(visionColumnProps.fusionSavedCalls).toBe(1);
    expect(visionColumnProps.fusionImageTokens).toBe(50);
    expect(visionColumnProps.textHistorySummarizedCount).toBe(3);
    expect(visionColumnProps.textHistorySavedTokens).toBe(120);
  });

  it("reads visualContext panel visibility flag", () => {
    const { visionColumnProps } = buildWorkspacePanelProps(
      makeInput({ panelVisibility: { cost: true, usage: true, visualContext: false } }),
    );

    expect(visionColumnProps.visualContextVisible).toBe(false);
  });
});

describe("buildSessionPanelProps — 领域拆分子 builder 一致性与覆盖", () => {
  it("produces a session panel object identical to the top-level builder", () => {
    const input = makeInput();
    const topLevel = buildWorkspacePanelProps(input).sessionPanelProps;
    const domain = buildSessionPanelProps(input);

    expect(domain).toEqual(topLevel);
    expect(Object.keys(domain).length).toBeGreaterThan(50);
  });

  it("covers the media / session identity domain", () => {
    const props = buildSessionPanelProps(
      makeInput({ hasMedia: false, mediaStatus: "denied", visibleError: "boom" }),
    );

    expect(props.hasMedia).toBe(false);
    expect(props.mediaStatus).toBe("denied");
    expect(props.visibleError).toBe("boom");
    expect(props.isProviderConfigLoading).toBe(false);
  });

  it("covers the access / start-stop domain", () => {
    const input = makeInput({ canStopSession: true, startSessionLabel: "labels.stop" });
    const props = buildSessionPanelProps(input);

    expect(props.canStopSession).toBe(true);
    expect(props.startSessionLabel).toBe("labels.stop");
    expect(props.onStartSession).toBe(input.onStartSession);
    expect(props.onReleaseMedia).toBe(input.onReleaseMedia);
  });

  it("covers the PTT / visual-question / drag domain", () => {
    const input = makeInput({ canVisualQuestion: false, canPushToTalk: true });
    const props = buildSessionPanelProps(input);

    expect(props.canVisualQuestion).toBe(false);
    expect(props.canPushToTalk).toBe(true);
    expect(props.onPushToTalkPointerDown).toBe(input.onPushToTalkPointerDown);
    expect(props.onManualFrameCapture).toBe(input.onManualFrameCapture);
    expect(props.onPanelDragStart).toBe(input.onPanelDragStart);
  });

  it("covers the voice / provider / cost domain", () => {
    const input = makeInput({
      isChatVoiceRecording: true,
      canChangeProviderMode: false,
      panelVisibility: { cost: false, usage: true, visualContext: true },
    });
    const props = buildSessionPanelProps(input);

    expect(props.isChatVoiceRecording).toBe(true);
    expect(props.canChangeProviderMode).toBe(false);
    expect(props.costPanelVisible).toBe(false);
    expect(props.onContinuousChatVoiceClick).toBe(input.onContinuousChatVoiceClick);
  });

  it("covers the response / turn / budget / speech domain", () => {
    const input = makeInput({ responseBudget: "brief", isChatAnswerSpeechEnabled: true });
    const props = buildSessionPanelProps(input);

    expect(props.responseBudget).toBe("brief");
    expect(props.isChatAnswerSpeechEnabled).toBe(true);
    expect(props.onCancelChatSpeech).toBe(input.onCancelChatSpeech);
    expect(props.onResponseModeChange).toBe(input.onResponseModeChange);
  });

  it("covers the auto-sampling / pruning / text-history domain", () => {
    const input = makeInput({ isAutoSampling: false, isTextHistorySummaryEnabled: true });
    const props = buildSessionPanelProps(input);

    expect(props.isAutoSampling).toBe(false);
    expect(props.onAutoSamplingChange).toBe(input.onAutoSamplingChange);
    expect(props.isTextHistorySummaryEnabled).toBe(true);
    expect(props.onFramePruningChange).toBe(input.onFramePruningChange);
  });

  it("covers the usage / panel-visibility domain", () => {
    const input = makeInput({
      sampleWidth: 320,
      sampleHeight: 180,
      budgetUsd: 12,
      onBudgetSet: () => undefined,
      panelVisibility: { cost: true, usage: false, visualContext: true },
    });
    const props = buildSessionPanelProps(input);

    expect(props.sampleWidth).toBe(320);
    expect(props.sampleHeight).toBe(180);
    expect(props.usagePanelVisible).toBe(false);
    expect(props.usageExport).toBe(input.usageExport);
    expect(props.budgetUsd).toBe(12);
    expect(props.onBudgetSet).toBe(input.onBudgetSet);
  });
});

describe("buildVisionColumnProps — 领域拆分子 builder 一致性与覆盖", () => {
  it("produces a vision column object identical to the top-level builder", () => {
    const input = makeInput();
    const topLevel = buildWorkspacePanelProps(input).visionColumnProps;
    const domain = buildVisionColumnProps(input);

    expect(domain).toEqual(topLevel);
    expect(Object.keys(domain).length).toBeGreaterThan(30);
  });

  it("covers the media domain", () => {
    const input = makeInput({ isMicrophoneMuted: true });
    const props = buildVisionColumnProps(input);

    expect(props.videoRef).toBe(input.videoRef);
    expect(props.audioRef).toBe(input.audioRef);
    expect(props.canvasRef).toBe(input.canvasRef);
    expect(props.isMicrophoneMuted).toBe(true);
    expect(props.phase).toBe(input.assistantPhase);
  });

  it("covers the transcript / conversation-actions domain", () => {
    const input = makeInput({ isClearConfirmationVisible: true });
    const props = buildVisionColumnProps(input);

    expect(props.isClearConfirmationVisible).toBe(true);
    expect(props.onRequestClear).toBe(input.onRequestClear);
    expect(props.onConfirmClear).toBe(input.onConfirmClear);
    expect(props.onExport).toBe(input.onExport);
  });

  it("covers the text-message domain", () => {
    const input = makeInput({ textDraft: "hi", isChatSending: true });
    const props = buildVisionColumnProps(input);

    expect(props.textDraft).toBe("hi");
    expect(props.isSending).toBe(true);
    expect(props.onTextMessageSubmit).toBe(input.onTextMessageSubmit);
  });

  it("covers the frame / telemetry domain", () => {
    const input = makeInput({
      panelVisibility: { cost: true, usage: true, visualContext: true },
    });
    const props = buildVisionColumnProps(input);

    expect(props.visualContextVisible).toBe(true);
    expect(props.frameTelemetryStats).toBe(input.frameTelemetryStats);
    expect(props.sampleRateStats).toBe(input.sampleRateStats);
  });

  it("covers the scene-memory / fusion / text-history stats domain", () => {
    const props = buildVisionColumnProps(
      makeInput({
        sceneMemoryStats: { count: 5, savingsTokens: 50 },
        fusionStats: { count: 9, savedCalls: 3, imageTokens: 200 },
      }),
    );

    expect(props.sceneMemoryCount).toBe(5);
    expect(props.fusionCount).toBe(9);
    expect(props.fusionSavedCalls).toBe(3);
    expect(props.fusionImageTokens).toBe(200);
  });
});
