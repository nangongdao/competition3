import { memo } from "react";
import { BarChart3, Download } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatTokens, formatUsd } from "@/modules/assistant/lib/cost-model";
import {
  buildAllPriceTables,
  formatPricePerMillion,
} from "@/modules/assistant/lib/usage-prices";
import type { UsageTotals } from "@/modules/assistant/lib/session-client";

type GlobalUsagePanelProps = {
  /** 跨会话累计用量汇总；null 表示尚未加载成功。 */
  totals: UsageTotals | null;
  /**
   * 全局累计用量导出 bundle（JSON / CSV）。缺省/未加载时不渲染导出按钮。
   */
  exportBundle?: {
    jsonDownloadUrl: string;
    csvDownloadUrl: string;
    jsonFilename: string;
    csvFilename: string;
  } | null;
};

/**
 * 全局累计用量视图（② 功能增量）。
 *
 * 基于 `GET /api/sessions/usage/totals` 查询端点，把跨会话累计的
 * Chat / Realtime 用量以紧凑卡片展示在工作台侧边栏底部，并支持
 * JSON / CSV 导出。纯展示组件，数据由上层注入。
 */
export const GlobalUsagePanel = memo(function GlobalUsagePanel({
  totals,
  exportBundle = null,
}: GlobalUsagePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const priceTables = buildAllPriceTables();

  return (
    <div
      className="grid gap-2 rounded-md border border-toolbar-border bg-float-bg p-2.5"
      aria-label={t("usage.globalPanel")}
    >
      <div className="flex items-center gap-2 text-[0.78rem] font-[600] text-toolbar-fg">
        <BarChart3 size={15} aria-hidden="true" />
        <span>{t("usage.globalTitle")}</span>
      </div>

      {totals === null ? (
        <p className="m-0 text-[0.7rem] text-toolbar-muted">
          {t("usage.globalUnavailable")}
        </p>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-3 gap-1.5">
            <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
              <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
                {t("usage.turns")}
              </dt>
              <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
                {totals.turnCount}
              </dd>
            </div>
            <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
              <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
                {t("usage.estimatedCost")}
              </dt>
              <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
                {formatUsd(totals.estimatedCostUsd)}
              </dd>
            </div>
            <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
              <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
                {t("usage.globalInput")}
              </dt>
              <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
                {formatTokens(totals.inputTokens)}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[0.68rem] text-toolbar-muted">
            <span>
              {t("usage.globalSplit", {
                audio: formatTokens(totals.inputAudioTokens),
                image: formatTokens(totals.inputImageTokens),
                text: formatTokens(totals.inputTextTokens),
                output: formatTokens(totals.outputTokens),
              })}
            </span>
          </div>

          {exportBundle !== null ? (
            <div className="flex gap-1.5">
              <a
                className="inline-flex min-h-[26px] items-center justify-center gap-1 rounded-md border border-toolbar-border bg-toolbar-bg px-2 text-[0.68rem] font-[600] text-toolbar-fg no-underline hover:bg-primary hover:text-primary-foreground"
                href={exportBundle.jsonDownloadUrl}
                download={exportBundle.jsonFilename}
              >
                <Download size={12} aria-hidden="true" />
                JSON
              </a>
              <a
                className="inline-flex min-h-[26px] items-center justify-center gap-1 rounded-md border border-toolbar-border bg-toolbar-bg px-2 text-[0.68rem] font-[600] text-toolbar-fg no-underline hover:bg-primary hover:text-primary-foreground"
                href={exportBundle.csvDownloadUrl}
                download={exportBundle.csvFilename}
              >
                <Download size={12} aria-hidden="true" />
                CSV
              </a>
            </div>
          ) : null}

          {/* 服务商价格表回显（跨会话累计成本换算单价）。 */}
          <div
            className="grid gap-1.5 rounded-md border border-toolbar-border bg-toolbar-bg p-1.5"
            aria-label={t("usage.priceTable")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.66rem] font-[600] text-toolbar-fg">
                {t("usage.priceTable")}
              </span>
              <span className="text-[0.6rem] font-bold text-toolbar-muted">
                {t("usage.pricePerMillion")}
              </span>
            </div>
            {priceTables.map((table) => (
              <div key={table.mode} className="grid gap-0.5">
                <span className="text-[0.6rem] font-[600] uppercase text-toolbar-muted">
                  {t(table.mode === "chat" ? "usage.priceChat" : "usage.priceRealtime")}
                </span>
                <dl className="m-0 grid grid-cols-1 gap-0.5">
                  {table.rows.map((row) => (
                    <div
                      key={row.labelKey}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <dt className="text-[0.62rem] font-semibold text-toolbar-muted">
                        {t(row.labelKey)}
                      </dt>
                      <dd className="m-0 text-[0.64rem] font-[600] text-toolbar-fg">
                        {formatPricePerMillion(row.priceUsdPerMillion)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            <p className="m-0 text-[0.58rem] leading-[1.35] text-toolbar-muted">
              {t("usage.priceNote")}
            </p>
          </div>
        </>
      )}
    </div>
  );
});
