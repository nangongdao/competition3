import { describe, expect, it } from "vitest";

import {
  ENDPOINT_RATE_LIMITS,
  pruneTimestamps,
  RATE_LIMIT_WINDOW_MS,
  tryConsume,
} from "./rate-limit-state";

const NOW = 1_000_000;

describe("rate limit state", () => {
  it("allows requests until the endpoint limit is reached", () => {
    let timestamps: number[] = [];
    const limit = ENDPOINT_RATE_LIMITS.chat;

    for (let index = 0; index < limit; index += 1) {
      const { consumption, nextTimestamps } = tryConsume(
        timestamps,
        "chat",
        NOW + index,
      );

      expect(consumption).toEqual({ allowed: true, retryAfterSeconds: 0 });
      timestamps = nextTimestamps;
    }

    expect(timestamps).toHaveLength(limit);
  });

  it("rejects the request once the window is full and reports Retry-After", () => {
    const limit = ENDPOINT_RATE_LIMITS.chat;
    const timestamps = Array.from({ length: limit }, (_, index) => NOW + index);
    const oldest = NOW;
    const result = tryConsume(timestamps, "chat", NOW + 10_000);

    expect(result.consumption.allowed).toBe(false);

    if (result.consumption.allowed === false) {
      const expectedRetryAfter = Math.ceil(
        (RATE_LIMIT_WINDOW_MS - (NOW + 10_000 - oldest)) / 1000,
      );
      expect(result.consumption.retryAfterSeconds).toBe(expectedRetryAfter);
    }

    expect(result.nextTimestamps).toHaveLength(limit);
  });

  it("prunes timestamps that have fallen outside the window", () => {
    const timestamps = [NOW - RATE_LIMIT_WINDOW_MS, NOW - 5_000, NOW - 1_000];
    const pruned = pruneTimestamps(timestamps, NOW);

    expect(pruned).toEqual([NOW - 5_000, NOW - 1_000]);
  });

  it("resets the budget after the window elapses", () => {
    const limit = ENDPOINT_RATE_LIMITS.speech;
    const timestamps = Array.from(
      { length: limit },
      (_, index) => NOW - (index + 1) * 1000,
    );
    const afterWindow = NOW + RATE_LIMIT_WINDOW_MS;
    const result = tryConsume(timestamps, "speech", afterWindow);

    expect(result.consumption).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(result.nextTimestamps).toEqual([afterWindow]);
  });

  it("applies the default limit to unknown endpoints", () => {
    const defaultLimit = ENDPOINT_RATE_LIMITS.default;
    let timestamps: number[] = [];

    for (let index = 0; index < defaultLimit; index += 1) {
      const { consumption, nextTimestamps } = tryConsume(
        timestamps,
        "unknown-endpoint",
        NOW + index,
      );

      expect(consumption.allowed).toBe(true);
      timestamps = nextTimestamps;
    }

    const rejected = tryConsume(timestamps, "unknown-endpoint", NOW + defaultLimit);
    expect(rejected.consumption.allowed).toBe(false);
  });

  it("uses the strictest limit for realtime sessions", () => {
    expect(ENDPOINT_RATE_LIMITS.realtime).toBeLessThan(ENDPOINT_RATE_LIMITS.chat);
  });
});
