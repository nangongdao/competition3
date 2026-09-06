import { describe, expect, it } from "vitest";

import {
  resolvePushToTalkStart,
  resolvePushToTalkStop,
  resolveSendText,
  resolveSendVisualContext,
} from "./realtime-send";

const RESPONSE_MODE = "audio-text" as const;

describe("resolveSendText", () => {
  it("rejects when the data channel is not ready", () => {
    expect(
      resolveSendText({ text: "你好", channelReady: false, responseMode: RESPONSE_MODE }),
    ).toEqual({ kind: "none" });
  });

  it("rejects whitespace-only text", () => {
    expect(
      resolveSendText({ text: "   ", channelReady: true, responseMode: RESPONSE_MODE }),
    ).toEqual({ kind: "none" });
  });

  it("builds a text conversation + response create event for non-empty text", () => {
    const result = resolveSendText({
      text: " 帮我看看  ",
      channelReady: true,
      responseMode: RESPONSE_MODE,
    });
    expect(result.kind).toBe("send");
    if (result.kind !== "send") return;
    expect(result.responseRequested).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      type: "conversation.item.create",
      item: { content: [{ type: "input_text", text: "帮我看看" }] },
    });
    expect(result.events[1]).toMatchObject({ type: "response.create" });
  });
});

describe("resolveSendVisualContext", () => {
  const base = {
    prompt: "看看这个画面",
    channelReady: true,
    responseMode: RESPONSE_MODE,
  };

  it("rejects when the data channel is not ready", () => {
    expect(
      resolveSendVisualContext({
        ...base,
        frameDataUrl: "data:image/jpeg;base64,abc",
        requestResponse: true,
        channelReady: false,
      }),
    ).toEqual({ kind: "none" });
  });

  it("rejects non-data-image frame urls", () => {
    expect(
      resolveSendVisualContext({
        ...base,
        frameDataUrl: "https://example.com/frame.jpg",
        requestResponse: true,
      }),
    ).toEqual({ kind: "none" });
  });

  it("builds a conversation event without a response when not requested", () => {
    const result = resolveSendVisualContext({
      ...base,
      frameDataUrl: "data:image/jpeg;base64,abc",
      requestResponse: false,
    });
    expect(result).toEqual({
      kind: "send",
      events: [
        expect.objectContaining({ type: "conversation.item.create" }),
      ],
      responseRequested: false,
    });
  });

  it("appends a response create event when requested", () => {
    const result = resolveSendVisualContext({
      ...base,
      frameDataUrl: "data:image/jpeg;base64,abc",
      requestResponse: true,
    });
    expect(result.kind).toBe("send");
    if (result.kind !== "send") return;
    expect(result.responseRequested).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events[1]).toMatchObject({ type: "response.create" });
  });
});

describe("resolvePushToTalkStart", () => {
  const connected = {
    status: "connected",
    turnDetectionMode: "push-to-talk",
    isMicrophoneMuted: false,
    isPushToTalkActive: false,
  } as const;

  it("denies when not connected", () => {
    expect(
      resolvePushToTalkStart({ ...connected, status: "idle" }),
    ).toEqual({ kind: "denied" });
  });

  it("denies when not in push-to-talk mode", () => {
    expect(
      resolvePushToTalkStart({ ...connected, turnDetectionMode: "server-vad" }),
    ).toEqual({ kind: "denied" });
  });

  it("denies while muted", () => {
    expect(
      resolvePushToTalkStart({ ...connected, isMicrophoneMuted: true }),
    ).toEqual({ kind: "denied" });
  });

  it("reports already-active without re-activating", () => {
    expect(
      resolvePushToTalkStart({ ...connected, isPushToTalkActive: true }),
    ).toEqual({ kind: "already-active" });
  });

  it("activates push-to-talk when conditions are met", () => {
    expect(resolvePushToTalkStart(connected)).toEqual({ kind: "activate" });
  });
});

describe("resolvePushToTalkStop", () => {
  const base = {
    turnDetectionMode: "push-to-talk",
    isPushToTalkActive: true,
    isMicrophoneMuted: false,
    channelReady: true,
    responseMode: RESPONSE_MODE,
  } as const;

  it("does nothing when not in push-to-talk mode", () => {
    expect(
      resolvePushToTalkStop({ ...base, turnDetectionMode: "server-vad" }),
    ).toEqual({ kind: "none" });
  });

  it("does nothing when not active", () => {
    expect(
      resolvePushToTalkStop({ ...base, isPushToTalkActive: false }),
    ).toEqual({ kind: "none" });
  });

  it("just deactivates when muted or channel is closed", () => {
    expect(
      resolvePushToTalkStop({ ...base, isMicrophoneMuted: true }),
    ).toEqual({ kind: "deactivate" });
    expect(
      resolvePushToTalkStop({ ...base, channelReady: false }),
    ).toEqual({ kind: "deactivate" });
  });

  it("deactivates and sends commit + response when possible", () => {
    const result = resolvePushToTalkStop(base);
    expect(result).toEqual({
      kind: "deactivate-and-send",
      events: [
        expect.objectContaining({ type: "input_audio_buffer.commit" }),
        expect.objectContaining({ type: "response.create" }),
      ],
    });
  });
});
