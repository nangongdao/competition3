import { describe, expect, it } from "vitest";

import {
  REALTIME_IDLE_DISCONNECT_MS,
  REALTIME_IDLE_WARNING_MS,
  buildResponseCreateEvent,
  getRealtimeIdleDecision,
} from "./use-realtime-session";

describe("buildResponseCreateEvent", () => {
  it("requests audio and text responses by default mode", () => {
    expect(buildResponseCreateEvent("audio-text")).toEqual({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
      },
    });
  });

  it("requests text-only responses when the mode is text-only", () => {
    expect(buildResponseCreateEvent("text-only")).toEqual({
      type: "response.create",
      response: {
        modalities: ["text"],
      },
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
