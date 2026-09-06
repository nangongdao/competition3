import { memo } from "react";
import { BarChartHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatUsd } from "@/modules/assistant/lib/cost-model";
import type { SessionComparisonSeries } from "@/modules/assistant/lib/session-comparison";

type SessionComparisonPanelProps = {
  /** 跨会话成本对比序列。 */
  comparison: SessionComparisonSeries;
};

/**
 * ③ 跨会话成本对比面板。
 *
 * 基于 `buildSessionComparisonSeries` 折叠的序列，用横向条形图对比
 * 各会话的估算成本，并给出总成本 / 会话数 / 总轮次。纯展示组件。
 */
export const SessionComparisonPanel = memo(function SessionComparisonPanel({
  comparison,
}: SessionComparisonPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const top = comparison.points.slice(0, 8);

  return (
    <div
      className="grid gap-2 rounded-md border border-toolbar-border bg-float-bg p-2.5"
      aria-label={t("usage.comparisonPanel")}
    >
      <div className="flex items-center gap-2 text-[0.78rem] font-[600] text-toolbar-fg">
        <BarChartHorizontal size={15} aria-hidden="true" />
        <span>{t("usage.comparisonTitle")}</span>
      </div>

      <dl className="m-0 grid grid-cols-3 gap-1.5">
        <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
          <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
            {t("usage.comparisonSessions")}
          </dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
            {comparison.sessionCount}
          </dd>
        </div>
        <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
          <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
            {t("usage.comparisonTotalCost")}
          </dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
            {formatUsd(comparison.totalCostUsd)}
          </dd>
        </div>
        <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
          <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
            {t("usage.comparisonTurns")}
          </dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
            {comparison.totalTurnCount}
          </dd>
        </div>
      </dl>

      {top.length === 0 ? (
        <p className="m-0 text-[0.7rem] text-toolbar-muted">
          {t("usage.comparisonEmpty")}
        </p>
      ) : (
        <div className="grid gap-1.5">
          {top.map((point) => (
            <div
              key={point.sessionId}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5"
              title={`${point.title} · ${point.turnCount} ${t("usage.comparisonTurns")}`}
            >
              <div className="grid min-w-0 gap-0.5">
                <span className="truncate text-[0.66rem] font-[600] text-toolbar-fg">
                  {point.title || t("usage.comparisonUntitled")}
                </span>
                <div className="h-1.5 overflow-hidden rounded-full bg-toolbar-border">
                  <div
                    className="h-full rounded-full bg-violet"
                    style={{
                      width: `${Math.max(2, point.costRatio * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-[0.66rem] font-[600] text-toolbar-fg">
                {formatUsd(point.estimatedCostUsd)}
              </span>
            </div>
          ))}
          {comparison.sessionCount > top.length ? (
            <p className="m-0 text-[0.62rem] text-toolbar-muted">
              {t("usage.comparisonMore", {
                count: comparison.sessionCount - top.length,
              })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
});
