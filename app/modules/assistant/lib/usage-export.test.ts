import { describe, expect, it } from "vitest";

import {
  createEmptyUsage,
  createEmptyUsageReport,
} from "@/modules/assistant/lib/cost-model";

import {
  buildCalibratedGlobalUsageExport,
  buildCalibratedSessionUsageExport,
  buildCalibratedUsageExport,
  buildCalibrationMeta,
  buildGlobalUsageExport,
  buildSessionUsageExport,
  buildUsageExport,
  scaleUsageEntries,
  scaleUsageReport,
  scaleUsageTotals,
  serializeUsageEntriesCsv,
  serializeUsageEntriesJson,
  serializeUsageTotalsCsv,
  serializeUsageTotalsJson,
} from "./usage-export";
import type { UsageEntry, UsageTotals } from "@/modules/assistant/lib/session-client";

const TOTALS: UsageTotals = {
  turnCount: 2,
  inputTokens: 2500,
  inputTextTokens: 500,
  inputAudioTokens: 1000,
  inputImageTokens: 1000,
  cachedInputTokens: 300,
  cachedTextTokens: 100,
  cachedAudioTokens: 100,
  cachedImageTokens: 100,
  outputTokens: 100,
  outputTextTokens: 40,
  outputAudioTokens: 60,
  estimatedCostUsd: 0.00123,
};

function makeEntry(overrides: Partial<UsageEntry> = {}): UsageEntry {
  return {
    id: "u1",
    sessionId: "s1",
    mode: "realtime",
    inputTokens: 1500,
    inputTextTokens: 300,
    inputAudioTokens: 800,
    inputImageTokens: 400,
    cachedInputTokens: 200,
    cachedTextTokens: 80,
    cachedAudioTokens: 80,
    cachedImageTokens: 40,
    outputTokens: 60,
    outputTextTokens: 20,
    outputAudioTokens: 40,
    estimatedCostUsd: 0.0007,
    recordedAt: 1000,
    ...overrides,
  };
}
describe("buildUsageExport", () => {
  it("builds both JSON and CSV download URLs with charset data URLs", () => {
    const report = createEmptyUsageReport();
    const bundle = buildUsageExport(report, 1234);

    expect(bundle.jsonDownloadUrl).toMatch(/^data:application\/json;charset=utf-8,/);
    expect(bundle.csvDownloadUrl).toMatch(/^data:text\/csv;charset=utf-8,/);
  });

  it("uses generatedAt in both filenames", () => {
    const report = createEmptyUsageReport();
    const bundle = buildUsageExport(report, 1234);

    expect(bundle.jsonFilename).toBe("realtime-usage-1234.json");
    expect(bundle.csvFilename).toBe("realtime-usage-1234.csv");
  });

  it("defaults generatedAt to the current time", () => {
    const before = Date.now();
    const bundle = buildUsageExport(createEmptyUsageReport());
    const after = Date.now();

    const parsed = Number(bundle.jsonFilename.replace("realtime-usage-", "").replace(".json", ""));
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("encodes the report content (non-empty data URL payload)", () => {
    const report = createEmptyUsageReport();
    const bundle = buildUsageExport(report, 999);

    // 空的 usage 报告序列化后仍包含 schemaVersion/summary 等字段，payload 非空。
    expect(bundle.jsonDownloadUrl.length).toBeGreaterThan(
      "data:application/json;charset=utf-8,".length,
    );
    expect(bundle.csvDownloadUrl.length).toBeGreaterThan(
      "data:text/csv;charset=utf-8,".length,
    );
  });
});

describe("serializeUsageTotalsCsv", () => {
  it("writes a header and a single totals row", () => {
    const csv = serializeUsageTotalsCsv(TOTALS);
    const lines = csv.trim().split("\n");

    expect(lines[0]).toBe(
      "turn_count,input_tokens,input_text_tokens,input_audio_tokens,input_image_tokens,cached_input_tokens,cached_text_tokens,cached_audio_tokens,cached_image_tokens,output_tokens,output_text_tokens,output_audio_tokens,estimated_cost_usd",
    );
    expect(lines[1]).toContain("2");
    expect(lines[1]).toContain("2500");
    expect(lines[1]).toContain("0.00123");
  });
});

describe("serializeUsageTotalsJson", () => {
  it("embeds schemaVersion, generatedAt, and the totals object", () => {
    const json = serializeUsageTotalsJson(TOTALS, 1234);
    const parsed = JSON.parse(json);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.generatedAt).toBe(1234);
    expect(parsed.totals.turnCount).toBe(2);
    expect(parsed.totals.estimatedCostUsd).toBe(0.00123);
  });
});

describe("serializeUsageEntriesCsv", () => {
  it("writes one row per entry plus a totals row", () => {
    const csv = serializeUsageEntriesCsv([
      makeEntry(),
      makeEntry({ id: "u2", mode: "chat", recordedAt: 2000 }),
    ]);
    const lines = csv.trim().split("\n");

    // 表头 + 2 明细 + 1 totals 汇总行
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("1000"); // recordedAt
    expect(lines[1]).toContain("realtime");
    expect(lines[2]).toContain("chat");
    // totals 行
    expect(lines[3]).toContain("totals");
    expect(lines[3]).toContain("3000"); // 两轮 inputTokens 合计
  });
});

describe("serializeUsageEntriesJson", () => {
  it("embeds schemaVersion, generatedAt, sessionId, and entries", () => {
    const json = serializeUsageEntriesJson("s1", [makeEntry()], 1234);
    const parsed = JSON.parse(json);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.generatedAt).toBe(1234);
    expect(parsed.sessionId).toBe("s1");
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].mode).toBe("realtime");
  });
});

describe("buildSessionUsageExport", () => {
  it("builds JSON/CSV download URLs and session-scoped filenames", () => {
    const bundle = buildSessionUsageExport("s1", [makeEntry()], TOTALS, 1234);

    expect(bundle.jsonDownloadUrl).toMatch(/^data:application\/json;charset=utf-8,/);
    expect(bundle.csvDownloadUrl).toMatch(/^data:text\/csv;charset=utf-8,/);
    expect(bundle.jsonFilename).toBe("session-usage-s1-1234.json");
    expect(bundle.csvFilename).toBe("session-usage-s1-1234.csv");
  });
});

describe("buildGlobalUsageExport", () => {
  it("builds JSON/CSV download URLs and global filenames", () => {
    const bundle = buildGlobalUsageExport(TOTALS, 1234);

    expect(bundle.jsonDownloadUrl).toMatch(/^data:application\/json;charset=utf-8,/);
    expect(bundle.csvDownloadUrl).toMatch(/^data:text\/csv;charset=utf-8,/);
    expect(bundle.jsonFilename).toBe("global-usage-1234.json");
    expect(bundle.csvFilename).toBe("global-usage-1234.csv");
    expect(bundle.jsonDownloadUrl).toContain(encodeURIComponent('"turnCount"'));
  });
});

describe("buildCalibrationMeta", () => {
  it("marks calibrated when factor is valid and ≠1", () => {
    expect(buildCalibrationMeta(1.5)).toEqual({ calibrated: true, factor: 1.5 });
    expect(buildCalibrationMeta(0.6)).toEqual({ calibrated: true, factor: 0.6 });
  });

  it("returns uncalibrated meta for invalid or identity factors", () => {
    expect(buildCalibrationMeta(1)).toEqual({ calibrated: false, factor: 1 });
    expect(buildCalibrationMeta(0)).toEqual({ calibrated: false, factor: 1 });
    expect(buildCalibrationMeta(NaN)).toEqual({ calibrated: false, factor: 1 });
    expect(buildCalibrationMeta(-2)).toEqual({ calibrated: false, factor: 1 });
  });
});

describe("scaleUsageTotals", () => {
  it("scales estimatedCostUsd by factor and keeps other fields", () => {
    const scaled = scaleUsageTotals(TOTALS, 1.5);
    expect(scaled.estimatedCostUsd).toBeCloseTo(0.00123 * 1.5, 10);
    expect(scaled.turnCount).toBe(2);
    expect(scaled.inputTokens).toBe(2500);
  });

  it("returns totals unchanged when factor is identity or invalid", () => {
    expect(scaleUsageTotals(TOTALS, 1)).toBe(TOTALS);
    expect(scaleUsageTotals(TOTALS, 0)).toBe(TOTALS);
    expect(scaleUsageTotals(TOTALS, NaN)).toBe(TOTALS);
  });
});

describe("scaleUsageEntries", () => {
  it("scales each entry estimatedCostUsd and preserves other fields", () => {
    const entries = [makeEntry(), makeEntry({ id: "u2", estimatedCostUsd: 0.002 }) ];
    const scaled = scaleUsageEntries(entries, 2);
    expect(scaled[0].estimatedCostUsd).toBeCloseTo(0.0007 * 2, 10);
    expect(scaled[1].estimatedCostUsd).toBeCloseTo(0.002 * 2, 10);
    expect(scaled[0].mode).toBe("realtime");
    expect(scaled[1].recordedAt).toBe(1000);
  });

  it("returns entries unchanged when factor is identity", () => {
    expect(scaleUsageEntries([makeEntry()], 1)).toEqual([makeEntry()]);
  });
});

describe("scaleUsageReport", () => {
  it("scales report total and per-turn costs", () => {
    const report = createEmptyUsageReport();
    report.estimatedCostUsd = 0.2;
    report.turns = [
      { index: 0, recordedAt: 1000, usage: createEmptyUsage(), estimatedCostUsd: 0.1, cumulativeEstimatedCostUsd: 0.1 },
      { index: 1, recordedAt: 2000, usage: createEmptyUsage(), estimatedCostUsd: 0.1, cumulativeEstimatedCostUsd: 0.2 },
    ];
    const scaled = scaleUsageReport(report, 1.5);
    expect(scaled.estimatedCostUsd).toBeCloseTo(0.3, 10);
    expect(scaled.turns[0].estimatedCostUsd).toBeCloseTo(0.15, 10);
    expect(scaled.turns[1].cumulativeEstimatedCostUsd).toBeCloseTo(0.3, 10);
  });

  it("returns report unchanged when factor is identity", () => {
    const report = createEmptyUsageReport();
    report.estimatedCostUsd = 0.2;
    expect(scaleUsageReport(report, 1)).toBe(report);
  });
});

describe("buildCalibratedUsageExport", () => {
  it("embeds calibration metadata and scaled costs in JSON payload", () => {
    const report = createEmptyUsageReport();
    report.estimatedCostUsd = 0.2;
    report.turns = [
      { index: 0, recordedAt: 1000, usage: createEmptyUsage(), estimatedCostUsd: 0.1, cumulativeEstimatedCostUsd: 0.1 },
    ];
    const bundle = buildCalibratedUsageExport(report, 1.5, 1234);
    expect(bundle.jsonFilename).toBe("realtime-usage-1234.json");
    expect(bundle.csvFilename).toBe("realtime-usage-1234.csv");

    const decoded = decodeURIComponent(bundle.jsonDownloadUrl.replace(/^data:application\/json;charset=utf-8,/, ""));
    const parsed = JSON.parse(decoded);
    expect(parsed.calibration).toEqual({ calibrated: true, factor: 1.5 });
    expect(parsed.summary.estimatedCostUsd).toBeCloseTo(0.3, 10);
    expect(parsed.turns[0].estimatedCostUsd).toBeCloseTo(0.15, 10);
  });

  it("falls back to uncalibrated when factor is 1", () => {
    const report = createEmptyUsageReport();
    report.estimatedCostUsd = 0.2;
    const bundle = buildCalibratedUsageExport(report, 1, 1234);
    const decoded = decodeURIComponent(bundle.jsonDownloadUrl.replace(/^data:application\/json;charset=utf-8,/, ""));
    const parsed = JSON.parse(decoded);
    expect(parsed.calibration).toEqual({ calibrated: false, factor: 1 });
    expect(parsed.summary.estimatedCostUsd).toBe(0.2);
  });
});

describe("buildCalibratedGlobalUsageExport", () => {
  it("scales totals and embeds calibration columns in CSV", () => {
    const bundle = buildCalibratedGlobalUsageExport(TOTALS, 1.5, 1234);
    expect(bundle.jsonFilename).toBe("global-usage-1234.json");
    const decoded = decodeURIComponent(bundle.csvDownloadUrl.replace(/^data:text\/csv;charset=utf-8,/, ""));
    expect(decoded).toContain("calibration_factor");
    expect(decoded).toContain("1.5");
    const parsed = JSON.parse(decodeURIComponent(bundle.jsonDownloadUrl.replace(/^data:application\/json;charset=utf-8,/, "")));
    expect(parsed.calibration.calibrated).toBe(true);
    expect(parsed.totals.estimatedCostUsd).toBeCloseTo(0.00123 * 1.5, 10);
  });
});

describe("buildCalibratedSessionUsageExport", () => {
  it("scales entries and totals and embeds calibration meta", () => {
    const bundle = buildCalibratedSessionUsageExport("s1", [makeEntry()], TOTALS, 1.5, 1234);
    expect(bundle.jsonFilename).toBe("session-usage-s1-1234.json");
    const parsed = JSON.parse(decodeURIComponent(bundle.jsonDownloadUrl.replace(/^data:application\/json;charset=utf-8,/, "")));
    expect(parsed.sessionId).toBe("s1");
    expect(parsed.calibration).toEqual({ calibrated: true, factor: 1.5 });
    expect(parsed.entries[0].estimatedCostUsd).toBeCloseTo(0.0007 * 1.5, 10);
    expect(parsed.totals.estimatedCostUsd).toBeCloseTo(0.00123 * 1.5, 10);
  });
});
