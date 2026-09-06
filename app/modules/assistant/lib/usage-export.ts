/**
 * 用量导出 bundle 构建纯函数。
 *
 * 收敛 `assistant-workspace` 主组件中内联的 `usageExport` useMemo：
 * 把「导出报告序列化 → 构造下载 data URL + 文件名」的构建逻辑抽为可单测纯函数。
 *
 * 本模块只负责构建，不触发浏览器下载副作用（下载动作仍由调用方接线）。
 *
 * 扩展（会话级用量导出）：
 * - `serializeUsageTotalsCsv` / `serializeUsageEntriesCsv` / `serializeUsageTotalsJson` /
 *   `serializeUsageEntriesJson`：把 D1 持久化的会话级用量记录（`UsageTotals` /
 *   `UsageEntry[]`）序列化为 CSV / JSON，供「会话级用量导出」下载。
 */

import type { UsageReport } from "@/modules/assistant/lib/cost-model";
import {
  serializeUsageReportCsv,
  serializeUsageReportJson,
} from "@/modules/assistant/lib/cost-model";
import { buildDownloadDataUrl } from "@/modules/assistant/lib/download";
import { scaleCostValue } from "@/modules/assistant/lib/calibration-scaling";
import type {
  UsageEntry,
  UsageTotals,
} from "@/modules/assistant/lib/session-client";

/**
 * 校准回写元信息（嵌入导出的成本来源说明）。
 *
 * 当用户应用了校准回写（`factor = measured/estimated`）时，导出中的
 * `estimatedCostUsd` 会按该系数换算，使导出的成本与实测账单一致。该元信息
 * 让下游（评审 / 审计）能看出导出的成本是「原始估算」还是「已按实测校正」。
 */
export type CalibrationMeta = {
  /** 是否已按校准回写系数校正。 */
  calibrated: boolean;
  /** 应用的校正系数（未校准时为 1）。 */
  factor: number;
};

/** 用量导出 bundle：JSON / CSV 两份下载链接与文件名。 */
export type UsageExportBundle = {
  jsonDownloadUrl: string;
  csvDownloadUrl: string;
  jsonFilename: string;
  csvFilename: string;
};

/**
 * 基于当前用量报告构建 JSON / CSV 导出 bundle。
 *
 * `generatedAt` 同时用于文件名后缀与报告生成时间戳；缺省时取当前时间。
 */
export function buildUsageExport(
  report: UsageReport,
  generatedAt: number = Date.now(),
): UsageExportBundle {
  return {
    jsonDownloadUrl: buildDownloadDataUrl(
      "application/json",
      serializeUsageReportJson(report, generatedAt),
    ),
    csvDownloadUrl: buildDownloadDataUrl(
      "text/csv",
      serializeUsageReportCsv(report, generatedAt),
    ),
    jsonFilename: `realtime-usage-${generatedAt}.json`,
    csvFilename: `realtime-usage-${generatedAt}.csv`,
  };
}

/** 用量 CSV 表头（会话级导出，与 usage_entries 字段对应）。 */
const USAGE_TOTALS_CSV_HEADER = [
  "turn_count",
  "input_tokens",
  "input_text_tokens",
  "input_audio_tokens",
  "input_image_tokens",
  "cached_input_tokens",
  "cached_text_tokens",
  "cached_audio_tokens",
  "cached_image_tokens",
  "output_tokens",
  "output_text_tokens",
  "output_audio_tokens",
  "estimated_cost_usd",
].join(",");

/** 用量明细 CSV 表头（会话级导出，每轮一行）。 */
const USAGE_ENTRY_CSV_HEADER = [
  "recorded_at_ms",
  "mode",
  "input_tokens",
  "input_text_tokens",
  "input_audio_tokens",
  "input_image_tokens",
  "cached_input_tokens",
  "cached_text_tokens",
  "cached_audio_tokens",
  "cached_image_tokens",
  "output_tokens",
  "output_text_tokens",
  "output_audio_tokens",
  "estimated_cost_usd",
].join(",");

function csvCell(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  const text = String(value);

  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

/** 把 UsageTotals 汇总序列化为单行 CSV。 */
export function serializeUsageTotalsCsv(totals: UsageTotals): string {
  const row = [
    totals.turnCount,
    totals.inputTokens,
    totals.inputTextTokens,
    totals.inputAudioTokens,
    totals.inputImageTokens,
    totals.cachedInputTokens,
    totals.cachedTextTokens,
    totals.cachedAudioTokens,
    totals.cachedImageTokens,
    totals.outputTokens,
    totals.outputTextTokens,
    totals.outputAudioTokens,
    totals.estimatedCostUsd,
  ]
    .map(csvCell)
    .join(",");

  return [USAGE_TOTALS_CSV_HEADER, row].join("\n") + "\n";
}

/** 把会话级用量记录列表序列化为每轮一行的 CSV。 */
export function serializeUsageEntriesCsv(entries: readonly UsageEntry[]): string {
  const rows = entries.map((entry) =>
    [
      entry.recordedAt,
      entry.mode,
      entry.inputTokens,
      entry.inputTextTokens,
      entry.inputAudioTokens,
      entry.inputImageTokens,
      entry.cachedInputTokens,
      entry.cachedTextTokens,
      entry.cachedAudioTokens,
      entry.cachedImageTokens,
      entry.outputTokens,
      entry.outputTextTokens,
      entry.outputAudioTokens,
      entry.estimatedCostUsd,
    ]
      .map(csvCell)
      .join(","),
  );

  // 末尾附一行 totals 汇总。
  const totalsRow = [
    Date.now(),
    "totals",
    entries.reduce((sum, entry) => sum + entry.inputTokens, 0),
    entries.reduce((sum, entry) => sum + entry.inputTextTokens, 0),
    entries.reduce((sum, entry) => sum + entry.inputAudioTokens, 0),
    entries.reduce((sum, entry) => sum + entry.inputImageTokens, 0),
    entries.reduce((sum, entry) => sum + entry.cachedInputTokens, 0),
    entries.reduce((sum, entry) => sum + entry.cachedTextTokens, 0),
    entries.reduce((sum, entry) => sum + entry.cachedAudioTokens, 0),
    entries.reduce((sum, entry) => sum + entry.cachedImageTokens, 0),
    entries.reduce((sum, entry) => sum + entry.outputTokens, 0),
    entries.reduce((sum, entry) => sum + entry.outputTextTokens, 0),
    entries.reduce((sum, entry) => sum + entry.outputAudioTokens, 0),
    entries.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0),
  ]
    .map(csvCell)
    .join(",");

  return [USAGE_ENTRY_CSV_HEADER, ...rows, totalsRow].join("\n") + "\n";
}

/** 把 UsageTotals 汇总序列化为 JSON。 */
export function serializeUsageTotalsJson(
  totals: UsageTotals,
  generatedAt: number = Date.now(),
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt,
      totals,
    },
    null,
    2,
  )}\n`;
}

/** 全局累计用量导出 bundle（JSON + CSV）。 */
export function buildGlobalUsageExport(
  totals: UsageTotals,
  generatedAt: number = Date.now(),
): UsageExportBundle {
  return {
    jsonDownloadUrl: buildDownloadDataUrl(
      "application/json",
      serializeUsageTotalsJson(totals, generatedAt),
    ),
    csvDownloadUrl: buildDownloadDataUrl(
      "text/csv",
      serializeUsageTotalsCsv(totals),
    ),
    jsonFilename: `global-usage-${generatedAt}.json`,
    csvFilename: `global-usage-${generatedAt}.csv`,
  };
}

/** 把会话级用量记录列表序列化为 JSON。 */
export function serializeUsageEntriesJson(
  sessionId: string,
  entries: readonly UsageEntry[],
  generatedAt: number = Date.now(),
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt,
      sessionId,
      entries,
    },
    null,
    2,
  )}\n`;
}

/**
 * 会话级用量导出 bundle（JSON + CSV）。
 *
 * 用于把某会话的持久化用量记录（明细 + 汇总）导出为可下载文件。
 */
export function buildSessionUsageExport(
  sessionId: string,
  entries: readonly UsageEntry[],
  totals: UsageTotals,
  generatedAt: number = Date.now(),
): UsageExportBundle {
  return {
    jsonDownloadUrl: buildDownloadDataUrl(
      "application/json",
      serializeUsageEntriesJson(sessionId, entries, generatedAt),
    ),
    csvDownloadUrl: buildDownloadDataUrl(
      "text/csv",
      serializeUsageEntriesCsv(entries),
    ),
    jsonFilename: `session-usage-${sessionId}-${generatedAt}.json`,
    csvFilename: `session-usage-${sessionId}-${generatedAt}.csv`,
  };
}

/** 未应用校准时导出的校准元信息。 */
export const EMPTY_CALIBRATION_META: CalibrationMeta = {
  calibrated: false,
  factor: 1,
};

/**
 * 构造校准元信息。
 *
 * `factor` 非法或等于 1 时返回「未校准」元信息；否则标记为已校准并携带系数。
 */
export function buildCalibrationMeta(factor: number): CalibrationMeta {
  const active =
    Number.isFinite(factor) && factor > 0 && factor !== 1;
  return active ? { calibrated: true, factor } : EMPTY_CALIBRATION_META;
}

/**
 * 把 UsageTotals 汇总的估算成本按校准系数换算（其余用量字段不变）。
 *
 * `factor` 非法或等于 1 时原样返回（未校准时行为不变）。
 */
export function scaleUsageTotals(
  totals: UsageTotals,
  factor: number,
): UsageTotals {
  if (!(Number.isFinite(factor) && factor > 0 && factor !== 1)) {
    return totals;
  }
  return {
    ...totals,
    estimatedCostUsd: scaleCostValue(totals.estimatedCostUsd, factor),
  };
}

/**
 * 把会话级用量记录列表的估算成本按校准系数换算（其余字段不变）。
 */
export function scaleUsageEntries(
  entries: readonly UsageEntry[],
  factor: number,
): UsageEntry[] {
  if (!(Number.isFinite(factor) && factor > 0 && factor !== 1)) {
    return entries as UsageEntry[];
  }
  return entries.map((entry) => ({
    ...entry,
    estimatedCostUsd: scaleCostValue(entry.estimatedCostUsd, factor),
  }));
}

/**
 * 把实时/聊天用量报告按校准系数换算（turns + totals + 汇总成本）。
 */
export function scaleUsageReport(
  report: UsageReport,
  factor: number,
): UsageReport {
  if (!(Number.isFinite(factor) && factor > 0 && factor !== 1)) {
    return report;
  }
  return {
    ...report,
    estimatedCostUsd: scaleCostValue(report.estimatedCostUsd, factor),
    turns: report.turns.map((turn) => ({
      ...turn,
      estimatedCostUsd: scaleCostValue(turn.estimatedCostUsd, factor),
      cumulativeEstimatedCostUsd: scaleCostValue(
        turn.cumulativeEstimatedCostUsd,
        factor,
      ),
    })),
  };
}

/**
 * 基于用量报告构建「已按校准回写系数校正」的 JSON/CSV 导出 bundle。
 *
 * 把当前用量报告的 `estimatedCostUsd` 统一按 `factor` 换算，使导出的成本
 * 与实测账单一致；并附带校准元信息（`factor`、`calibrated`）。未校准（
 * `factor` 非法或 =1）时退化为原始导出。
 */
export function buildCalibratedUsageExport(
  report: UsageReport,
  factor: number,
  generatedAt: number = Date.now(),
): UsageExportBundle {
  const scaledReport = scaleUsageReport(report, factor);
  const meta = buildCalibrationMeta(factor);
  return {
    jsonDownloadUrl: buildDownloadDataUrl(
      "application/json",
      serializeCalibratedUsageReportJson(scaledReport, meta, generatedAt),
    ),
    csvDownloadUrl: buildDownloadDataUrl(
      "text/csv",
      serializeCalibratedUsageReportCsv(scaledReport, meta, generatedAt),
    ),
    jsonFilename: `realtime-usage-${generatedAt}.json`,
    csvFilename: `realtime-usage-${generatedAt}.csv`,
  };
}

/**
 * 基于跨会话累计汇总构建「已按校准回写系数校正」的 JSON/CSV 导出 bundle。
 */
export function buildCalibratedGlobalUsageExport(
  totals: UsageTotals,
  factor: number,
  generatedAt: number = Date.now(),
): UsageExportBundle {
  const scaledTotals = scaleUsageTotals(totals, factor);
  const meta = buildCalibrationMeta(factor);
  return {
    jsonDownloadUrl: buildDownloadDataUrl(
      "application/json",
      serializeCalibratedUsageTotalsJson(scaledTotals, meta, generatedAt),
    ),
    csvDownloadUrl: buildDownloadDataUrl(
      "text/csv",
      serializeCalibratedUsageTotalsCsv(scaledTotals, meta),
    ),
    jsonFilename: `global-usage-${generatedAt}.json`,
    csvFilename: `global-usage-${generatedAt}.csv`,
  };
}

/**
 * 基于会话级用量记录构建「已按校准回写系数校正」的 JSON/CSV 导出 bundle。
 */
export function buildCalibratedSessionUsageExport(
  sessionId: string,
  entries: readonly UsageEntry[],
  totals: UsageTotals,
  factor: number,
  generatedAt: number = Date.now(),
): UsageExportBundle {
  const scaledEntries = scaleUsageEntries(entries, factor);
  const scaledTotals = scaleUsageTotals(totals, factor);
  const meta = buildCalibrationMeta(factor);
  return {
    jsonDownloadUrl: buildDownloadDataUrl(
      "application/json",
      serializeCalibratedUsageEntriesJson(
        sessionId,
        scaledEntries,
        scaledTotals,
        meta,
        generatedAt,
      ),
    ),
    csvDownloadUrl: buildDownloadDataUrl(
      "text/csv",
      serializeCalibratedUsageEntriesCsv(scaledEntries, meta),
    ),
    jsonFilename: `session-usage-${sessionId}-${generatedAt}.json`,
    csvFilename: `session-usage-${sessionId}-${generatedAt}.csv`,
  };
}

// ---- 校准感知的序列化辅助（在原始序列化基础上嵌入校准元信息）----

/** 把校准感知的全局汇总序列化为 JSON（附校准元信息）。 */
function serializeCalibratedUsageTotalsJson(
  totals: UsageTotals,
  meta: CalibrationMeta,
  generatedAt: number,
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt,
      calibration: meta,
      totals,
    },
    null,
    2,
  )}\n`;
}

/** 把校准感知的全局汇总序列化为 CSV（追加校准系数列）。 */
function serializeCalibratedUsageTotalsCsv(
  totals: UsageTotals,
  meta: CalibrationMeta,
): string {
  const header = [
    ...USAGE_TOTALS_CSV_HEADER.split(","),
    "calibration_factor",
    "calibrated",
  ].join(",");
  const row = [
    ...USAGE_TOTALS_CSV_HEADER.split(",").map((key) =>
      csvCell(rowValueForHeader(totals, key)),
    ),
    csvCell(meta.factor),
    csvCell(meta.calibrated ? 1 : 0),
  ].join(",");
  return [header, row].join("\n") + "\n";
}

/** 从 totals 按 CSV 表头取值（避免重复定义映射）。 */
function rowValueForHeader(
  totals: UsageTotals,
  key: string,
): string | number {
  switch (key) {
    case "turn_count":
      return totals.turnCount;
    case "input_tokens":
      return totals.inputTokens;
    case "input_text_tokens":
      return totals.inputTextTokens;
    case "input_audio_tokens":
      return totals.inputAudioTokens;
    case "input_image_tokens":
      return totals.inputImageTokens;
    case "cached_input_tokens":
      return totals.cachedInputTokens;
    case "cached_text_tokens":
      return totals.cachedTextTokens;
    case "cached_audio_tokens":
      return totals.cachedAudioTokens;
    case "cached_image_tokens":
      return totals.cachedImageTokens;
    case "output_tokens":
      return totals.outputTokens;
    case "output_text_tokens":
      return totals.outputTextTokens;
    case "output_audio_tokens":
      return totals.outputAudioTokens;
    case "estimated_cost_usd":
      return totals.estimatedCostUsd;
    default:
      return "";
  }
}

/** 把校准感知的会话级明细序列化为 JSON（附校准元信息与换算后汇总）。 */
function serializeCalibratedUsageEntriesJson(
  sessionId: string,
  entries: readonly UsageEntry[],
  totals: UsageTotals,
  meta: CalibrationMeta,
  generatedAt: number,
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt,
      sessionId,
      calibration: meta,
      totals,
      entries,
    },
    null,
    2,
  )}\n`;
}

/** 把校准感知的会话级明细序列化为 CSV（追加校准系数列）。 */
function serializeCalibratedUsageEntriesCsv(
  entries: readonly UsageEntry[],
  meta: CalibrationMeta,
): string {
  const header = [
    ...USAGE_ENTRY_CSV_HEADER.split(","),
    "calibration_factor",
    "calibrated",
  ].join(",");
  const rows = entries.map((entry) =>
    [
      entry.recordedAt,
      entry.mode,
      entry.inputTokens,
      entry.inputTextTokens,
      entry.inputAudioTokens,
      entry.inputImageTokens,
      entry.cachedInputTokens,
      entry.cachedTextTokens,
      entry.cachedAudioTokens,
      entry.cachedImageTokens,
      entry.outputTokens,
      entry.outputTextTokens,
      entry.outputAudioTokens,
      entry.estimatedCostUsd,
      meta.factor,
      meta.calibrated ? 1 : 0,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}

/** 把校准感知的用量报告序列化为 JSON（附校准元信息）。 */
function serializeCalibratedUsageReportJson(
  report: UsageReport,
  meta: CalibrationMeta,
  generatedAt: number,
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt,
      calibration: meta,
      summary: { turnCount: report.turnCount, estimatedCostUsd: report.estimatedCostUsd },
      totals: report.totals,
      lastTurn: report.lastTurn,
      turns: report.turns,
    },
    null,
    2,
  )}\n`;
}

/** 把校准感知的用量报告序列化为 CSV（追加校准系数列）。 */
function serializeCalibratedUsageReportCsv(
  report: UsageReport,
  meta: CalibrationMeta,
  generatedAt: number,
): string {
  const header = [
    "index",
    "recorded_at_ms",
    "estimated_cost_usd",
    "cumulative_estimated_cost_usd",
    "calibration_factor",
    "calibrated",
  ].join(",");
  const rows = report.turns.map((turn) =>
    [
      turn.index,
      turn.recordedAt,
      turn.estimatedCostUsd,
      turn.cumulativeEstimatedCostUsd,
      meta.factor,
      meta.calibrated ? 1 : 0,
    ]
      .map(csvCell)
      .join(","),
  );
  const summaryRow = [
    "summary",
    generatedAt,
    report.estimatedCostUsd,
    report.estimatedCostUsd,
    meta.factor,
    meta.calibrated ? 1 : 0,
  ]
    .map(csvCell)
    .join(",");
  return [header, ...rows, summaryRow].join("\n") + "\n";
}
