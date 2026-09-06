import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { CostControlPanel } from "./cost-control-panel";
import type { CostControlSetting } from "@/modules/assistant/types";

function makeControl(overrides: Partial<CostControlSetting> = {}): CostControlSetting {
  return {
    label: "costItem.label",
    value: "costItem.value",
    detail: "costItem.detail",
    ...overrides,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    isVisible: true,
    costControls: [makeControl()],
    providerMode: "chat" as const,
    isChatMode: true,
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
    hasMedia: true,
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
    ...overrides,
  };
}

describe("CostControlPanel", () => {
  it("不可见时渲染 hidden 属性", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel {...makeProps({ isVisible: false })} />,
    );
    expect(html).toContain('hidden=""');
    expect(html).toContain('aria-label="costControl.panel"');
  });

  it("可见时不渲染 hidden 属性", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel {...makeProps()} />,
    );
    expect(html).not.toContain('hidden=""');
  });

  it("渲染成本控制项的 label / value / detail", () => {
    const controls = [
      makeControl({ label: "itemA", value: "42", detail: "detailA" }),
      makeControl({ label: "itemB", value: "7", detail: "detailB" }),
    ];
    const html = renderToStaticMarkup(
      <CostControlPanel {...makeProps({ costControls: controls })} />,
    );
    expect(html).toContain("itemA");
    expect(html).toContain("42");
    expect(html).toContain("detailA");
    expect(html).toContain("itemB");
    expect(html).toContain(">7<");
    expect(html).toContain("detailB");
  });

  it("渲染面板标题与 provider 模式选项", () => {
    const html = renderToStaticMarkup(<CostControlPanel {...makeProps()} />);
    expect(html).toContain("costControl.title");
    expect(html).toContain('aria-label="costControl.providerMode"');
    expect(html).toContain('value="chat"');
    expect(html).toContain('value="realtime"');
  });

  it("canChangeProviderMode 为 false 时禁用 provider fieldset", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel {...makeProps({ canChangeProviderMode: false })} />,
    );
    // provider fieldset 带 disabled 属性
    expect(html).toContain('disabled=""');
  });

  it("Chat 模式渲染连续语音 / 单次转写按钮与发送模式", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel {...makeProps({ isChatMode: true })} />,
    );
    expect(html).toContain('aria-label="costControl.chatVoiceInput"');
    expect(html).toContain("costControl.continuousChat");
    expect(html).toContain("costControl.singleVoice");
    // sendMode 以 legend 文本呈现
    expect(html).toContain("costControl.sendMode");
    expect(html).toContain('name="chat-voice-send-mode"');
    // 不渲染 Realtime 的 turn-mode / 麦克风静音
    expect(html).not.toContain('name="turn-detection-mode"');
  });

  it("Realtime 模式渲染 turn-detection 与麦克风静音控件", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel {...makeProps({ isChatMode: false })} />,
    );
    // turnMode 以 legend 文本呈现
    expect(html).toContain("costControl.turnMode");
    expect(html).toContain('name="turn-detection-mode"');
    expect(html).toContain('value="server-vad"');
    expect(html).toContain('value="push-to-talk"');
    // 麦克风静音 checkbox
    expect(html).toContain("costControl.muteMicrophone");
    // 不渲染 Chat 语音输入
    expect(html).not.toContain('aria-label="costControl.chatVoiceInput"');
  });

  it("无媒体时禁用麦克风静音与自动采样控件", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel {...makeProps({ isChatMode: false, hasMedia: false })} />,
    );
    // 麦克风静音 checkbox 带 disabled
    expect(html).toMatch(/type="checkbox"[^>]*disabled=""/);
    // 自动采样 checkbox 带 disabled
    expect(html).toMatch(/costControl\.autoVisualSampling/);
    expect(html).toMatch(/disabled=""/);
  });

  it("渲染响应长度预算选项与采样间隔范围", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel {...makeProps({ samplingIntervalSeconds: 8 })} />,
    );
    expect(html).toContain('aria-label="costControl.responseSettings"');
    expect(html).toContain('value="brief"');
    expect(html).toContain('value="standard"');
    expect(html).toContain('value="detailed"');
    expect(html).toContain('aria-label="costControl.visualSampling"');
    expect(html).toContain('type="range"');
    expect(html).toContain('value="8"');
    expect(html).toContain('min="5"');
    expect(html).toContain('max="20"');
  });

  it("Chat 模式渲染回答语音开关与停止朗读按钮", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel {...makeProps({ isChatMode: true })} />,
    );
    expect(html).toContain("costControl.chatNoSpeak");
    expect(html).toContain("costControl.stopSpeaking");
  });

  it("Chat 模式渲染文本历史摘要开关并反映勾选态", () => {
    const off = renderToStaticMarkup(
      <CostControlPanel
        {...makeProps({ isChatMode: true, isTextHistorySummaryEnabled: false })}
      />,
    );
    expect(off).toContain("costControl.textHistorySummary");

    const on = renderToStaticMarkup(
      <CostControlPanel
        {...makeProps({ isChatMode: true, isTextHistorySummaryEnabled: true })}
      />,
    );
    // 勾选态：checkbox 带 checked 属性。
    expect(on).toContain('checked=""');
  });

  it("连续语音开启时切换为停止按钮与录制状态图标", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel
        {...makeProps({
          isContinuousChatVoiceEnabled: true,
          isChatVoiceRecording: true,
        })}
      />,
    );
    expect(html).toContain("costControl.stopContinuous");
    expect(html).toContain("costControl.stopTranscribe");
  });

  it("语音合成不支持时明示降级提示", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel
        {...makeProps({ isChatMode: true, isSpeechSynthesisSupported: false })}
      />,
    );
    expect(html).toContain('role="note"');
    expect(html).toContain("costControl.speechSynthesisUnsupported");
  });

  it("语音合成支持时不渲染降级提示", () => {
    const html = renderToStaticMarkup(
      <CostControlPanel
        {...makeProps({ isChatMode: true, isSpeechSynthesisSupported: true })}
      />,
    );
    expect(html).not.toContain("costControl.speechSynthesisUnsupported");
  });
});
