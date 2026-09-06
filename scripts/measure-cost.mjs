#!/usr/bin/env node
/**
 * Live Cost Measurement 实测分析命令行工具（外部项）。
 *
 * 输入：一份 JSON 实测记录（`CalibrationRecord` 结构），含价格集 + 来源 +
 * 逐条「估算 vs 实测」样本；输出：一份可直接写入 `docs/cost-calibration.md`
 * 或 PR 描述的 Markdown 校准报告。
 *
 * 用法：
 *   node scripts/measure-cost.mjs <input.json> [-o report.md]
 *
 * 输入 JSON 结构示例：
 *   {
 *     "priceSet": "gpt-realtime-pricing" | "chat-pricing",
 *     "source": "OpenAI 控制台 2026-08 账单",
 *     "generatedAt": 1756000000000,
 *     "samples": [
 *       {
 *         "label": "标准5轮（Realtime）",
 *         "estimatedUsd": 0.1,
 *         "measuredUsd": 0.12,
 *         "inputTokens": 10000,
 *         "outputTokens": 2000,
 *         "recordedAt": 1756000000000
 *       }
 *     ]
 *   }
 *
 * 本脚本是自包含的独立分析器（不依赖前端 TS 模块 / 路径别名），逻辑与
 * `app/modules/assistant/lib/calibration-report.ts` 保持一致，二者都通过
 * 同一批「估算 vs 实测」样本产出相同的偏差 / 建议结论，使实测流程可复现。
 * 单价假设见 `docs/cost-calibration.md`；真实账单以 provider 控制台为准。
 */
import { readFileSync, writeFileSync } from "node:fs";

/** 维持当前单价的最大偏差（%）；超过则建议回调。 */
const RECALIBRATE_THRESHOLD_PCT = 10;

/** 前端估算价格集对照（USD/1M token），来源见 docs/cost-calibration.md。 */
const PRICE_SET_REFERENCE = {
  "gpt-realtime-pricing": {
    inputText: 4,
    cachedText: 0.4,
    inputAudio: 32,
    cachedAudio: 0.4,
    inputImage: 5,
    cachedImage: 0.5,
    outputText: 16,
    outputAudio: 64,
  },
  "chat-pricing": {
    inputText: 3,
    cachedText: 0.3,
    inputImage: 6,
    outputText: 15,
  },
};

function clampNonNegative(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** 由一组样本推导建议校正系数（factor = measured/estimated，夹在 [0.2, 5]）。 */
function computeFactor(samples) {
  const totalEstimated = samples.reduce(
    (sum, s) => sum + clampNonNegative(s.estimatedUsd),
    0,
  );
  const totalMeasured = samples.reduce(
    (sum, s) => sum + clampNonNegative(s.measuredUsd),
    0,
  );
  if (totalEstimated <= 0 || totalMeasured <= 0) {
    return null;
  }
  const deviationPct = Math.abs(((totalMeasured - totalEstimated) / totalEstimated) * 100);
  if (deviationPct <= RECALIBRATE_THRESHOLD_PCT) {
    return null;
  }
  const raw = totalMeasured / totalEstimated;
  return Math.min(5, Math.max(0.2, raw));
}

/** 构建实测报告（与 calibration-report.ts 输出结构一致）。 */
function buildReport(record) {
  const rows = record.samples.map((sample) => {
    const estimated = clampNonNegative(sample.estimatedUsd);
    const measured = clampNonNegative(sample.measuredUsd);
    const absoluteDeltaUsd = measured - estimated;
    const relativeDeltaPct = estimated > 0 ? (absoluteDeltaUsd / estimated) * 100 : 0;
    const tokens = (sample.inputTokens ?? 0) + (sample.outputTokens ?? 0);
    const measuredPricePerMillion =
      tokens > 0 ? (measured / tokens) * 1_000_000 : 0;
    return {
      label: sample.label,
      estimatedUsd: estimated,
      measuredUsd: measured,
      absoluteDeltaUsd,
      relativeDeltaPct,
      overrun: measured > estimated,
      measuredPricePerMillion,
    };
  });

  const totalEstimatedUsd = rows.reduce((sum, r) => sum + r.estimatedUsd, 0);
  const totalMeasuredUsd = rows.reduce((sum, r) => sum + r.measuredUsd, 0);
  const totalAbsoluteDeltaUsd = totalMeasuredUsd - totalEstimatedUsd;
  const totalRelativeDeltaPct =
    totalEstimatedUsd > 0 ? (totalAbsoluteDeltaUsd / totalEstimatedUsd) * 100 : 0;
  const totalTokens = record.samples.reduce(
    (sum, s) => sum + (s.inputTokens ?? 0) + (s.outputTokens ?? 0),
    0,
  );
  const measuredPricePerMillion =
    totalTokens > 0 ? (totalMeasuredUsd / totalTokens) * 1_000_000 : 0;

  const factor = computeFactor(record.samples);
  const conclusion =
    Math.abs(totalRelativeDeltaPct) > RECALIBRATE_THRESHOLD_PCT
      ? record.priceSet === "chat-pricing"
        ? "recalibrate-chat"
        : "recalibrate-realtime"
      : "maintain";

  return {
    schemaVersion: 1,
    generatedAt: record.generatedAt,
    source: record.source,
    priceSet: record.priceSet,
    rows,
    totalEstimatedUsd,
    totalMeasuredUsd,
    totalAbsoluteDeltaUsd,
    totalRelativeDeltaPct,
    overrun: totalMeasuredUsd > totalEstimatedUsd,
    measuredPricePerMillion,
    priceSetReference: PRICE_SET_REFERENCE[record.priceSet],
    suggestedFactor: factor,
    conclusion,
    disclaimer:
      "真实账单以 provider 控制台为准。上方金额仅供参考，请在核对自己账单后再作依赖。",
  };
}

function serializeReport(report) {
  const lines = [
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
        `| ${row.label} | ${row.estimatedUsd.toFixed(4)} | ${row.measuredUsd.toFixed(4)} | ` +
        `${row.absoluteDeltaUsd.toFixed(4)} | ${row.relativeDeltaPct.toFixed(1)}% | ` +
        `${row.measuredPricePerMillion.toFixed(2)} |`,
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
      `- **结论**：偏差 ≤ ${RECALIBRATE_THRESHOLD_PCT}%，**维持当前估算单价**。`,
    );
  } else {
    lines.push(
      `- **结论**：偏差 > ${RECALIBRATE_THRESHOLD_PCT}%，建议**回调估算单价**`,
      `（${report.priceSet === "chat-pricing" ? "chat-cost-model" : "cost-model"}）。`,
      `- **建议校正系数**：×${report.suggestedFactor?.toFixed(3) ?? "—"}（已由实测/估算推导，夹在 [0.2, 5]）。`,
    );
  }

  lines.push("", "## 兜底口径", "", `> ${report.disclaimer}`, "");
  return lines.join("\n");
}

function main() {
  const [inputPath, ...rest] = process.argv.slice(2);
  if (!inputPath || inputPath === "-h" || inputPath === "--help") {
    console.log(
      "用法: node scripts/measure-cost.mjs <input.json> [-o report.md]\n" +
        "输入为 CalibrationRecord JSON（priceSet/source/generatedAt/samples）。",
    );
    process.exit(inputPath ? 0 : 1);
  }

  let record;
  try {
    record = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch (err) {
    console.error(`无法读取输入 JSON（${inputPath}）：${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(record.samples)) {
    console.error("输入缺少 samples 数组。");
    process.exit(1);
  }
  record.schemaVersion = 1;
  record.priceSet =
    record.priceSet === "chat-pricing" ? "chat-pricing" : "gpt-realtime-pricing";
  record.source = record.source ?? "provider-console";
  record.generatedAt = record.generatedAt ?? Date.now();

  const report = buildReport(record);
  const markdown = serializeReport(report);

  const outFlagIndex = rest.indexOf("-o");
  if (outFlagIndex >= 0 && rest[outFlagIndex + 1]) {
    writeFileSync(rest[outFlagIndex + 1], markdown, "utf8");
    console.log(`报告已写入：${rest[outFlagIndex + 1]}`);
  } else {
    console.log(markdown);
  }

  console.error(
    `[measure-cost] conclusion=${report.conclusion} ` +
      `deltaPct=${report.totalRelativeDeltaPct.toFixed(1)} ` +
      `suggestedFactor=${report.suggestedFactor?.toFixed(3) ?? "null"}`,
  );
}

main();
