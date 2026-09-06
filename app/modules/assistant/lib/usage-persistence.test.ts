import { describe, expect, it } from "vitest";

import {
  realtimeUsageToRecord,
  usageTotalsToBuckets,
} from "./usage-persistence";
import type { UsageTotals } from "@/modules/assistant/lib/session-client";
import type { UsageBuckets } from "@/modules/assistant/lib/cost-model";

const TOTALS: UsageTotals = {
  turnCount: 5,
  inputTokens: 4500,
  inputTextTokens: 800,
  inputAudioTokens: 2000,
  inputImageTokens: 1700,
  cachedInputTokens: 900,
  cachedTextTokens: 200,
  cachedAudioTokens: 500,
  cachedImageTokens: 200,
  outputTokens: 300,
  outputTextTokens: 120,
  outputAudioTokens: 180,
  estimatedCostUsd: 0.01234,
};

describe("usageTotalsToBuckets", () => {
  it("maps every UsageTotals field onto UsageBuckets", () => {
    const buckets = usageTotalsToBuckets(TOTALS);

    expect(buckets).toEqual({
      inputTokens: 4500,
      inputTextTokens: 800,
      inputAudioTokens: 2000,
      inputImageTokens: 1700,
      cachedInputTokens: 900,
      cachedTextTokens: 200,
      cachedAudioTokens: 500,
      cachedImageTokens: 200,
      outputTokens: 300,
      outputTextTokens: 120,
      outputAudioTokens: 180,
    });
  });

  it("handles an all-zero totals object", () => {
    const zeros: UsageTotals = {
      turnCount: 0,
      inputTokens: 0,
      inputTextTokens: 0,
      inputAudioTokens: 0,
      inputImageTokens: 0,
      cachedInputTokens: 0,
      cachedTextTokens: 0,
      cachedAudioTokens: 0,
      cachedImageTokens: 0,
      outputTokens: 0,
      outputTextTokens: 0,
      outputAudioTokens: 0,
      estimatedCostUsd: 0,
    };

    expect(usageTotalsToBuckets(zeros)).toEqual({
      inputTokens: 0,
      inputTextTokens: 0,
      inputAudioTokens: 0,
      inputImageTokens: 0,
      cachedInputTokens: 0,
      cachedTextTokens: 0,
      cachedAudioTokens: 0,
      cachedImageTokens: 0,
      outputTokens: 0,
      outputTextTokens: 0,
      outputAudioTokens: 0,
    });
  });
});

describe("realtimeUsageToRecord", () => {
  it("normalizes a UsageBuckets turn into a realtime RecordUsageParams", () => {
    const usage: UsageBuckets = {
      inputTokens: 1500,
      inputTextTokens: 200,
      inputAudioTokens: 1000,
      inputImageTokens: 300,
      cachedInputTokens: 500,
      cachedTextTokens: 100,
      cachedAudioTokens: 300,
      cachedImageTokens: 100,
      outputTokens: 80,
      outputTextTokens: 20,
      outputAudioTokens: 60,
    };

    expect(realtimeUsageToRecord(usage, 0.0007)).toEqual({
      mode: "realtime",
      inputTokens: 1500,
      inputTextTokens: 200,
      inputAudioTokens: 1000,
      inputImageTokens: 300,
      cachedInputTokens: 500,
      cachedTextTokens: 100,
      cachedAudioTokens: 300,
      cachedImageTokens: 100,
      outputTokens: 80,
      outputTextTokens: 20,
      outputAudioTokens: 60,
      estimatedCostUsd: 0.0007,
    });
  });

  it("passes the caller-provided estimated cost through unchanged", () => {
    const usage: UsageBuckets = {
      inputTokens: 1,
      inputTextTokens: 1,
      inputAudioTokens: 0,
      inputImageTokens: 0,
      cachedInputTokens: 0,
      cachedTextTokens: 0,
      cachedAudioTokens: 0,
      cachedImageTokens: 0,
      outputTokens: 1,
      outputTextTokens: 1,
      outputAudioTokens: 0,
    };

    expect(realtimeUsageToRecord(usage, 0).estimatedCostUsd).toBe(0);
    expect(realtimeUsageToRecord(usage, 0.0001).estimatedCostUsd).toBe(0.0001);
  });
});
