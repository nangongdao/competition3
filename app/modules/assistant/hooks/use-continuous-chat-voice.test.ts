import { describe, expect, it } from "vitest";

import {
  canStartContinuousChatVoice,
  resolveContinuousStartMessage,
} from "./use-continuous-chat-voice";

describe("canStartContinuousChatVoice", () => {
  it("allows starting when media, recording support are ready and nothing is busy", () => {
    expect(
      canStartContinuousChatVoice({
        hasMedia: true,
        isRecordingSupported: true,
        isBusy: false,
        isChatSending: false,
      }),
    ).toBe(true);
  });

  it("blocks start without media access", () => {
    expect(
      canStartContinuousChatVoice({
        hasMedia: false,
        isRecordingSupported: true,
        isBusy: false,
        isChatSending: false,
      }),
    ).toBe(false);
  });

  it("blocks start when recording is unsupported", () => {
    expect(
      canStartContinuousChatVoice({
        hasMedia: true,
        isRecordingSupported: false,
        isBusy: false,
        isChatSending: false,
      }),
    ).toBe(false);
  });

  it("blocks start while a voice turn is busy", () => {
    expect(
      canStartContinuousChatVoice({
        hasMedia: true,
        isRecordingSupported: true,
        isBusy: true,
        isChatSending: false,
      }),
    ).toBe(false);
  });

  it("blocks start while a chat request is sending", () => {
    expect(
      canStartContinuousChatVoice({
        hasMedia: true,
        isRecordingSupported: true,
        isBusy: false,
        isChatSending: true,
      }),
    ).toBe(false);
  });
});

describe("resolveContinuousStartMessage", () => {
  it("mentions auto reading when speech synthesis is supported", () => {
    expect(resolveContinuousStartMessage(true)).toBe(
      "连续语音对话已开启，回答会自动朗读。",
    );
  });

  it("falls back to the no-synthesis message otherwise", () => {
    expect(resolveContinuousStartMessage(false)).toBe(
      "连续语音对话已开启；当前浏览器不支持自动朗读。",
    );
  });
});
