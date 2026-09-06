import { describe, expect, it } from "vitest";

import {
  CONTINUOUS_CHAT_MAX_RECORDING_MS,
  CONTINUOUS_CHAT_MIN_RECORDING_MS,
  CONTINUOUS_CHAT_SILENCE_MS,
  CONTINUOUS_CHAT_SPEECH_THRESHOLD,
  createInitialVadState,
  evaluateContinuousChatVad,
} from "./continuous-chat-vad";

describe("evaluateContinuousChatVad", () => {
  it("ignores silence before any speech is detected", () => {
    const result = evaluateContinuousChatVad(createInitialVadState(), {
      level: 0,
      now: 10_000,
      elapsedMs: 2_000,
    });

    expect(result.shouldComplete).toBe(false);
    expect(result.state.hasDetectedSpeech).toBe(false);
    expect(result.state.silenceStartedAt).toBeNull();
  });

  it("records speech and then tracks the start of silence", () => {
    const afterSpeech = evaluateContinuousChatVad(createInitialVadState(), {
      level: CONTINUOUS_CHAT_SPEECH_THRESHOLD,
      now: 1_000,
      elapsedMs: 1_000,
    });
    expect(afterSpeech.state.hasDetectedSpeech).toBe(true);

    const afterSilenceStart = evaluateContinuousChatVad(afterSpeech.state, {
      level: 0,
      now: 2_000,
      elapsedMs: 2_000,
    });
    expect(afterSilenceStart.shouldComplete).toBe(false);
    expect(afterSilenceStart.state.silenceStartedAt).toBe(2_000);
  });

  it("completes only after silence exceeds the threshold", () => {
    const afterSpeech = evaluateContinuousChatVad(createInitialVadState(), {
      level: CONTINUOUS_CHAT_SPEECH_THRESHOLD,
      now: 1_000,
      elapsedMs: 1_000,
    });

    const silenceStart = evaluateContinuousChatVad(afterSpeech.state, {
      level: 0,
      now: 2_000,
      elapsedMs: CONTINUOUS_CHAT_MIN_RECORDING_MS,
    });
    expect(silenceStart.shouldComplete).toBe(false);
    expect(silenceStart.state.silenceStartedAt).toBe(2_000);

    const tooEarly = evaluateContinuousChatVad(silenceStart.state, {
      level: 0,
      now: 2_000 + CONTINUOUS_CHAT_SILENCE_MS - 1,
      elapsedMs: CONTINUOUS_CHAT_MIN_RECORDING_MS,
    });
    expect(tooEarly.shouldComplete).toBe(false);

    const completed = evaluateContinuousChatVad(tooEarly.state, {
      level: 0,
      now: 2_000 + CONTINUOUS_CHAT_SILENCE_MS,
      elapsedMs: CONTINUOUS_CHAT_MIN_RECORDING_MS,
    });
    expect(completed.shouldComplete).toBe(true);
  });

  it("does not complete before the minimum recording duration", () => {
    const afterSpeech = evaluateContinuousChatVad(createInitialVadState(), {
      level: CONTINUOUS_CHAT_SPEECH_THRESHOLD,
      now: 0,
      elapsedMs: 0,
    });

    // Before the minimum duration, silence is not yet tracked.
    const beforeMinimum = evaluateContinuousChatVad(afterSpeech.state, {
      level: 0,
      now: 100,
      elapsedMs: CONTINUOUS_CHAT_MIN_RECORDING_MS - 1,
    });
    expect(beforeMinimum.shouldComplete).toBe(false);
    expect(beforeMinimum.state.silenceStartedAt).toBeNull();

    // Once the minimum duration passes, silence tracking begins.
    const silenceStart = evaluateContinuousChatVad(beforeMinimum.state, {
      level: 0,
      now: CONTINUOUS_CHAT_MIN_RECORDING_MS,
      elapsedMs: CONTINUOUS_CHAT_MIN_RECORDING_MS,
    });
    expect(silenceStart.shouldComplete).toBe(false);
    expect(silenceStart.state.silenceStartedAt).toBe(
      CONTINUOUS_CHAT_MIN_RECORDING_MS,
    );

    const longEnough = evaluateContinuousChatVad(silenceStart.state, {
      level: 0,
      now: CONTINUOUS_CHAT_MIN_RECORDING_MS + CONTINUOUS_CHAT_SILENCE_MS,
      elapsedMs: CONTINUOUS_CHAT_MIN_RECORDING_MS + CONTINUOUS_CHAT_SILENCE_MS,
    });
    expect(longEnough.shouldComplete).toBe(true);
  });

  it("resets the silence window whenever speech resumes", () => {
    let state = createInitialVadState();
    state = evaluateContinuousChatVad(state, {
      level: CONTINUOUS_CHAT_SPEECH_THRESHOLD,
      now: 1_000,
      elapsedMs: 1_000,
    }).state;
    state = evaluateContinuousChatVad(state, {
      level: 0,
      now: 2_000,
      elapsedMs: 2_000,
    }).state;
    state = evaluateContinuousChatVad(state, {
      level: CONTINUOUS_CHAT_SPEECH_THRESHOLD,
      now: 2_500,
      elapsedMs: 2_500,
    }).state;

    expect(state.silenceStartedAt).toBeNull();
    expect(state.hasDetectedSpeech).toBe(true);
  });

  it("exposes the max recording constant used by the hook timer", () => {
    expect(CONTINUOUS_CHAT_MAX_RECORDING_MS).toBe(12_000);
  });
});
