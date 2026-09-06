import { memo, useState } from "react";
import { Activity, AlertTriangle, Download, PiggyBank, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  compareResolutionCosts,
  describeBillSource,
  estimateSkippedFramesSavings,
  formatTokens,
  formatUsd,
  type UsageReport,
} from "@/modules/assistant/lib/cost-model";
import type { UsageTrendSeries } from "@/modules/assistant/lib/usage-trend";
import { SessionUsageTrendChart } from "./session-usage-trend-chart";
import {
  buildPriceTable,
  formatPricePerMillion,
} from "@/modules/assistant/lib/usage-prices";
import {
  computeBudgetProgress,
  parseBudgetInput,
} from "@/modules/assistant/lib/budget-guard";

type UsagePanelProps = {
  usageReport: UsageReport;
  usageExport: {
    jsonDownloadUrl: string;
    csvDownloadUrl: string;
    jsonFilename: string;
    csvFilename: string;
  };
  isVisible: boolean;
  /** 已自动跳过的帧数（用于把帧数翻译为≈节省金额）。 */
  skippedAutoFrameCount: number;
  /** 采样帧宽度（像素）。 */
  sampleWidth: number;
  /** 采样帧高度（像素）。 */
  sampleHeight: number;
  /** 当前为 Chat 模式（用量为前端估算，非 Realtime `response.done` 权威计量）。 */
  isChatMode?: boolean;
  /**
   * 会话级用量导出 bundle（D1 持久化的会话用量记录）。
   * 缺省/未加载时不渲染「会话级用量」导出区。
   */
  sessionUsageExport?: {
    jsonDownloadUrl: string;
    csvDownloadUrl: string;
    jsonFilename: string;
    csvFilename: string;
  } | null;
  /**
   * 会话级用量趋势序列（② 功能增量）。
   * 缺省/无记录时不渲染趋势图表。
   */
  sessionUsageTrend?: UsageTrendSeries | null;
  /**
   * 会话级成本预算上限（USD）。
   * 缺省/null 表示未设置预算，不渲染进度条（仅保留设置入口）。
   */
  budgetUsd?: number | null;
  /** 用户确认设置/清除预算时的回调（null 表示清除）。 */
  onBudgetSet?: (usd: number | null) => void;
};

/**
 * 用量与成本面板（Realtime 权威计量 / Chat 前端估算）。
 */
export const UsagePanel = memo(function UsagePanel({
  usageReport,
  usageExport,
  isVisible,
  skippedAutoFrameCount,
  sampleWidth,
  sampleHeight,
  isChatMode = false,
  sessionUsageExport = null,
  sessionUsageTrend = null,
  budgetUsd = null,
  onBudgetSet,
}: UsagePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [budgetDraft, setBudgetDraft] = useState("");
  const skippedSavings = estimateSkippedFramesSavings(
    skippedAutoFrameCount,
    sampleWidth,
    sampleHeight,
  );
  const resolutionOptions = compareResolutionCosts(sampleWidth, sampleHeight);
  const billSource = describeBillSource(isChatMode);
  const priceTable = buildPriceTable(isChatMode ? "chat" : "realtime");
  const budgetProgress = computeBudgetProgress(
    usageReport.estimatedCostUsd,
    budgetUsd,
  );

  const handleBudgetSubmit = (): void => {
    if (onBudgetSet === undefined) {
      return;
    }
    const parsed = parseBudgetInput(budgetDraft);
    if (parsed === null) {
      // 留空/非法 → 视为清除预算（仅当显式提交时）。
      onBudgetSet(null);
      setBudgetDraft("");
      return;
    }
    onBudgetSet(parsed);
    setBudgetDraft("");
  };

  const handleBudgetClear = (): void => {
    if (onBudgetSet === undefined) {
      return;
    }
    onBudgetSet(null);
    setBudgetDraft("");
  };

  return (
    <div
      className="grid gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-[18px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
      aria-label={t(isChatMode ? "usage.panelChat" : "usage.panel")}
      hidden={!isVisible}
    >
      <div className="flex items-center justify-between gap-3 max-[480px]:flex-col max-[480px]:items-start">
        <div className="text-violet">
          <Activity size={18} aria-hidden="true" />
          <span>{t("usage.title")}</span>
        </div>
        <div
          className="flex flex-wrap justify-end gap-1.5 max-[480px]:justify-start"
          aria-label={t("usage.export")}
        >
          <a
            className="inline-flex min-h-[30px] items-center justify-center gap-[5px] rounded-lg border border-white/10 bg-white/[0.04] px-[9px] py-1.5 text-[0.74rem] font-[600] leading-none text-foreground no-underline transition-[background,border-color] duration-[200ms] hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href={usageExport.jsonDownloadUrl}
            download={usageExport.jsonFilename}
          >
            <Download size={14} aria-hidden="true" />
            <span>JSON</span>
          </a>
          <a
            className="inline-flex min-h-[30px] items-center justify-center gap-[5px] rounded-lg border border-white/10 bg-white/[0.04] px-[9px] py-1.5 text-[0.74rem] font-[600] leading-none text-foreground no-underline transition-[background,border-color] duration-[200ms] hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href={usageExport.csvDownloadUrl}
            download={usageExport.csvFilename}
          >
            <Download size={14} aria-hidden="true" />
            <span>CSV</span>
          </a>
        </div>
      </div>

      <dl className="m-0 grid grid-cols-3 gap-2.5">
        <div className="grid gap-1 rounded-md bg-panel-border p-3">
          <dt className="text-[0.74rem] font-[600] uppercase text-fog">
            {t("usage.turns")}
          </dt>
          <dd className="m-0 text-[1.18rem] font-[600] text-foreground">
            {usageReport.turnCount}
          </dd>
        </div>
        <div className="grid gap-1 rounded-md bg-panel-border p-3">
          <dt className="text-[0.74rem] font-[600] uppercase text-fog">
            {t("usage.estimatedCost")}
          </dt>
          <dd className="m-0 text-[1.18rem] font-[600] text-foreground">
            {formatUsd(usageReport.estimatedCostUsd)}
          </dd>
        </div>
        <div className="grid gap-1 rounded-md bg-panel-border p-3">
          <dt className="text-[0.74rem] font-[600] uppercase text-fog">
            {t("usage.recentInput")}
          </dt>
          <dd className="m-0 text-[1.18rem] font-[600] text-foreground">
            {usageReport.lastTurn
              ? formatTokens(usageReport.lastTurn.inputTokens)
              : "-"}
          </dd>
        </div>
      </dl>

      <dl className="m-0 grid grid-cols-3 gap-x-3 gap-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[0.82rem] font-bold text-fog">{t("usage.audioInput")}</dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-foreground">
            {formatTokens(usageReport.totals.inputAudioTokens)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[0.82rem] font-bold text-fog">{t("usage.imageInput")}</dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-foreground">
            {formatTokens(usageReport.totals.inputImageTokens)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[0.82rem] font-bold text-fog">{t("usage.textInput")}</dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-foreground">
            {formatTokens(usageReport.totals.inputTextTokens)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[0.82rem] font-bold text-fog">{t("usage.cachedInput")}</dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-foreground">
            {formatTokens(usageReport.totals.cachedInputTokens)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[0.82rem] font-bold text-fog">{t("usage.audioOutput")}</dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-foreground">
            {formatTokens(usageReport.totals.outputAudioTokens)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[0.82rem] font-bold text-fog">{t("usage.textOutput")}</dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-foreground">
            {formatTokens(usageReport.totals.outputTextTokens)}
          </dd>
        </div>
      </dl>

      <div
        className="grid gap-2 rounded-md border border-panel-border bg-panel-border p-3"
        aria-label={t("usage.billSource")}
      >
        <div className="grid gap-1">
          <span className="text-[0.78rem] font-[600] text-foreground">
            {t(
              billSource.key === "realtime"
                ? "usage.billSourceRealtime"
                : "usage.billSourceChat",
            )}
          </span>
          <p className="m-0 text-[0.82rem] leading-[1.4] text-fog">
            {t(
              billSource.usageAuthority === "authoritative"
                ? "usage.billUsageAuthoritative"
                : "usage.billUsageEstimated",
            )}
          </p>
        </div>
        <p className="m-0 text-[0.78rem] leading-[1.4] text-fog">
          {t("usage.billVerifyProvider")}
        </p>
      </div>

      {sessionUsageExport !== null ? (
        <div
          className="grid gap-2 rounded-md border border-panel-border bg-panel-border p-3"
          aria-label={t("usage.sessionExport")}
        >
          <div className="flex items-center gap-2">
            <Download size={16} aria-hidden="true" />
            <span className="text-[0.82rem] font-[600] text-foreground">
              {t("usage.sessionExport")}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <a
              className="inline-flex min-h-[30px] items-center justify-center gap-[5px] rounded-lg border border-white/10 bg-white/[0.04] px-[9px] py-1.5 text-[0.74rem] font-[600] leading-none text-foreground no-underline transition-[background,border-color] duration-[200ms] hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              href={sessionUsageExport.jsonDownloadUrl}
              download={sessionUsageExport.jsonFilename}
            >
              <Download size={14} aria-hidden="true" />
              <span>JSON</span>
            </a>
            <a
              className="inline-flex min-h-[30px] items-center justify-center gap-[5px] rounded-lg border border-white/10 bg-white/[0.04] px-[9px] py-1.5 text-[0.74rem] font-[600] leading-none text-foreground no-underline transition-[background,border-color] duration-[200ms] hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              href={sessionUsageExport.csvDownloadUrl}
              download={sessionUsageExport.csvFilename}
            >
              <Download size={14} aria-hidden="true" />
              <span>CSV</span>
            </a>
          </div>
        </div>
      ) : null}

      {sessionUsageTrend !== null && sessionUsageTrend.points.length > 0 ? (
        <SessionUsageTrendChart series={sessionUsageTrend} />
      ) : null}

      {/* 服务商价格表回显：展示成本换算所用的每百万 token 单价。 */}
      <div
        className="grid gap-2 rounded-md border border-panel-border bg-panel-border p-3"
        aria-label={t("usage.priceTable")}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.82rem] font-[600] text-foreground">
            {t("usage.priceTable")}
          </span>
          <span className="text-[0.7rem] font-bold text-fog">
            {t(isChatMode ? "usage.priceChat" : "usage.priceRealtime")}
          </span>
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {priceTable.rows.map((row) => (
            <div
              key={row.labelKey}
              className="flex items-baseline justify-between gap-2"
            >
              <dt className="text-[0.74rem] font-semibold text-fog">
                {t(row.labelKey)}
                {row.noteKey !== undefined ? (
                  <span className="text-[0.64rem] font-bold text-toolbar-muted">
                    {" "}
                    ({t(row.noteKey)})
                  </span>
                ) : null}
              </dt>
              <dd className="m-0 text-[0.78rem] font-[600] text-foreground">
                {formatPricePerMillion(row.priceUsdPerMillion)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-[0.7rem] leading-[1.4] text-fog">
          {t("usage.priceNote")}
        </p>
      </div>

      {/* 会话级消费预算守护：设置上限 + 实时进度条 + 告警。 */}
      <div
        className="grid gap-2.5 rounded-md border border-panel-border bg-panel-border p-3"
        aria-label={t("usage.budgetAria")}
        data-budget-guard
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.82rem] font-[600] text-foreground">
            {t("usage.budget")}
          </span>
          {budgetUsd !== null && budgetUsd !== undefined ? (
            <span className="text-[0.7rem] font-bold text-fog">
              {t("usage.budgetProgress", {
                used: formatUsd(usageReport.estimatedCostUsd),
                budget: formatUsd(budgetUsd),
              })}
            </span>
          ) : (
            <span className="text-[0.7rem] font-bold text-fog">
              {t("usage.budgetUnset")}
            </span>
          )}
        </div>

        {budgetUsd !== null && budgetUsd !== undefined ? (
          <div className="grid gap-1.5">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-float-bg"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(budgetProgress.percent, 100)}
              aria-label={t("usage.budgetAria")}
            >
              <div
                className={
                  budgetProgress.alertLevel === "exceeded"
                    ? "h-full bg-[#dc2626]"
                    : budgetProgress.alertLevel === "warning"
                      ? "h-full bg-amber-400"
                      : "h-full bg-primary"
                }
                style={{ width: `${Math.min(budgetProgress.percent, 100)}%` }}
              />
            </div>
            {budgetProgress.alertLevel === "exceeded" ? (
              <p className="m-0 flex items-center gap-1.5 text-[0.72rem] font-bold text-[#f87171]">
                <AlertTriangle size={13} aria-hidden="true" />
                {t("usage.budgetExceeded")}
              </p>
            ) : budgetProgress.alertLevel === "warning" ? (
              <p className="m-0 flex items-center gap-1.5 text-[0.72rem] font-bold text-amber-400">
                <AlertTriangle size={13} aria-hidden="true" />
                {t("usage.budgetWarning")}
              </p>
            ) : null}
          </div>
        ) : null}

        {onBudgetSet !== undefined ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={budgetDraft}
              placeholder={t("usage.budgetPlaceholder")}
              onChange={(event) => setBudgetDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleBudgetSubmit();
                }
              }}
              className="min-h-[28px] w-32 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[0.74rem] font-semibold text-foreground placeholder:text-fog transition-[border-color,box-shadow] duration-[200ms] focus:border-[color:var(--color-primary)] focus:shadow-[0_0_0_3px_rgba(94,106,210,0.15)] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleBudgetSubmit}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border-0 bg-[color:var(--color-primary)] px-2.5 text-[0.74rem] font-[600] text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_2px_8px_rgba(94,106,210,0.3)] transition-[background,box-shadow] duration-[200ms] hover:bg-[#6872d9]"
            >
              {t("usage.budgetSet")}
            </button>
            {budgetUsd !== null && budgetUsd !== undefined ? (
              <button
                type="button"
                onClick={handleBudgetClear}
                className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-panel-border bg-float-bg px-2.5 text-[0.74rem] font-bold text-fog hover:bg-panel-border"
              >
                <X size={13} aria-hidden="true" />
                {t("usage.budgetClear")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {skippedSavings > 0 ? (
        <div className="grid gap-2 rounded-md border border-panel-border bg-panel-border p-3">
          <div className="flex items-center gap-2">
            <PiggyBank size={16} aria-hidden="true" />
            <span className="text-[0.82rem] font-[600] text-foreground">
              {t("usage.savedBySkipping", {
                count: skippedAutoFrameCount,
                amount: formatUsd(skippedSavings),
              })}
            </span>
          </div>
          {resolutionOptions.length > 0 ? (
            <>
              <p className="m-0 text-[0.78rem] font-bold text-fog">
                {t("usage.resolutionOptimization")}
              </p>
              <ul className="m-0 grid gap-1.5 pl-0">
                {resolutionOptions.map((option) => (
                  <li
                    key={option.width}
                    className="flex items-center justify-between gap-3 text-[0.78rem]"
                  >
                    <span className="font-semibold text-foreground">
                      {t("usage.resolutionTokens", {
                        width: option.width,
                        height: option.height,
                        tokens: formatTokens(option.tokens),
                      })}
                    </span>
                    <span className="font-[600] text-accent">
                      {t("usage.savePercent", {
                        percent: option.savingPercent,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
