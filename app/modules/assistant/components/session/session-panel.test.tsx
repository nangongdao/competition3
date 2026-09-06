import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { SessionPanel } from "./session-panel";
import type { CostControlSetting } from "@/modules/assistant/types";
import type { UsageReport } from "@/modules/assistant/lib/cost-model";

function makeControl(overrides: Partial<CostControlSetting> = {}): CostControlSetting {
  return {
    label: "costItem.label",
    value: "costItem.value",
    detail: "costItem.detail",
    ...overrides,
  };
}

function makeUsageReport(): UsageReport {
  const emptyBuckets = {
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
  };
  return {
    turnCount: 0,
    totals: emptyBuckets,
    lastTurn: null,
    estimatedCostUsd: 0,
    turns: [],
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    hasMedia: true,
    assistantPhase: "idle" as const,
    mediaStatus: "granted" as const,
    isChatMode: true,
    providerMode: "chat" as const,
    realtimeStatus: "idle" as const,
    providerDetail: "providerDetail",
    visibleError: undefined,
    visionCapability: "multi-image" as const,
    isProviderConfigLoading: false,
    onRequestAccess: () => undefined,
    onStartSession: () => undefined,
    canUseSessionButton: true,
    startSessionLabel: "session.start",
    isPushToTalkActive: false,
    canPushToTalk: true,
    pushToTalkLabel: "session.ptt",
    pushToTalkTitle: "session.pttTitle",
    onPushToTalkPointerDown: () => undefined,
    onPushToTalkPointerEnd: () => undefined,
    onPushToTalkKeyDown: () => undefined,
    onPushToTalkKeyUp: () => undefined,
    canVisualQuestion: true,
    onVisualQuestion: () => undefined,
    onManualFrameCapture: () => undefined,
    canStopSession: true,
    onStopSession: () => undefined,
    onReleaseMedia: () => undefined,
    onPanelDragStart: () => undefined,
    onPanelDrop: () => undefined,
    costPanelVisible: true,
    costControls: [makeControl()],
    canChangeProviderMode: true,
    onProviderModeChange: () => undefined,
    isContinuousChatVoiceEnabled: false,
    canStartContinuousChatVoice: true,
    onContinuousChatVoiceClick: () => undefined,
    isChatVoiceRecording: false,
    canToggleChatSpeechInput: true,
    onChatSpeechInputClick: () => undefined,
    isChatVoiceBusy: false,
    isChatSending: false,
    chatVoiceSendMode: "auto-send" as const,
    onChatVoiceSendModeChange: () => undefined,
    chatSpeechStatusLabel: "status.autoSendVoice",
    canChangeTurnMode: true,
    turnDetectionMode: "server-vad" as const,
    onTurnDetectionModeChange: () => undefined,
    isMicrophoneMuted: false,
    onMicrophoneMutedChange: () => undefined,
    canChangeResponseBudget: true,
    responseBudget: "standard" as const,
    onResponseBudgetChange: () => undefined,
    isChatAnswerSpeechEnabled: false,
    isSpeechSynthesisSupported: true,
    onChatAnswerSpeechChange: () => undefined,
    isSpeechSpeaking: false,
    onCancelChatSpeech: () => undefined,
    responseMode: "audio-text" as const,
    onResponseModeChange: () => undefined,
    isAutoSampling: true,
    onAutoSamplingChange: () => undefined,
    samplingIntervalSeconds: 8,
    onSamplingIntervalChange: () => undefined,
    isFramePruningEnabled: false,
    onFramePruningChange: () => undefined,
    isTextHistorySummaryEnabled: false,
    onTextHistorySummaryChange: () => undefined,
    usageReport: makeUsageReport(),
    usageExport: {
      jsonDownloadUrl: "data:application/json;base64,AAAA",
      csvDownloadUrl: "data:text/csv;base64,AAAA",
      jsonFilename: "usage.json",
      csvFilename: "usage.csv",
    },
    sessionUsageExport: null,
    usagePanelVisible: true,
    skippedAutoFrameCount: 1,
    sampleWidth: 480,
    sampleHeight: 270,
    ...overrides,
  };
}

describe("SessionPanel", () => {
  it("渲染会话标题与相位状态", () => {
    const html = renderToStaticMarkup(
      <SessionPanel {...makeProps({ assistantPhase: "idle" })} />,
    );
    expect(html).toContain('id="assistant-title"');
    expect(html).toContain("session.title");
    expect(html).toContain("session.subtitle");
    expect(html).toContain('data-phase="idle"');
  });

  it("渲染媒体授权状态与连接状态", () => {
    const html = renderToStaticMarkup(
      <SessionPanel {...makeProps({ mediaStatus: "granted", hasMedia: true })} />,
    );
    expect(html).toContain("session.media");
    expect(html).toContain("labels.media.granted");
    expect(html).toContain("session.mediaReady");
    expect(html).toContain("session.connection");
  });

  it("Chat 模式展示 provider 模式，Realtime 模式展示连接状态", () => {
    const chatHtml = renderToStaticMarkup(
      <SessionPanel {...makeProps({ isChatMode: true, providerMode: "chat" })} />,
    );
    expect(chatHtml).toContain("labels.provider.chat");

    const realtimeHtml = renderToStaticMarkup(
      <SessionPanel
        {...makeProps({ isChatMode: false, realtimeStatus: "connected" })}
      />,
    );
    expect(realtimeHtml).toContain("labels.realtime.connected");
  });

  it("有 visibleError 时渲染错误提示", () => {
    const html = renderToStaticMarkup(
      <SessionPanel {...makeProps({ visibleError: "出错了" })} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("出错了");
  });

  it("无 visibleError 时不渲染错误提示", () => {
    const html = renderToStaticMarkup(
      <SessionPanel {...makeProps({ visibleError: undefined })} />,
    );
    expect(html).not.toContain('role="alert"');
  });

  it("渲染视觉能力徽章（multi-image）", () => {
    const html = renderToStaticMarkup(
      <SessionPanel {...makeProps({ visionCapability: "multi-image" })} />,
    );
    expect(html).toContain('data-vision-capability="multi-image"');
    expect(html).toContain('data-badge-level="success"');
    expect(html).toContain("labels.vision.multiImage");
  });

  it("视觉能力为 none 且 Chat 模式时渲染推荐切换提示", () => {
    const html = renderToStaticMarkup(
      <SessionPanel
        {...makeProps({ visionCapability: "none", isChatMode: true })}
      />,
    );
    expect(html).toContain('role="note"');
    expect(html).toContain("visionNotice.unavailable");
    expect(html).toContain("visionNotice.suggestion");
  });

  it("渲染授权/重新授权按钮（有媒体时 reauthorize）", () => {
    const html = renderToStaticMarkup(
      <SessionPanel {...makeProps({ hasMedia: true })} />,
    );
    expect(html).toContain("session.reauthorize");
    // 开始会话按钮
    expect(html).toContain("session.start");
  });

  it("canUseSessionButton 为 false 时禁用开始会话按钮", () => {
    const html = renderToStaticMarkup(
      <SessionPanel {...makeProps({ canUseSessionButton: false })} />,
    );
    expect(html).toContain("session.start");
    // 至少有一个 disabled 按钮
    expect(html).toContain('disabled=""');
  });

  it("渲染推挤通话按钮 data-active 状态", () => {
    const html = renderToStaticMarkup(
      <SessionPanel {...makeProps({ isPushToTalkActive: true })} />,
    );
    expect(html).toContain('data-active="true"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("session.ptt");
  });

  it("无媒体时禁用采样帧与释放设备按钮", () => {
    const html = renderToStaticMarkup(
      <SessionPanel {...makeProps({ hasMedia: false })} />,
    );
    expect(html).toContain("session.authorize");
    expect(html).toContain("session.sampleFrame");
    expect(html).toContain("session.closeDevice");
  });

  it("渲染成本控制面板与用量面板（Chat 模式用 Chat 用量标签）", () => {
    const html = renderToStaticMarkup(
      <SessionPanel
        {...makeProps({ costPanelVisible: true, usagePanelVisible: true })}
      />,
    );
    expect(html).toContain('aria-label="costControl.panel"');
    expect(html).toContain('aria-label="usage.panelChat"');
  });

  it("Realtime 模式渲染 Realtime 用量标签", () => {
    const html = renderToStaticMarkup(
      <SessionPanel
        {...makeProps({
          isChatMode: false,
          costPanelVisible: true,
          usagePanelVisible: true,
        })}
      />,
    );
    expect(html).toContain('aria-label="usage.panel"');
  });
});
