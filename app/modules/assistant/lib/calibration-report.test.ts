import { describe, expect, it } from "vitest";

import { buildCalibrationReport, serializeCalibrationReportMarkdown } from "./calibration-report";
import type { CalibrationRecord } from "./cost-calibration";

function makeRecord(
  samples: CalibrationRecord["samples"],
  priceSet: "gpt-realtime-pricing" | "chat-pricing" = "gpt-realtime-pricing",
): CalibrationRecord {
  return {
    schemaVersion: 1,
    priceSet,
    source: "unit-test-provider",
    generatedAt: 1234,
    samples,
  };
}

describe("buildCalibrationReport", () => {
  it("builds rows with per-sample deltas and measured price", () => {
    const report = buildCalibrationReport(
      makeRecord([
        {
          label: "s1",
          estimatedUsd: 0.1,
          measuredUsd: 0.12,
          inputTokens: 10_000,
          outputTokens: 2_000,
          recordedAt: 1000,
        },
      ]),
    );

    expect(report.rows).toHaveLength(1);
    const row = report.rows[0];
    expect(row.absoluteDeltaUsd).toBeCloseTo(0.02, 6);
    expect(row.relativeDeltaPct).toBeCloseTo(20, 6);
    expect(row.overrun).toBe(true);
    // 实测单价：0.12 / 12k tokens → 10 USD/1M。
    expect(row.measuredPricePerMillion).toBeCloseTo(10, 6);
  });

  it("computes summary totals and overall measured price", () => {
    const report = buildCalibrationReport(
      makeRecord([
        { label: "s1", estimatedUsd: 0.1, measuredUsd: 0.12, inputTokens: 10_000, outputTokens: 2_000, recordedAt: 1000 },
        { label: "s2", estimatedUsd: 0.2, measuredUsd: 0.18, inputTokens: 8_000, outputTokens: 1_000, recordedAt: 2000 },
      ]),
    );

    expect(report.totalEstimatedUsd).toBeCloseTo(0.3, 6);
    expect(report.totalMeasuredUsd).toBeCloseTo(0.3, 6);
    expect(report.totalAbsoluteDeltaUsd).toBeCloseTo(0, 6);
    expect(report.overrun).toBe(false);
    // 整体实测单价：0.3 / 21k tokens → ~14.286 USD/1M。
    expect(report.measuredPricePerMillion).toBeCloseTo(0.3 / 21000 * 1_000_000, 6);
  });

  it("concludes maintain when deviation ≤ threshold", () => {
    const report = buildCalibrationReport(
      makeRecord([
        { label: "s1", estimatedUsd: 0.1, measuredUsd: 0.103, inputTokens: 10_000, outputTokens: 2_000, recordedAt: 1000 },
      ]),
    );
    expect(report.conclusion).toBe("maintain");
    expect(report.suggestedFactor).toBeNull();
  });

  it("concludes recalibrate-realtime when deviation exceeds threshold", () => {
    const report = buildCalibrationReport(
      makeRecord([
        { label: "s1", estimatedUsd: 0.1, measuredUsd: 0.15, inputTokens: 10_000, outputTokens: 2_000, recordedAt: 1000 },
      ]),
    );
    expect(report.conclusion).toBe("recalibrate-realtime");
    expect(report.suggestedFactor).toBeCloseTo(1.5, 6);
  });

  it("concludes recalibrate-chat for chat price set", () => {
    const report = buildCalibrationReport(
      makeRecord(
        [
          { label: "s1", estimatedUsd: 0.1, measuredUsd: 0.15, inputTokens: 10_000, outputTokens: 2_000, recordedAt: 1000 },
        ],
        "chat-pricing",
      ),
    );
    expect(report.conclusion).toBe("recalibrate-chat");
  });

  it("embeds price set reference and disclaimer", () => {
    const report = buildCalibrationReport(
      makeRecord([
        { label: "s1", estimatedUsd: 0.1, measuredUsd: 0.12, inputTokens: 10_000, outputTokens: 2_000, recordedAt: 1000 },
      ]),
    );
    expect(report.priceSetReference).toBeTruthy();
    expect(report.disclaimer).toContain("provider 控制台为准");
  });
});

describe("serializeCalibrationReportMarkdown", () => {
  it("serializes a markdown report with header, table, summary, conclusion, disclaimer", () => {
    const report = buildCalibrationReport(
      makeRecord([
        { label: "标准5轮", estimatedUsd: 0.1, measuredUsd: 0.12, inputTokens: 10_000, outputTokens: 2_000, recordedAt: 1000 },
      ]),
    );
    const md = serializeCalibrationReportMarkdown(report);
    expect(md).toContain("# Live Cost Measurement 实测报告");
    expect(md).toContain("| 场景 | 估算(USD)");
    expect(md).toContain("| 标准5轮 |");
    expect(md).toContain("## 汇总");
    expect(md).toContain("## 校准结论");
    expect(md).toContain("## 兜底口径");
    expect(md).toContain("provider 控制台为准");
  });
});
