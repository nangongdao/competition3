import { describe, expect, it } from "vitest";

import {
  deriveFrameTelemetryStats,
  deriveSampleRateStats,
  EMPTY_FRAME_TELEMETRY,
  recordFrameTelemetry,
  recordSampleTick,
} from "./frame-telemetry";

describe("recordFrameTelemetry", () => {
  it("records the first sample", () => {
    const result = recordFrameTelemetry(EMPTY_FRAME_TELEMETRY, 3.5);

    expect(result.count).toBe(1);
    expect(result.totalMs).toBe(3.5);
    expect(result.maxMs).toBe(3.5);
    expect(result.lastMs).toBe(3.5);
  });

  it("accumulates count and total across samples", () => {
    const first = recordFrameTelemetry(EMPTY_FRAME_TELEMETRY, 2);
    const second = recordFrameTelemetry(first, 4);

    expect(second.count).toBe(2);
    expect(second.totalMs).toBeCloseTo(6, 6);
  });

  it("tracks the running max independently of order", () => {
    const first = recordFrameTelemetry(EMPTY_FRAME_TELEMETRY, 5);
    const second = recordFrameTelemetry(first, 2);
    const third = recordFrameTelemetry(second, 8);

    expect(third.maxMs).toBe(8);
    expect(third.lastMs).toBe(8);
  });

  it("normalizes invalid and negative process times to zero", () => {
    const negative = recordFrameTelemetry(EMPTY_FRAME_TELEMETRY, -3);
    const nan = recordFrameTelemetry(negative, Number.NaN);
    const infinite = recordFrameTelemetry(nan, Number.POSITIVE_INFINITY);

    expect(infinite.count).toBe(3);
    expect(infinite.totalMs).toBe(0);
    expect(infinite.maxMs).toBe(0);
  });

  it("preserves sample-tick fields when recording processing time", () => {
    const ticked = recordSampleTick(EMPTY_FRAME_TELEMETRY, 100);
    const result = recordFrameTelemetry(ticked, 4);

    expect(result.count).toBe(1);
    expect(result.tickCount).toBe(0);
    expect(result.lastTimestampMs).toBe(100);
  });

  it("is immutable: does not mutate the input snapshot", () => {
    const before = EMPTY_FRAME_TELEMETRY;
    recordFrameTelemetry(before, 4);

    expect(before.count).toBe(0);
    expect(before.totalMs).toBe(0);
  });
});

describe("deriveFrameTelemetryStats", () => {
  it("returns all-zero averages for an empty snapshot", () => {
    const stats = deriveFrameTelemetryStats(EMPTY_FRAME_TELEMETRY);

    expect(stats.averageMs).toBe(0);
    expect(stats.maxMs).toBe(0);
    expect(stats.lastMs).toBe(0);
    expect(stats.count).toBe(0);
  });

  it("computes the average across samples", () => {
    const first = recordFrameTelemetry(EMPTY_FRAME_TELEMETRY, 2);
    const second = recordFrameTelemetry(first, 4);
    const third = recordFrameTelemetry(second, 6);

    const stats = deriveFrameTelemetryStats(third);

    expect(stats.averageMs).toBeCloseTo(4, 6);
    expect(stats.maxMs).toBe(6);
    expect(stats.count).toBe(3);
  });
});

describe("recordSampleTick", () => {
  it("first sample only records a timestamp without an interval", () => {
    const first = recordSampleTick(EMPTY_FRAME_TELEMETRY, 100);

    expect(first.tickCount).toBe(0);
    expect(first.lastTimestampMs).toBe(100);
    expect(first.totalIntervalMs).toBe(0);
  });

  it("records the interval between consecutive samples", () => {
    const first = recordSampleTick(EMPTY_FRAME_TELEMETRY, 100);
    const second = recordSampleTick(first, 500);

    expect(second.tickCount).toBe(1);
    expect(second.totalIntervalMs).toBe(400);
    expect(second.lastIntervalMs).toBe(400);
    expect(second.lastTimestampMs).toBe(500);
  });

  it("accumulates intervals across samples", () => {
    const first = recordSampleTick(EMPTY_FRAME_TELEMETRY, 0);
    const second = recordSampleTick(first, 1000);
    const third = recordSampleTick(second, 2500);

    expect(third.tickCount).toBe(2);
    expect(third.totalIntervalMs).toBe(2500);
    expect(third.lastIntervalMs).toBe(1500);
  });

  it("ignores non-increasing timestamps (only updates the timestamp)", () => {
    const first = recordSampleTick(EMPTY_FRAME_TELEMETRY, 1000);
    const outOfOrder = recordSampleTick(first, 500);

    expect(outOfOrder.tickCount).toBe(0);
    expect(outOfOrder.lastTimestampMs).toBe(500);
    expect(outOfOrder.totalIntervalMs).toBe(0);
  });

  it("is immutable: does not mutate the input snapshot", () => {
    const before = EMPTY_FRAME_TELEMETRY;
    recordSampleTick(before, 1000);

    expect(before.tickCount).toBe(0);
    expect(before.lastTimestampMs).toBe(-1);
  });
});

describe("deriveSampleRateStats", () => {
  it("returns all-zero stats when there are no valid intervals", () => {
    const stats = deriveSampleRateStats(EMPTY_FRAME_TELEMETRY);

    expect(stats.averageFps).toBe(0);
    expect(stats.lastIntervalMs).toBe(0);
    expect(stats.lastFps).toBe(0);
    expect(stats.tickCount).toBe(0);
  });

  it("derives average fps from accumulated intervals", () => {
    const first = recordSampleTick(EMPTY_FRAME_TELEMETRY, 0);
    const second = recordSampleTick(first, 200);
    const third = recordSampleTick(second, 400);

    const stats = deriveSampleRateStats(third);

    expect(stats.tickCount).toBe(2);
    expect(stats.averageFps).toBeCloseTo(5, 6);
    expect(stats.lastIntervalMs).toBe(200);
    expect(stats.lastFps).toBeCloseTo(5, 6);
  });

  it("derives the most recent fps from the last interval", () => {
    const first = recordSampleTick(EMPTY_FRAME_TELEMETRY, 0);
    const second = recordSampleTick(first, 1000);
    const third = recordSampleTick(second, 1100);

    const stats = deriveSampleRateStats(third);

    expect(stats.averageFps).toBeCloseTo(1.818, 2);
    expect(stats.lastIntervalMs).toBe(100);
    expect(stats.lastFps).toBeCloseTo(10, 3);
  });
});