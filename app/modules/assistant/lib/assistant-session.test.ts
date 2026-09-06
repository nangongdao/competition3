import { describe, expect, it } from "vitest";

import {
  createEmptyCleanupPlan,
  isActiveAssistantPhase,
  planModeSwitchCleanup,
  resolveModeSwitchActions,
  resolvePhaseAfterSwitch,
  runModeSwitchActions,
} from "./assistant-session";

describe("planModeSwitchCleanup", () => {
  it("returns an empty plan when the mode is unchanged", () => {
    expect(planModeSwitchCleanup("chat", "chat", true)).toEqual(
      createEmptyCleanupPlan(),
    );
    expect(planModeSwitchCleanup("realtime", "realtime", true)).toEqual(
      createEmptyCleanupPlan(),
    );
  });

  it("stops an open realtime connection when switching to chat", () => {
    expect(planModeSwitchCleanup("realtime", "chat", true)).toEqual({
      stopRealtime: true,
      cancelContinuousChatVoice: false,
      cancelChatVoiceRecording: false,
      cancelChatSpeech: false,
    });
    expect(planModeSwitchCleanup("realtime", "chat", false).stopRealtime).toBe(
      false,
    );
  });

  it("cancels chat voice and speech when switching to realtime", () => {
    expect(planModeSwitchCleanup("chat", "realtime", false)).toEqual({
      stopRealtime: false,
      cancelContinuousChatVoice: true,
      cancelChatVoiceRecording: true,
      cancelChatSpeech: true,
    });
  });
});

describe("runModeSwitchActions", () => {
  const noop = (): void => undefined;

  it("dispatches stop-realtime sequence in order when switching to chat", () => {
    const calls: string[] = [];
    const plan = planModeSwitchCleanup("realtime", "chat", true);

    runModeSwitchActions(resolveModeSwitchActions(plan, true), {
      stopRealtime: () => calls.push("stop-realtime"),
      setPhase: (phase) => calls.push(`set-phase:${phase}`),
      notifyStoppedRealtime: () => calls.push("notify"),
      cancelContinuousChatVoice: noop,
      cancelChatVoiceRecording: noop,
      cancelChatSpeech: noop,
    });

    expect(calls).toEqual([
      "stop-realtime",
      "set-phase:ready",
      "notify",
    ]);
  });

  it("runs chat voice cleanup handlers when switching to realtime", () => {
    const calls: string[] = [];
    const plan = planModeSwitchCleanup("chat", "realtime", false);

    runModeSwitchActions(resolveModeSwitchActions(plan, false), {
      stopRealtime: noop,
      setPhase: noop,
      notifyStoppedRealtime: noop,
      cancelContinuousChatVoice: () => calls.push("voice"),
      cancelChatVoiceRecording: () => calls.push("recording"),
      cancelChatSpeech: () => calls.push("speech"),
    });

    expect(calls).toEqual(["voice", "recording", "speech"]);
  });

  it("performs no handler calls for an empty action list", () => {
    const calls: string[] = [];
    const handlers = {
      stopRealtime: () => calls.push("stop"),
      setPhase: noop,
      notifyStoppedRealtime: () => calls.push("notify"),
      cancelContinuousChatVoice: () => calls.push("voice"),
      cancelChatVoiceRecording: () => calls.push("recording"),
      cancelChatSpeech: () => calls.push("speech"),
    };

    runModeSwitchActions([], handlers);

    expect(calls).toEqual([]);
  });
});

describe("resolveModeSwitchActions", () => {
  it("produces an ordered stop-realtime sequence when switching to chat", () => {
    const plan = planModeSwitchCleanup("realtime", "chat", true);
    expect(resolveModeSwitchActions(plan, true)).toEqual([
      { kind: "stop-realtime" },
      { kind: "set-phase", phase: "ready" },
      { kind: "notify-stopped-realtime" },
    ]);
    expect(resolveModeSwitchActions(plan, false)[1]).toEqual({
      kind: "set-phase",
      phase: "idle",
    });
  });

  it("appends chat voice cleanup actions when switching to realtime", () => {
    const plan = planModeSwitchCleanup("chat", "realtime", false);
    expect(resolveModeSwitchActions(plan, true)).toEqual([
      { kind: "cancel-continuous-chat-voice" },
      { kind: "cancel-chat-voice-recording" },
      { kind: "cancel-chat-speech" },
    ]);
  });

  it("returns no actions for an empty plan", () => {
    expect(resolveModeSwitchActions(createEmptyCleanupPlan(), true)).toEqual([]);
  });
});

describe("isActiveAssistantPhase", () => {
  it("treats only in-flight phases as active", () => {
    expect(isActiveAssistantPhase("connecting")).toBe(true);
    expect(isActiveAssistantPhase("listening")).toBe(true);
    expect(isActiveAssistantPhase("thinking")).toBe(true);
    expect(isActiveAssistantPhase("responding")).toBe(true);
    expect(isActiveAssistantPhase("idle")).toBe(false);
    expect(isActiveAssistantPhase("ready")).toBe(false);
    expect(isActiveAssistantPhase("error")).toBe(false);
  });
});

describe("resolvePhaseAfterSwitch", () => {
  it("returns ready when media is still granted", () => {
    expect(resolvePhaseAfterSwitch(true)).toBe("ready");
  });

  it("returns idle when media is no longer available", () => {
    expect(resolvePhaseAfterSwitch(false)).toBe("idle");
  });
});
