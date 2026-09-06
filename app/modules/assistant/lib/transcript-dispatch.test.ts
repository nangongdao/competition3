import { describe, expect, it } from "vitest";

import {
  buildPhaseSetAction,
  buildTranscriptAppendAction,
  buildTranscriptDeliveryAction,
} from "./transcript-dispatch";

describe("buildTranscriptAppendAction", () => {
  it("builds an appended action with explicit deliveryStatus", () => {
    const action = buildTranscriptAppendAction({
      id: "entry-5",
      speaker: "user",
      text: "你好",
      createdAt: 1234,
      deliveryStatus: "sent",
    });

    expect(action).toEqual({
      type: "transcript-appended",
      entry: {
        id: "entry-5",
        speaker: "user",
        text: "你好",
        createdAt: 1234,
        deliveryStatus: "sent",
      },
    });
  });

  it("omits deliveryStatus when it is undefined", () => {
    const action = buildTranscriptAppendAction({
      id: "entry-6",
      speaker: "system",
      text: "语音识别结果已填入输入框。",
      createdAt: 99,
    });

    expect(action).toEqual({
      type: "transcript-appended",
      entry: {
        id: "entry-6",
        speaker: "system",
        text: "语音识别结果已填入输入框。",
        createdAt: 99,
      },
    });
    expect("deliveryStatus" in action.entry).toBe(false);
  });

  it("supports assistant speaker", () => {
    const action = buildTranscriptAppendAction({
      id: "entry-7",
      speaker: "assistant",
      text: "回答",
      createdAt: 1,
    });

    expect(action.entry.speaker).toBe("assistant");
  });
});

describe("buildTranscriptDeliveryAction", () => {
  it("builds a delivery-set action for a valid status", () => {
    const action = buildTranscriptDeliveryAction("entry-1", "failed");

    expect(action).toEqual({
      type: "transcript-delivery-set",
      entryId: "entry-1",
      deliveryStatus: "failed",
    });
  });

  it("returns null when deliveryStatus is undefined (skip dispatch)", () => {
    expect(buildTranscriptDeliveryAction("entry-1", undefined)).toBeNull();
  });
});

describe("buildPhaseSetAction", () => {
  it("builds a phase-set action", () => {
    expect(buildPhaseSetAction("listening")).toEqual({
      type: "phase-set",
      phase: "listening",
    });
  });

  it("round-trips other phases", () => {
    for (const phase of ["idle", "ready", "connecting", "thinking", "responding", "error"]) {
      const action = buildPhaseSetAction(phase as Parameters<typeof buildPhaseSetAction>[0]);
      expect(action).toEqual({ type: "phase-set", phase });
    }
  });
});
