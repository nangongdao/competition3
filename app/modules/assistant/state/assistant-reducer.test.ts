import { describe, expect, it } from "vitest";

import {
  assistantReducer,
  createInitialAssistantState,
  initialFrameStats,
  type AssistantState,
} from "./assistant-reducer";
import type { TranscriptEntry } from "@/modules/assistant/types";

function buildEntry(id: string): TranscriptEntry {
  return {
    id,
    speaker: "system",
    text: "text",
    createdAt: 1,
  };
}

function buildState(): AssistantState {
  return createInitialAssistantState([buildEntry("entry-0")]);
}

describe("assistantReducer", () => {
  it("sets the phase without touching unrelated state", () => {
    const next = assistantReducer(buildState(), {
      type: "phase-set",
      phase: "listening",
    });

    expect(next.phase).toBe("listening");
    expect(next.transcript).toHaveLength(1);
    expect(next.frameStats).toEqual(initialFrameStats);
  });

  it("keeps the same reference when the phase is unchanged", () => {
    const state = buildState();
    expect(assistantReducer(state, { type: "phase-set", phase: "idle" })).toBe(
      state,
    );
  });

  it("appends a transcript entry immutably", () => {
    const next = assistantReducer(buildState(), {
      type: "transcript-appended",
      entry: buildEntry("entry-1"),
    });

    expect(next.transcript.map((entry) => entry.id)).toEqual([
      "entry-0",
      "entry-1",
    ]);
  });

  it("appends streaming text to a single entry immutably", () => {
    const next = assistantReducer(buildState(), {
      type: "transcript-text-append",
      entryId: "entry-0",
      text: " world",
    });

    expect(next.transcript[0]?.text).toBe("text world");
    expect(buildState().transcript[0]?.text).toBe("text");
  });

  it("does not touch other entries when appending streaming text", () => {
    const next = assistantReducer(buildState(), {
      type: "transcript-text-append",
      entryId: "entry-0",
      text: "!",
    });

    expect(next.transcript[0]?.text).toBe("text!");
  });

  it("replaces a single entry text immutably", () => {
    const next = assistantReducer(buildState(), {
      type: "transcript-text-set",
      entryId: "entry-0",
      text: "replaced",
    });

    expect(next.transcript[0]?.text).toBe("replaced");
    expect(buildState().transcript[0]?.text).toBe("text");
  });

  it("replacing text on unknown entry is a no-op", () => {
    const next = assistantReducer(buildState(), {
      type: "transcript-text-set",
      entryId: "missing",
      text: "replaced",
    });

    expect(next.transcript[0]?.text).toBe("text");
  });

  it("updates a single entry delivery status", () => {
    const next = assistantReducer(buildState(), {
      type: "transcript-delivery-set",
      entryId: "entry-0",
      deliveryStatus: "failed",
    });

    expect(next.transcript[0]?.deliveryStatus).toBe("failed");
  });

  it("clears the transcript", () => {
    const next = assistantReducer(buildState(), { type: "transcript-cleared" });
    expect(next.transcript).toEqual([]);
  });

  it("records a sampled frame once per action", () => {
    const sampled = assistantReducer(buildState(), {
      type: "frame-sampled",
      dataUrl: "data:image/jpeg;base64,abc",
    });

    expect(sampled.lastFrameDataUrl).toBe("data:image/jpeg;base64,abc");
    expect(sampled.frameStats.sampled).toBe(1);
    expect(sampled.frameStats.sent).toBe(0);
    expect(sampled.frameStats.skippedAuto).toBe(0);
  });

  it("increments sent and skipped counters independently", () => {
    let state = buildState();
    state = assistantReducer(state, { type: "frame-sampled", dataUrl: "d" });
    state = assistantReducer(state, { type: "frame-sent" });
    state = assistantReducer(state, { type: "frame-skipped" });
    state = assistantReducer(state, { type: "frame-skipped" });

    expect(state.frameStats).toEqual({
      sampled: 1,
      sent: 1,
      skippedAuto: 2,
    });
  });

  it("resets frame stats while keeping sampled data elsewhere intact", () => {
    let state = buildState();
    state = assistantReducer(state, { type: "frame-sampled", dataUrl: "d" });
    state = assistantReducer(state, { type: "frame-sent" });

    const reset = assistantReducer(state, { type: "frame-upload-counters-reset" });
    expect(reset.frameStats).toEqual({ sampled: 1, sent: 0, skippedAuto: 0 });
    expect(reset.lastFrameDataUrl).toBe("d");
  });

  it("clears the last frame", () => {
    let state = buildState();
    state = assistantReducer(state, { type: "frame-sampled", dataUrl: "d" });
    expect(assistantReducer(state, { type: "last-frame-cleared" }).lastFrameDataUrl).toBeNull();
  });
});
