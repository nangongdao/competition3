import { describe, expect, it } from "vitest";

import {
  resolveWorkspaceGating,
  type WorkspaceGatingContext,
} from "@/modules/assistant/lib/workspace-gating";

const baseContext: WorkspaceGatingContext = {
  isChatMode: true,
  isRealtimeMode: false,
  hasMedia: true,
  hasActiveSession: false,
  assistantPhase: "idle",
  realtimeStatus: "idle",
  hasRealtimeConnection: false,
  isProviderConfigLoading: false,
  isChatSending: false,
  isChatVoiceRecording: false,
  isChatVoiceTranscribing: false,
  isContinuousChatVoiceEnabled: false,
  transcriptionIsRecordingSupported: true,
  isPushToTalkMode: true,
  isMicrophoneMuted: false,
};

const withRealtime = (
  overrides: Partial<WorkspaceGatingContext> = {},
): WorkspaceGatingContext => ({
  ...baseContext,
  isChatMode: false,
  isRealtimeMode: true,
  ...overrides,
});

describe("resolveWorkspaceGating", () => {
  it("Chat 模式空闲时允许发送文本、提问与语音输入，禁止会话启动/PTT", () => {
    const g = resolveWorkspaceGating(baseContext);

    expect(g.canSendTextMessage).toBe(true);
    expect(g.canVisualQuestion).toBe(true);
    expect(g.canToggleChatSpeechInput).toBe(true);
    expect(g.canStartContinuousChatVoice).toBe(true);
    expect(g.canStartSession).toBe(false);
    expect(g.canRealtimeTurn).toBe(false);
    expect(g.canPushToTalk).toBe(false);
  });

  it("Chat 模式发送中阻止发送/提问/语音/切换预算与模式", () => {
    const g = resolveWorkspaceGating({
      ...baseContext,
      isChatSending: true,
    });

    expect(g.canSendTextMessage).toBe(false);
    expect(g.canVisualQuestion).toBe(false);
    expect(g.canToggleChatSpeechInput).toBe(false);
    expect(g.canStartContinuousChatVoice).toBe(false);
    expect(g.canChangeResponseBudget).toBe(false);
    expect(g.canChangeProviderMode).toBe(false);
  });

  it("Chat 模式连续语音启用时禁用文本/提问/语音/预算/模式切换", () => {
    const g = resolveWorkspaceGating({
      ...baseContext,
      isContinuousChatVoiceEnabled: true,
    });

    expect(g.canSendTextMessage).toBe(false);
    expect(g.canVisualQuestion).toBe(false);
    expect(g.canStartContinuousChatVoice).toBe(false);
    expect(g.canChangeProviderMode).toBe(false);
    expect(g.canUseSessionButton).toBe(false);
  });

  it("Realtime 模式具备媒体且空闲时允许启动会话", () => {
    const g = resolveWorkspaceGating(withRealtime());

    expect(g.canStartSession).toBe(true);
    expect(g.canChangeTurnMode).toBe(true);
    expect(g.canUseSessionButton).toBe(true);
    expect(g.canChangeResponseBudget).toBe(true);
  });

  it("Realtime 模式已连接且监听时允许 PTT 与提问", () => {
    const g = resolveWorkspaceGating(
      withRealtime({
        hasRealtimeConnection: true,
        hasActiveSession: true,
        realtimeStatus: "connected",
        assistantPhase: "listening",
      }),
    );

    expect(g.canPushToTalk).toBe(true);
    expect(g.canRealtimeTurn).toBe(true);
    expect(g.canVisualQuestion).toBe(true);
    expect(g.canStopSession).toBe(true);
    expect(g.canStartSession).toBe(false);
  });

  it("Realtime 模式无媒体时禁止启动会话", () => {
    const g = resolveWorkspaceGating(withRealtime({ hasMedia: false }));

    expect(g.canStartSession).toBe(false);
    expect(g.canUseSessionButton).toBe(false);
  });

  it("Realtime 模式建立连接中禁止启动/切换模式/改轮次", () => {
    const g = resolveWorkspaceGating(
      withRealtime({
        realtimeStatus: "connecting",
      }),
    );

    expect(g.canStartSession).toBe(false);
    expect(g.canChangeProviderMode).toBe(false);
    expect(g.canChangeTurnMode).toBe(false);
  });

  it("PTT 模式下麦克风静音时禁止 PTT", () => {
    const g = resolveWorkspaceGating(
      withRealtime({
        hasRealtimeConnection: true,
        hasActiveSession: true,
        realtimeStatus: "connected",
        assistantPhase: "listening",
        isMicrophoneMuted: true,
      }),
    );

    expect(g.canPushToTalk).toBe(false);
  });

  it("PTT 模式关闭时禁止 PTT", () => {
    const g = resolveWorkspaceGating(
      withRealtime({
        hasRealtimeConnection: true,
        hasActiveSession: true,
        realtimeStatus: "connected",
        assistantPhase: "listening",
        isPushToTalkMode: false,
      }),
    );

    expect(g.canPushToTalk).toBe(false);
  });

  it("语音转录进行中时禁止切换语音输入", () => {
    const g = resolveWorkspaceGating({
      ...baseContext,
      isChatVoiceTranscribing: true,
    });

    expect(g.canToggleChatSpeechInput).toBe(false);
    expect(g.canStartContinuousChatVoice).toBe(false);
  });

  it("正在录音时允许继续开关语音输入（录音中可停止）", () => {
    const g = resolveWorkspaceGating({
      ...baseContext,
      isChatVoiceRecording: true,
    });

    expect(g.canToggleChatSpeechInput).toBe(true);
  });
});
