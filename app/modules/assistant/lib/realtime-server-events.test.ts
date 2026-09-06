import { describe, expect, it } from "vitest";

import {
  isMeaningfulUserTranscript,
  resolveServerEventAction,
} from "./realtime-server-events";

describe("resolveServerEventAction", () => {
  it("ignores events without a type field", () => {
    expect(resolveServerEventAction({})).toEqual({ kind: "none" });
  });

  it("ignores unknown event types", () => {
    expect(resolveServerEventAction({ type: "something.else" })).toEqual({
      kind: "none",
    });
  });

  it("classifies an error event", () => {
    expect(
      resolveServerEventAction({ type: "error", message: "boom" }),
    ).toEqual({ kind: "error" });
  });

  it("classifies a conversation item created event", () => {
    expect(
      resolveServerEventAction({
        type: "conversation.item.created",
        item: {},
      }),
    ).toEqual({ kind: "image-created" });
  });

  it("classifies a speech started event", () => {
    expect(
      resolveServerEventAction({ type: "input_audio_buffer.speech_started" }),
    ).toEqual({ kind: "speech-started" });
  });

  it("classifies a response created event", () => {
    expect(
      resolveServerEventAction({ type: "response.created" }),
    ).toEqual({ kind: "response-created" });
  });

  it("extracts delta text for every delta variant", () => {
    for (const type of [
      "response.audio_transcript.delta",
      "response.output_text.delta",
      "response.text.delta",
    ]) {
      expect(
        resolveServerEventAction({ type, delta: "你好" }),
      ).toEqual({ kind: "text-delta", delta: "你好" });
    }
  });

  it("defaults a missing delta to an empty string", () => {
    expect(resolveServerEventAction({ type: "response.text.delta" })).toEqual({
      kind: "text-delta",
      delta: "",
    });
  });

  it("classifies an audio transcript done event", () => {
    expect(
      resolveServerEventAction({
        type: "response.audio_transcript.done",
        transcript: "完成",
      }),
    ).toEqual({ kind: "transcript-done", text: "完成" });
  });

  it("classifies output/text done events", () => {
    for (const type of ["response.output_text.done", "response.text.done"]) {
      expect(resolveServerEventAction({ type, text: "好" })).toEqual({
        kind: "text-done",
        text: "好",
      });
    }
  });

  it("classifies a user transcription completed event", () => {
    expect(
      resolveServerEventAction({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "我问问题",
      }),
    ).toEqual({ kind: "user-transcript", transcript: "我问问题" });
  });

  it("classifies a response done event", () => {
    expect(resolveServerEventAction({ type: "response.done" })).toEqual({
      kind: "response-done",
    });
  });
});

describe("isMeaningfulUserTranscript", () => {
  it("rejects null and whitespace-only transcripts", () => {
    expect(isMeaningfulUserTranscript(null)).toBe(false);
    expect(isMeaningfulUserTranscript("   ")).toBe(false);
  });

  it("accepts non-empty transcripts", () => {
    expect(isMeaningfulUserTranscript("问我")).toBe(true);
  });
});
