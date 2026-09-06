import { describe, expect, it } from "vitest";

import { buildOptimizationSavings } from "@/modules/assistant/lib/optimization-savings";

// 640×360 → 85 + 170×2×1 = 425 image tokens per frame.
const FRAME_W = 640;
const FRAME_H = 360;
const FRAME_TOKENS = 425;
const IMAGE_PRICE_PER_TOKEN = 5 / 1_000_000;
const TEXT_PRICE_PER_TOKEN = 4 / 1_000_000;

const EMPTY_INPUT = {
  skippedFrameCount: 0,
  sampleWidth: FRAME_W,
  sampleHeight: FRAME_H,
  sceneMemorySavingsTokens: 0,
  textHistorySavedTextTokens: 0,
  fusionImageTokens: 0,
} as const;

describe("buildOptimizationSavings", () => {
  it("returns an empty summary when no mechanism reports savings", () => {
    const summary = buildOptimizationSavings(EMPTY_INPUT);

    expect(summary.items).toEqual([]);
    expect(summary.activeMechanismCount).toBe(0);
    expect(summary.totalSavedTokens).toBe(0);
    expect(summary.totalSavedUsd).toBe(0);
  });

  it("aggregates frame-diff skipped frames at the image input price", () => {
    const skipped = 10;
    const summary = buildOptimizationSavings({
      ...EMPTY_INPUT,
      skippedFrameCount: skipped,
    });

    const expectedTokens = FRAME_TOKENS * skipped;
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]?.id).toBe("frame-diff");
    expect(summary.items[0]?.savedTokens).toBe(expectedTokens);
    expect(summary.items[0]?.savedUsd).toBeCloseTo(
      expectedTokens * IMAGE_PRICE_PER_TOKEN,
      10,
    );
    expect(summary.activeMechanismCount).toBe(1);
    expect(summary.totalSavedTokens).toBe(expectedTokens);
    expect(summary.totalSavedUsd).toBeCloseTo(
      expectedTokens * IMAGE_PRICE_PER_TOKEN,
      10,
    );
  });

  it("aggregates scene-memory savings at the image input price", () => {
    const savedTokens = 850;
    const summary = buildOptimizationSavings({
      ...EMPTY_INPUT,
      sceneMemorySavingsTokens: savedTokens,
    });

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]?.id).toBe("scene-memory");
    expect(summary.items[0]?.savedTokens).toBe(savedTokens);
    expect(summary.items[0]?.savedUsd).toBeCloseTo(
      savedTokens * IMAGE_PRICE_PER_TOKEN,
      10,
    );
    expect(summary.totalSavedUsd).toBeCloseTo(
      savedTokens * IMAGE_PRICE_PER_TOKEN,
      10,
    );
  });

  it("aggregates text-history savings at the text input price", () => {
    const savedTokens = 1200;
    const summary = buildOptimizationSavings({
      ...EMPTY_INPUT,
      textHistorySavedTextTokens: savedTokens,
    });

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]?.id).toBe("text-history");
    expect(summary.items[0]?.savedTokens).toBe(savedTokens);
    expect(summary.items[0]?.savedUsd).toBeCloseTo(
      savedTokens * TEXT_PRICE_PER_TOKEN,
      10,
    );
    expect(summary.totalSavedUsd).toBeCloseTo(
      savedTokens * TEXT_PRICE_PER_TOKEN,
      10,
    );
  });

  it("aggregates fusion image tokens at the image input price", () => {
    const tokens = 425;
    const summary = buildOptimizationSavings({
      ...EMPTY_INPUT,
      fusionImageTokens: tokens,
    });

    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]?.id).toBe("fusion");
    expect(summary.items[0]?.savedTokens).toBe(tokens);
    expect(summary.items[0]?.savedUsd).toBeCloseTo(
      tokens * IMAGE_PRICE_PER_TOKEN,
      10,
    );
  });

  it("sums all mechanisms together and orders active first", () => {
    const skipped = 5;
    const sceneMemoryTokens = 850;
    const textHistoryTokens = 600;
    const fusionTokens = 425;
    const summary = buildOptimizationSavings({
      skippedFrameCount: skipped,
      sampleWidth: FRAME_W,
      sampleHeight: FRAME_H,
      sceneMemorySavingsTokens: sceneMemoryTokens,
      textHistorySavedTextTokens: textHistoryTokens,
      fusionImageTokens: fusionTokens,
    });

    const expectedTokens =
      FRAME_TOKENS * skipped + sceneMemoryTokens + textHistoryTokens + fusionTokens;
    const expectedUsd =
      FRAME_TOKENS * skipped * IMAGE_PRICE_PER_TOKEN +
      sceneMemoryTokens * IMAGE_PRICE_PER_TOKEN +
      textHistoryTokens * TEXT_PRICE_PER_TOKEN +
      fusionTokens * IMAGE_PRICE_PER_TOKEN;

    expect(summary.items).toHaveLength(4);
    expect(summary.items.map((item) => item.id)).toEqual([
      "frame-diff",
      "scene-memory",
      "text-history",
      "fusion",
    ]);
    expect(summary.activeMechanismCount).toBe(4);
    expect(summary.totalSavedTokens).toBe(expectedTokens);
    expect(summary.totalSavedUsd).toBeCloseTo(expectedUsd, 10);
  });

  it("drops mechanisms whose savings are zero/non-finite", () => {
    const summary = buildOptimizationSavings({
      skippedFrameCount: 0,
      sampleWidth: FRAME_W,
      sampleHeight: FRAME_H,
      sceneMemorySavingsTokens: Number.NaN,
      textHistorySavedTextTokens: -5,
      fusionImageTokens: 0,
    });

    expect(summary.items).toEqual([]);
    expect(summary.activeMechanismCount).toBe(0);
    expect(summary.totalSavedTokens).toBe(0);
    expect(summary.totalSavedUsd).toBe(0);
  });

  it("treats non-finite frame dimensions as zero savings", () => {
    const summary = buildOptimizationSavings({
      ...EMPTY_INPUT,
      skippedFrameCount: 10,
      sampleWidth: Number.NaN,
      sampleHeight: 360,
    });

    expect(summary.items).toEqual([]);
    expect(summary.totalSavedTokens).toBe(0);
    expect(summary.totalSavedUsd).toBe(0);
  });
});
