import { describe, expect, it } from "vitest";

import { resolveWorkspaceDerivedState } from "@/modules/assistant/lib/workspace-derived-state";
import type { WorkspaceDerivedStateContext } from "@/modules/assistant/lib/workspace-derived-state";

function makeCtx(
  overrides: Partial<WorkspaceDerivedStateContext> = {},
): WorkspaceDerivedStateContext {
  return {
    mediaStatus: "granted",
    hasStream: true,
    assistantPhase: "listening",
    realtimeStatus: "connected",
    providerMode: "realtime",
    transcriptionStatus: "idle",
    turnDetectionMode: "server-vad",
    responseBudget: "standard",
    ...overrides,
  };
}

describe("resolveWorkspaceDerivedState", () => {
  it("媒体已授权且有流 → hasMedia 为 true，否则为 false", () => {
    expect(resolveWorkspaceDerivedState(makeCtx()).hasMedia).toBe(true);
    expect(
      resolveWorkspaceDerivedState(makeCtx({ mediaStatus: "granted", hasStream: false }))
        .hasMedia,
    ).toBe(false);
    expect(
      resolveWorkspaceDerivedState(makeCtx({ mediaStatus: "requesting", hasStream: true }))
        .hasMedia,
    ).toBe(false);
    expect(
      resolveWorkspaceDerivedState(makeCtx({ mediaStatus: "denied", hasStream: true }))
        .hasMedia,
    ).toBe(false);
  });

  it("hasActiveSession 只在活跃相位为 true（复用 isActiveAssistantPhase）", () => {
    expect(resolveWorkspaceDerivedState(makeCtx({ assistantPhase: "listening" })).hasActiveSession).toBe(true);
    expect(resolveWorkspaceDerivedState(makeCtx({ assistantPhase: "connecting" })).hasActiveSession).toBe(true);
    expect(resolveWorkspaceDerivedState(makeCtx({ assistantPhase: "thinking" })).hasActiveSession).toBe(true);
    expect(resolveWorkspaceDerivedState(makeCtx({ assistantPhase: "responding" })).hasActiveSession).toBe(true);
    expect(resolveWorkspaceDerivedState(makeCtx({ assistantPhase: "idle" })).hasActiveSession).toBe(false);
    expect(resolveWorkspaceDerivedState(makeCtx({ assistantPhase: "ready" })).hasActiveSession).toBe(false);
    expect(resolveWorkspaceDerivedState(makeCtx({ assistantPhase: "error" })).hasActiveSession).toBe(false);
  });

  it("hasRealtimeConnection 只在 connected 为 true", () => {
    expect(resolveWorkspaceDerivedState(makeCtx({ realtimeStatus: "connected" })).hasRealtimeConnection).toBe(true);
    expect(resolveWorkspaceDerivedState(makeCtx({ realtimeStatus: "connecting" })).hasRealtimeConnection).toBe(false);
    expect(resolveWorkspaceDerivedState(makeCtx({ realtimeStatus: "idle" })).hasRealtimeConnection).toBe(false);
    expect(resolveWorkspaceDerivedState(makeCtx({ realtimeStatus: "error" })).hasRealtimeConnection).toBe(false);
  });

  it("isChatMode / isRealtimeMode 按 providerMode 推导", () => {
    const chat = resolveWorkspaceDerivedState(makeCtx({ providerMode: "chat" }));
    expect(chat.isChatMode).toBe(true);
    expect(chat.isRealtimeMode).toBe(false);

    const realtime = resolveWorkspaceDerivedState(makeCtx({ providerMode: "realtime" }));
    expect(realtime.isRealtimeMode).toBe(true);
    expect(realtime.isChatMode).toBe(false);
  });

  it("语音转写状态推导 recording / transcribing / busy", () => {
    const idle = resolveWorkspaceDerivedState(makeCtx({ transcriptionStatus: "idle" }));
    expect(idle.isChatVoiceRecording).toBe(false);
    expect(idle.isChatVoiceTranscribing).toBe(false);
    expect(idle.isChatVoiceBusy).toBe(false);

    const recording = resolveWorkspaceDerivedState(makeCtx({ transcriptionStatus: "recording" }));
    expect(recording.isChatVoiceRecording).toBe(true);
    expect(recording.isChatVoiceBusy).toBe(true);

    const transcribing = resolveWorkspaceDerivedState(makeCtx({ transcriptionStatus: "transcribing" }));
    expect(transcribing.isChatVoiceTranscribing).toBe(true);
    expect(transcribing.isChatVoiceBusy).toBe(true);

    const error = resolveWorkspaceDerivedState(makeCtx({ transcriptionStatus: "error" }));
    expect(error.isChatVoiceBusy).toBe(false);
  });

  it("activeTurnDetectionMode / activeResponseBudget 优先取 costPolicy，缺省回落用户配置", () => {
    const withCostPolicy = resolveWorkspaceDerivedState(
      makeCtx({
        turnDetectionMode: "server-vad",
        responseBudget: "standard",
        costPolicyTurnDetectionMode: "push-to-talk",
        costPolicyResponseBudget: "brief",
      }),
    );
    expect(withCostPolicy.activeTurnDetectionMode).toBe("push-to-talk");
    expect(withCostPolicy.activeResponseBudget).toBe("brief");

    const withoutCostPolicy = resolveWorkspaceDerivedState(
      makeCtx({ turnDetectionMode: "push-to-talk", responseBudget: "detailed" }),
    );
    expect(withoutCostPolicy.activeTurnDetectionMode).toBe("push-to-talk");
    expect(withoutCostPolicy.activeResponseBudget).toBe("detailed");
  });

  it("isPushToTalkMode 只在 activeTurnDetectionMode 为 push-to-talk 时为 true", () => {
    expect(
      resolveWorkspaceDerivedState(makeCtx({ costPolicyTurnDetectionMode: "push-to-talk" }))
        .isPushToTalkMode,
    ).toBe(true);
    expect(
      resolveWorkspaceDerivedState(makeCtx({ turnDetectionMode: "server-vad" })).isPushToTalkMode,
    ).toBe(false);
    expect(
      resolveWorkspaceDerivedState(makeCtx({ costPolicyTurnDetectionMode: "server-vad" }))
        .isPushToTalkMode,
    ).toBe(false);
  });
});
