import { describe, expect, it } from "vitest";

import {
  accumulateUsage,
  appendUsageTurn,
  buildUsageReportExport,
  createEmptyUsage,
  createEmptyUsageReport,
  estimateCostUsd,
  formatTokens,
  formatUsd,
  parseResponseUsage,
  REALTIME_PRICES_USD_PER_MILLION,
  serializeUsageReportCsv,
  serializeUsageReportJson,
  type UsageBuckets,
  type UsageReportExport,
} from "./cost-model";

function buildResponseDoneEvent(usage: unknown): Record<string, unknown> {
  return {
    type: "response.done",
    response: {
      id: "resp_test",
      usage,
    },
  };
}

describe("parseResponseUsage", () => {
  it("parses a full realtime usage payload into buckets", () => {
    const event = buildResponseDoneEvent({
      total_tokens: 1500,
      input_tokens: 1200,
      output_tokens: 300,
      input_token_details: {
        text_tokens: 200,
        audio_tokens: 700,
        image_tokens: 300,
        cached_tokens: 400,
        cached_tokens_details: {
          text_tokens: 100,
          audio_tokens: 300,
          image_tokens: 0,
        },
      },
      output_token_details: {
        text_tokens: 100,
        audio_tokens: 200,
      },
    });

    const usage = parseResponseUsage(event);

    expect(usage).toEqual({
      inputTokens: 1200,
      inputTextTokens: 200,
      inputAudioTokens: 700,
      inputImageTokens: 300,
      cachedInputTokens: 400,
      cachedTextTokens: 100,
      cachedAudioTokens: 300,
      cachedImageTokens: 0,
      outputTokens: 300,
      outputTextTokens: 100,
      outputAudioTokens: 200,
    } satisfies UsageBuckets);
  });

  it("reads missing numeric fields as zero", () => {
    const event = buildResponseDoneEvent({
      input_tokens: 50,
      output_tokens: 10,
    });

    const usage = parseResponseUsage(event);

    expect(usage).not.toBeNull();
    expect(usage?.inputTokens).toBe(50);
    expect(usage?.inputAudioTokens).toBe(0);
    expect(usage?.inputImageTokens).toBe(0);
    expect(usage?.cachedInputTokens).toBe(0);
    expect(usage?.outputAudioTokens).toBe(0);
  });

  it("rejects events without a usage object", () => {
    expect(parseResponseUsage({ type: "response.done" })).toBeNull();
    expect(
      parseResponseUsage({ type: "response.done", response: { id: "x" } }),
    ).toBeNull();
    expect(
      parseResponseUsage(buildResponseDoneEvent("not-an-object")),
    ).toBeNull();
  });

  it("ignores negative and non-finite token counts", () => {
    const event = buildResponseDoneEvent({
      input_tokens: -5,
      output_tokens: Number.NaN,
      input_token_details: {
        audio_tokens: Number.POSITIVE_INFINITY,
      },
    });

    const usage = parseResponseUsage(event);

    expect(usage).not.toBeNull();
    expect(usage?.inputTokens).toBe(0);
    expect(usage?.outputTokens).toBe(0);
    expect(usage?.inputAudioTokens).toBe(0);
  });
});

describe("accumulateUsage", () => {
  it("adds every bucket and leaves inputs untouched", () => {
    const first: UsageBuckets = {
      ...createEmptyUsage(),
      inputTokens: 100,
      inputAudioTokens: 80,
      outputTokens: 40,
      outputAudioTokens: 40,
    };
    const second: UsageBuckets = {
      ...createEmptyUsage(),
      inputTokens: 300,
      inputAudioTokens: 150,
      inputImageTokens: 120,
      outputTokens: 60,
      outputAudioTokens: 50,
    };

    const totals = accumulateUsage(first, second);

    expect(totals.inputTokens).toBe(400);
    expect(totals.inputAudioTokens).toBe(230);
    expect(totals.inputImageTokens).toBe(120);
    expect(totals.outputTokens).toBe(100);
    expect(totals.outputAudioTokens).toBe(90);
    expect(first.inputTokens).toBe(100);
    expect(second.inputTokens).toBe(300);
  });
});

describe("appendUsageTurn", () => {
  it("adds a timestamped turn and cumulative totals", () => {
    const usage: UsageBuckets = {
      ...createEmptyUsage(),
      inputTokens: 1_000_000,
      inputTextTokens: 1_000_000,
      outputTokens: 1_000_000,
      outputAudioTokens: 1_000_000,
    };

    const report = appendUsageTurn(
      createEmptyUsageReport(),
      usage,
      1_700_000_000_000,
    );

    const [turn] = report.turns;
    if (turn === undefined || report.lastTurn === null) {
      throw new Error("Expected one usage turn");
    }

    expect(report.turnCount).toBe(1);
    expect(report.totals.inputTextTokens).toBe(1_000_000);
    expect(report.lastTurn.outputAudioTokens).toBe(1_000_000);
    expect(report.estimatedCostUsd).toBe(68);
    expect(turn).toEqual({
      index: 1,
      recordedAt: 1_700_000_000_000,
      usage,
      estimatedCostUsd: 68,
      cumulativeEstimatedCostUsd: 68,
    });
  });

  it("copies the turn usage so later mutation cannot alter the report", () => {
    const usage: UsageBuckets = {
      ...createEmptyUsage(),
      inputTokens: 10,
      inputImageTokens: 10,
    };

    const report = appendUsageTurn(createEmptyUsageReport(), usage, 1);
    usage.inputImageTokens = 999;

    const [turn] = report.turns;
    if (turn === undefined || report.lastTurn === null) {
      throw new Error("Expected one usage turn");
    }

    expect(turn.usage.inputImageTokens).toBe(10);
    expect(report.lastTurn.inputImageTokens).toBe(10);
  });
});

describe("estimateCostUsd", () => {
  it("returns zero for empty usage", () => {
    expect(estimateCostUsd(createEmptyUsage())).toBe(0);
  });

  it("bills cached tokens at the cached rate", () => {
    const usage: UsageBuckets = {
      ...createEmptyUsage(),
      inputTokens: 1_000_000,
      inputAudioTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      cachedAudioTokens: 1_000_000,
    };

    expect(estimateCostUsd(usage)).toBeCloseTo(
      REALTIME_PRICES_USD_PER_MILLION.cachedAudio,
      6,
    );
  });

  it("prices each modality bucket independently", () => {
    const usage: UsageBuckets = {
      ...createEmptyUsage(),
      inputTokens: 2_000_000,
      inputTextTokens: 1_000_000,
      inputImageTokens: 1_000_000,
      outputTokens: 1_000_000,
      outputAudioTokens: 1_000_000,
    };

    const expected =
      REALTIME_PRICES_USD_PER_MILLION.inputText +
      REALTIME_PRICES_USD_PER_MILLION.inputImage +
      REALTIME_PRICES_USD_PER_MILLION.outputAudio;

    expect(estimateCostUsd(usage)).toBeCloseTo(expected, 6);
  });

  it("never bills a negative uncached remainder", () => {
    const usage: UsageBuckets = {
      ...createEmptyUsage(),
      inputAudioTokens: 100,
      cachedAudioTokens: 500,
    };

    const expected =
      (500 * REALTIME_PRICES_USD_PER_MILLION.cachedAudio) / 1_000_000;

    expect(estimateCostUsd(usage)).toBeCloseTo(expected, 9);
  });
});

describe("formatting helpers", () => {
  it("formats sub-cent costs without rounding to zero", () => {
    expect(formatUsd(0.00005)).toBe("<$0.0001");
    expect(formatUsd(0)).toBe("$0.0000");
    expect(formatUsd(1.23456)).toBe("$1.2346");
  });

  it("formats token counts compactly", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(45_300)).toBe("45.3k");
  });
});

describe("createEmptyUsageReport", () => {
  it("starts with zero turns and a null last turn", () => {
    const report = createEmptyUsageReport();

    expect(report.turnCount).toBe(0);
    expect(report.lastTurn).toBeNull();
    expect(report.estimatedCostUsd).toBe(0);
    expect(report.totals).toEqual(createEmptyUsage());
    expect(report.turns).toEqual([]);
  });
});

describe("usage report export", () => {
  it("builds a JSON-ready export with metadata, summary, totals, and turns", () => {
    const report = appendUsageTurn(
      createEmptyUsageReport(),
      {
        ...createEmptyUsage(),
        inputTokens: 1_000_000,
        inputAudioTokens: 1_000_000,
      },
      1_700_000_000_000,
    );

    const exported = buildUsageReportExport(report, 1_700_000_001_000);

    expect(exported.metadata).toEqual({
      schemaVersion: 1,
      generatedAt: 1_700_000_001_000,
      source: "openai-realtime-response-done",
      pricesUsdPerMillion: REALTIME_PRICES_USD_PER_MILLION,
    });
    expect(exported.summary).toEqual({
      turnCount: 1,
      estimatedCostUsd: 32,
    });
    expect(exported.totals.inputAudioTokens).toBe(1_000_000);
    expect(exported.turns).toHaveLength(1);
  });

  it("serializes the JSON export with stable generated time", () => {
    const report = createEmptyUsageReport();
    const parsed = JSON.parse(
      serializeUsageReportJson(report, 1_700_000_002_000),
    ) as UsageReportExport;

    expect(parsed.metadata.generatedAt).toBe(1_700_000_002_000);
    expect(parsed.summary.turnCount).toBe(0);
    expect(parsed.lastTurn).toBeNull();
    expect(parsed.turns).toEqual([]);
  });

  it("serializes CSV rows for turns plus a totals row", () => {
    const report = appendUsageTurn(
      createEmptyUsageReport(),
      {
        ...createEmptyUsage(),
        inputTokens: 1_000_000,
        inputTextTokens: 1_000_000,
        outputTokens: 1_000_000,
        outputAudioTokens: 1_000_000,
      },
      1_700_000_003_000,
    );

    expect(serializeUsageReportCsv(report, 1_700_000_004_000)).toBe(
      [
        "row_type,turn_index,recorded_at_ms,input_tokens,input_text_tokens,input_audio_tokens,input_image_tokens,cached_input_tokens,cached_text_tokens,cached_audio_tokens,cached_image_tokens,output_tokens,output_text_tokens,output_audio_tokens,estimated_cost_usd,cumulative_estimated_cost_usd",
        "turn,1,1700000003000,1000000,1000000,0,0,0,0,0,0,1000000,0,1000000,68,68",
        "totals,,1700000004000,1000000,1000000,0,0,0,0,0,0,1000000,0,1000000,68,68",
        "",
      ].join("\n"),
    );
  });

  it("serializes an empty session CSV with a totals row", () => {
    expect(serializeUsageReportCsv(createEmptyUsageReport(), 1)).toBe(
      [
        "row_type,turn_index,recorded_at_ms,input_tokens,input_text_tokens,input_audio_tokens,input_image_tokens,cached_input_tokens,cached_text_tokens,cached_audio_tokens,cached_image_tokens,output_tokens,output_text_tokens,output_audio_tokens,estimated_cost_usd,cumulative_estimated_cost_usd",
        "totals,,1,0,0,0,0,0,0,0,0,0,0,0,0,0",
        "",
      ].join("\n"),
    );
  });
});
