import { describe, expect, it } from "vitest";

import {
  REALTIME_IDLE_DISCONNECT_MS,
  REALTIME_IDLE_WARNING_MS,
  buildAudioBufferCommitEvent,
  buildConversationEvent,
  buildResponseCreateEvent,
  buildTextConversationEvent,
  getRealtimeIdleDecision,
  getSessionClientSecret,
  isRealtimeCostPolicy,
  isRealtimeSessionSuccessResponse,
  parseServerEvent,
  shouldEnableMicrophoneTrack,
} from "./realtime-protocol";

describe("buildResponseCreateEvent", () => {
  it("requests audio and text responses by default mode", () => {
    expect(buildResponseCreateEvent("audio-text")).toEqual({
      type: "response.create",
      response: { modalities: ["audio", "text"] },
    });
  });

  it("requests text-only responses when the mode is text-only", () => {
    expect(buildResponseCreateEvent("text-only")).toEqual({
      type: "response.create",
      response: { modalities: ["text"] },
    });
  });
});

describe("getRealtimeIdleDecision", () => {
  const lastActivityAt = 1_000;

  it("does nothing before the warning threshold", () => {
    expect(
      getRealtimeIdleDecision({
        now: lastActivityAt + REALTIME_IDLE_WARNING_MS - 1,
        lastActivityAt,
        hasWarned: false,
      }),
    ).toBe("none");
  });

  it("warns once after the warning threshold", () => {
    expect(
      getRealtimeIdleDecision({
        now: lastActivityAt + REALTIME_IDLE_WARNING_MS,
        lastActivityAt,
        hasWarned: false,
      }),
    ).toBe("warn");
  });

  it("does not repeat the warning in the same idle window", () => {
    expect(
      getRealtimeIdleDecision({
        now: lastActivityAt + REALTIME_IDLE_WARNING_MS + 1,
        lastActivityAt,
        hasWarned: true,
      }),
    ).toBe("none");
  });

  it("disconnects at the disconnect threshold", () => {
    expect(
      getRealtimeIdleDecision({
        now: lastActivityAt + REALTIME_IDLE_DISCONNECT_MS,
        lastActivityAt,
        hasWarned: false,
      }),
    ).toBe("disconnect");
  });

  it("treats future activity timestamps as active", () => {
    expect(
      getRealtimeIdleDecision({
        now: lastActivityAt - 1,
        lastActivityAt,
        hasWarned: false,
      }),
    ).toBe("none");
  });
});

describe("shouldEnableMicrophoneTrack", () => {
  it("keeps the mic disabled when muted", () => {
    expect(shouldEnableMicrophoneTrack("server-vad", true, false)).toBe(false);
  });

  it("enables the mic for server-vad when not muted", () => {
    expect(shouldEnableMicrophoneTrack("server-vad", false, false)).toBe(true);
  });

  it("enables the mic for push-to-talk only while held", () => {
    expect(shouldEnableMicrophoneTrack("push-to-talk", false, false)).toBe(false);
    expect(shouldEnableMicrophoneTrack("push-to-talk", false, true)).toBe(true);
  });
});

describe("event builders", () => {
  it("builds a visual conversation event with text and image parts", () => {
    expect(
      buildConversationEvent({
        frameDataUrl: "data:image/jpeg;base64,abc",
        prompt: "描述画面",
      }),
    ).toEqual({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "描述画面" },
          { type: "input_image", image_url: "data:image/jpeg;base64,abc" },
        ],
      },
    });
  });

  it("builds a text conversation event", () => {
    expect(buildTextConversationEvent("你好")).toEqual({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "你好" }],
      },
    });
  });

  it("builds an audio buffer commit event", () => {
    expect(buildAudioBufferCommitEvent()).toEqual({
      type: "input_audio_buffer.commit",
    });
  });
});

describe("protocol parsing and validation", () => {
  it("extracts a nested client secret", () => {
    expect(
      getSessionClientSecret({ client_secret: { value: "secret-value" } }),
    ).toBe("secret-value");
  });

  it("returns null for a missing client secret", () => {
    expect(getSessionClientSecret({})).toBeNull();
  });

  it("parses valid JSON events and rejects malformed input", () => {
    expect(parseServerEvent('{"type":"response.done"}')).toEqual({
      type: "response.done",
    });
    expect(parseServerEvent("not-json")).toBeNull();
  });

  it("validates a realtime cost policy", () => {
    expect(
      isRealtimeCostPolicy({
        visualContextMode: "manual",
        turnDetectionMode: "server-vad",
        responseBudget: "standard",
        maxResponseOutputTokens: 400,
        maxSessionSeconds: 600,
        frameUpload: "manual-or-interval",
      }),
    ).toBe(true);
    expect(isRealtimeCostPolicy({})).toBe(false);
  });

  it("validates a realtime session success response", () => {
    expect(
      isRealtimeSessionSuccessResponse({
        success: true,
        session: { client_secret: { value: "x" } },
        webrtcUrl: "https://example.test/sdp",
        costPolicy: {
          visualContextMode: "manual",
          turnDetectionMode: "server-vad",
          responseBudget: "standard",
          maxResponseOutputTokens: 400,
          maxSessionSeconds: 600,
          frameUpload: "manual-or-interval",
        },
      }),
    ).toBe(true);
    expect(isRealtimeSessionSuccessResponse({ success: false })).toBe(false);
  });
});
