import { describe, expect, it } from "vitest";

import { resolveWorkspaceControlAction } from "./workspace-controls";

describe("resolveWorkspaceControlAction", () => {
  describe("布尔开关", () => {
    it("auto-sampling 透传 checked", () => {
      expect(resolveWorkspaceControlAction({ kind: "auto-sampling", checked: true }))
        .toEqual({ kind: "set-auto-sampling", enabled: true });
      expect(resolveWorkspaceControlAction({ kind: "auto-sampling", checked: false }))
        .toEqual({ kind: "set-auto-sampling", enabled: false });
    });

    it("frame-pruning 透传 checked", () => {
      expect(resolveWorkspaceControlAction({ kind: "frame-pruning", checked: true }))
        .toEqual({ kind: "set-frame-pruning", enabled: true });
      expect(resolveWorkspaceControlAction({ kind: "frame-pruning", checked: false }))
        .toEqual({ kind: "set-frame-pruning", enabled: false });
    });

    it("microphone-muted 透传 checked", () => {
      expect(resolveWorkspaceControlAction({ kind: "microphone-muted", checked: true }))
        .toEqual({ kind: "set-microphone-muted", muted: true });
      expect(resolveWorkspaceControlAction({ kind: "microphone-muted", checked: false }))
        .toEqual({ kind: "set-microphone-muted", muted: false });
    });

    it("chat-answer-speech 透传 checked", () => {
      expect(resolveWorkspaceControlAction({ kind: "chat-answer-speech", checked: true }))
        .toEqual({ kind: "set-chat-answer-speech", enabled: true });
      expect(resolveWorkspaceControlAction({ kind: "chat-answer-speech", checked: false }))
        .toEqual({ kind: "set-chat-answer-speech", enabled: false });
    });

    it("text-history-summary 透传 checked", () => {
      expect(resolveWorkspaceControlAction({ kind: "text-history-summary", checked: true }))
        .toEqual({ kind: "set-text-history-summary", enabled: true });
      expect(resolveWorkspaceControlAction({ kind: "text-history-summary", checked: false }))
        .toEqual({ kind: "set-text-history-summary", enabled: false });
    });
  });

  describe("单选 / 下拉校验", () => {
    it("turn-detection-mode 合法值解析", () => {
      expect(resolveWorkspaceControlAction({ kind: "turn-detection-mode", value: "server-vad" }))
        .toEqual({ kind: "set-turn-detection-mode", mode: "server-vad" });
      expect(resolveWorkspaceControlAction({ kind: "turn-detection-mode", value: "push-to-talk" }))
        .toEqual({ kind: "set-turn-detection-mode", mode: "push-to-talk" });
    });

    it("turn-detection-mode 非法值 → noop", () => {
      expect(resolveWorkspaceControlAction({ kind: "turn-detection-mode", value: "unknown" }))
        .toEqual({ kind: "noop" });
    });

    it("response-budget 合法值解析", () => {
      expect(resolveWorkspaceControlAction({ kind: "response-budget", value: "brief" }))
        .toEqual({ kind: "set-response-budget", budget: "brief" });
      expect(resolveWorkspaceControlAction({ kind: "response-budget", value: "standard" }))
        .toEqual({ kind: "set-response-budget", budget: "standard" });
      expect(resolveWorkspaceControlAction({ kind: "response-budget", value: "detailed" }))
        .toEqual({ kind: "set-response-budget", budget: "detailed" });
    });

    it("response-budget 非法值 → noop", () => {
      expect(resolveWorkspaceControlAction({ kind: "response-budget", value: "ultra" }))
        .toEqual({ kind: "noop" });
    });

    it("chat-voice-send-mode 合法值解析", () => {
      expect(resolveWorkspaceControlAction({ kind: "chat-voice-send-mode", value: "auto-send" }))
        .toEqual({ kind: "set-chat-voice-send-mode", mode: "auto-send" });
      expect(resolveWorkspaceControlAction({ kind: "chat-voice-send-mode", value: "review" }))
        .toEqual({ kind: "set-chat-voice-send-mode", mode: "review" });
    });

    it("chat-voice-send-mode 非法值 → noop", () => {
      expect(resolveWorkspaceControlAction({ kind: "chat-voice-send-mode", value: "batch" }))
        .toEqual({ kind: "noop" });
    });
  });

  describe("响应模式映射", () => {
    it("checked=true → text-only", () => {
      expect(resolveWorkspaceControlAction({ kind: "response-mode", checked: true }))
        .toEqual({ kind: "set-response-mode", mode: "text-only" });
    });

    it("checked=false → audio-text", () => {
      expect(resolveWorkspaceControlAction({ kind: "response-mode", checked: false }))
        .toEqual({ kind: "set-response-mode", mode: "audio-text" });
    });
  });

  describe("文本 / 数值", () => {
    it("text-draft 透传 value", () => {
      expect(resolveWorkspaceControlAction({ kind: "text-draft", value: "你好" }))
        .toEqual({ kind: "set-text-draft", value: "你好" });
    });

    it("sampling-interval 合法数字解析", () => {
      expect(resolveWorkspaceControlAction({ kind: "sampling-interval", value: "8" }))
        .toEqual({ kind: "set-sampling-interval", seconds: 8 });
    });

    it("sampling-interval 越界 → noop", () => {
      expect(resolveWorkspaceControlAction({ kind: "sampling-interval", value: "0" }))
        .toEqual({ kind: "noop" });
      expect(resolveWorkspaceControlAction({ kind: "sampling-interval", value: "100" }))
        .toEqual({ kind: "noop" });
    });

    it("sampling-interval 非数字 → noop", () => {
      expect(resolveWorkspaceControlAction({ kind: "sampling-interval", value: "abc" }))
        .toEqual({ kind: "noop" });
    });
  });
});
