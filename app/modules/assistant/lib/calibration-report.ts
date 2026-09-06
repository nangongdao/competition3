/**
 * 外部项：Live Cost Measurement 实测报告构建（calibration report）。
 *
 * 前端估算成本依赖 `cost-model` / `chat-cost-model` 里的硬编码单价假设。
 * 「外部 live cost measurement 实测」是指：接真实 provider 跑一轮实测，用
 * 实际账单校准前端单价。本模块把实测数据（`CalibrationRecord`）固化为一份
 * 结构化、可复现、可直接引用到 `docs/cost-calibration.md` 校准报告：
 *
 *   - 逐条观测：估算 vs 实测差异（绝对差 / 相对%）；
 *   - 汇总：总量、总偏差、整体是否超支；
 *   - 实测混合单价（USD/1M）与前端价格集对照；
 *   - 校准结论与建议（偏差 <10% 维持 / >10% 回调单价），并按
 *     `computeCalibrationFactor` 给出建议校正系数；
 *   - 兜底口径（真实账单以 provider 控制台为准）。
 *
 * 纯函数、无副作用，便于单测，也可被 `scripts/measure-cost.mjs` 命令行消费，
 * 使「跑一次实测 → 出一份报告」可复现。
 */

import { summarizeCalibration } from "./cost-calibration";
import type {
  CalibrationRecord,
  CalibrationSample,
} from "./cost-calibration";
import { computeCalibrationDelta } from "./cost-calibration";
import { computeCalibrationFactor } from "./calibration-writeback";
import {
  REALTIME_PRICES_USD_PER_MILLION,
} from "./cost-model";
import { CHAT_PRICES_USD_PER_MILLION } from "./chat-cost-model";

/** 校准结论类型。 */
export type CalibrationConclusion =
  | "maintain"
  | "recalibrate-realtime"
  | "recalibrate-chat";

/** 单条实测观测的报告行。 */
export type CalibrationReportRow = {
  label: string;
  estimatedUsd: number;
  measuredUsd: number;
  absoluteDeltaUsd: number;
  relativeDeltaPct: number;
  overrun: boolean;
  measuredPricePerMillion: number;
};

/** 实测报告的汇总与结论。 */
export type CalibrationReport = {
  schemaVersion: 1;
  generatedAt: number;
  source: string;
  priceSet: "gpt-realtime-pricing" | "chat-pricing";
  rows: readonly CalibrationReportRow[];
  totalEstimatedUsd: number;
  totalMeasuredUsd: number;
  totalAbsoluteDeltaUsd: number;
  totalRelativeDeltaPct: number;
  overrun: boolean;
  /** 整体实测混合单价（USD/1M token）。 */
  measuredPricePerMillion: number;
  /** 前端估算价格集的表头单价（USD/1M），用于对照。 */
  priceSetReference: Record<string, number>;
  /** 建议校正系数（偏差 >10% 时有值，否则 null）。 */
  suggestedFactor: number | null;
  /** 校准结论：维持 / 回调 Realtime / 回调 Chat。 */
  conclusion: CalibrationConclusion;
  /** 兜底口径说明（真实账单以 provider 控制台为准）。 */
  disclaimer: string;
};

/** 前端估算价格集对照（用于与实测单价比对）。 */
export const PRICE_SET_REFERENCE: Record<
  "gpt-realtime-pricing" | "chat-pricing",
  Record<string, number>
> = {
  "gpt-realtime-pricing": REALTIME_PRICES_USD_PER_MILLION,
  "chat-pricing": CHAT_PRICES_USD_PER_MILLION,
};

/** 维持当前单价的最大偏差（%）；超过则建议回调。 */
export const CALIBRATION_RECALIBRATE_THRESHOLD_PCT = 10;

/**
 * 构建一份 live cost measurement 实测报告。
 *
 * @param record 实测记录（价格集 + 来源 + 样本）。
 * @returns 结构化实测报告（含逐条差异、汇总、实测单价、结论）。
 */
export function buildCalibrationReport(
  record: CalibrationRecord,
): CalibrationReport {
  const summary = summarizeCalibration(record.samples);
  const rows = record.samples.map(buildReportRow);

  // 汇总整体实测单价：由总量 + 总 token 反推（若无 token 用量则 0）。
  const totalTokens = record.samples.reduce(
    (sum, sample) =>
      sum +
      (sample.inputTokens ?? 0) +
      (sample.outputTokens ?? 0),
    0,
  );
  const measuredPrice =
    totalTokens > 0 ? (summary.totalMeasuredUsd / totalTokens) * 1_000_000 : 0;

  const factor = computeCalibrationFactor(record.samples);
  const deviationPct = Math.abs(summary.totalRelativeDeltaPct);

  let conclusion: CalibrationConclusion = "maintain";
  if (deviationPct > CALIBRATION_RECALIBRATE_THRESHOLD_PCT) {
    conclusion =
      record.priceSet === "chat-pricing"
        ? "recalibrate-chat"
        : "recalibrate-realtime";
  }

  return {
    schemaVersion: 1,
    generatedAt: record.generatedAt,
    source: record.source,
    priceSet: record.priceSet,
    rows,
    totalEstimatedUsd: summary.totalEstimatedUsd,
    totalMeasuredUsd: summary.totalMeasuredUsd,
    totalAbsoluteDeltaUsd: summary.totalAbsoluteDeltaUsd,
    totalRelativeDeltaPct: summary.totalRelativeDeltaPct,
    overrun: summary.overrun,
    measuredPricePerMillion: measuredPrice,
    priceSetReference: PRICE_SET_REFERENCE[record.priceSet],
    suggestedFactor: factor,
    conclusion,
    disclaimer:
      "真实账单以 provider 控制台为准。上方金额仅供参考，请在核对自己账单后再作依赖。",
  };
}

function buildReportRow(sample: CalibrationSample): CalibrationReportRow {
  const delta = computeCalibrationDelta(sample);
  return {
    label: sample.label,
    estimatedUsd: delta.estimatedUsd,
    measuredUsd: delta.measuredUsd,
    absoluteDeltaUsd: delta.absoluteDeltaUsd,
    relativeDeltaPct: delta.relativeDeltaPct,
    overrun: delta.overrun,
    measuredPricePerMillion: measuredPriceForSample(sample),
  };
}

function measuredPriceForSample(sample: CalibrationSample): number {
  const tokens =
    (sample.inputTokens ?? 0) + (sample.outputTokens ?? 0);
  if (tokens <= 0) {
    return 0;
  }
  return (sample.measuredUsd / tokens) * 1_000_000;
}

/**
 * 把实测报告序列化为 Markdown（可直接写入 `docs/` 或 PR 描述）。
 */
export function serializeCalibrationReportMarkdown(
  report: CalibrationReport,
): string {
  const lines: string[] = [
    "# Live Cost Measurement 实测报告",
    "",
    `- **实测来源**：${report.source}`,
    `- **价格集**：${report.priceSet}`,
    `- **生成时间**：${new Date(report.generatedAt).toISOString()}`,
    "",
    "## 逐条观测（估算 vs 实测）",
    "",
    "| 场景 | 估算(USD) | 实测(USD) | 绝对差(USD) | 相对差% | 实测单价(USD/1M) |",
    "|---|---|---|---|---|---|",
    ...report.rows.map(
      (row) =>
        `| ${row.label} | ${row.estimatedUsd.toFixed(4)} | ` +
        `${row.measuredUsd.toFixed(4)} | ${row.absoluteDeltaUsd.toFixed(4)} | ` +
        `${row.relativeDeltaPct.toFixed(1)}% | ${row.measuredPricePerMillion.toFixed(2)} |`,
    ),
    "",
    "## 汇总",
    "",
    `- 估算总成本：$${report.totalEstimatedUsd.toFixed(4)}`,
    `- 实测总成本：$${report.totalMeasuredUsd.toFixed(4)}`,
    `- 总绝对偏差：$${report.totalAbsoluteDeltaUsd.toFixed(4)}`,
    `- 总相对偏差：${report.totalRelativeDeltaPct.toFixed(1)}%`,
    `- 整体实测混合单价：$${report.measuredPricePerMillion.toFixed(2)} / 1M tokens`,
    "",
    "## 校准结论",
    "",
  ];

  if (report.conclusion === "maintain") {
    lines.push(
      `- **结论**：偏差 ≤ ${CALIBRATION_RECALIBRATE_THRESHOLD_PCT}%，**维持当前估算单价**。`,
    );
  } else {
    lines.push(
      `- **结论**：偏差 > ${CALIBRATION_RECALIBRATE_THRESHOLD_PCT}%，建议**回调估算单价**`,
      `（${report.priceSet === "chat-pricing" ? "chat-cost-model" : "cost-model"}）。`,
      `- **建议校正系数**：×${report.suggestedFactor?.toFixed(3) ?? "—"}（` +
        "已按 computeCalibrationFactor 由实测/估算推导，夹在 [0.2, 5]）。",
    );
  }

  lines.push("", "## 兜底口径", "", `> ${report.disclaimer}`, "");

  return lines.join("\n");
}
