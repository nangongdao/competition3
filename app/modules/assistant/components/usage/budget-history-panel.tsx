import { memo } from "react";
import { History, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  monthHistorySummary,
  type BudgetHistoryMonth,
} from "@/modules/assistant/lib/budget-history";
import { formatUsd } from "@/modules/assistant/lib/cost-model";

type BudgetHistoryPanelProps = {
  /** 预算历史审计序列（最近 N 个月 vs 月度预算）。 */
  history: readonly BudgetHistoryMonth[];
};

/**
 * ⑤ 预算历史审计面板。
 *
 * 把「最近 N 个自然月逐月消费 vs 月度预算」渲染为可审计的历史视图：
 *   - 顶部：总历史消费 / 超限月份数 / 接近阈值月份数摘要；
 *   - 逐月列表：月份标签 + 消费金额 + 对预算使用率进度条 + 状态徽标
 *     （normal 绿 / high 琥珀 / over 红）。
 *
 * 纯展示组件，数据由 `buildBudgetHistory` 折叠后注入。
 */
export const BudgetHistoryPanel = memo(function BudgetHistoryPanel({
  history,
}: BudgetHistoryPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const summary = monthHistorySummary(history);

  // 按月倒序展示（最近的月份在最上方）。
  const ordered = [...history].sort((a, b) =>
    b.monthKey.localeCompare(a.monthKey),
  );

  return (
    <div
      className="grid gap-2 rounded-md border border-toolbar-border bg-float-bg p-2.5"
      aria-label={t("usage.budgetHistoryPanel")}
    >
      <div className="flex items-center gap-2 text-[0.78rem] font-extrabold text-toolbar-fg">
        <History size={15} aria-hidden="true" />
        <span>{t("usage.budgetHistoryTitle")}</span>
      </div>

      {history.length === 0 ? (
        <p className="m-0 text-[0.68rem] leading-[1.35] text-toolbar-muted">
          {t("usage.budgetHistoryEmpty")}
        </p>
      ) : (
        <>
          {/* 摘要。 */}
          <div className="flex flex-wrap items-center gap-1.5 text-[0.66rem] text-toolbar-muted">
            <span className="rounded-md bg-toolbar-border px-1.5 py-0.5 font-extrabold text-toolbar-fg">
              {t("usage.budgetHistoryTotal", {
                total: formatUsd(summary.totalSpentUsd),
              })}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-extrabold ${
                summary.overCount > 0
                  ? "bg-destructive/10 text-destructive"
                  : "bg-toolbar-border text-toolbar-muted"
              }`}
              role="status"
              aria-label={t("usage.budgetHistoryOverCount", {
                count: summary.overCount,
              })}
            >
              {t("usage.budgetHistoryOverCount", { count: summary.overCount })}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-extrabold ${
                summary.highCount > 0
                  ? "bg-amber/10 text-amber"
                  : "bg-toolbar-border text-toolbar-muted"
              }`}
              role="status"
              aria-label={t("usage.budgetHistoryHighCount", {
                count: summary.highCount,
              })}
            >
              {t("usage.budgetHistoryHighCount", { count: summary.highCount })}
            </span>
          </div>

          {/* 逐月列表。 */}
          <div className="grid gap-1.5">
            {ordered.map((month) => (
              <div
                key={month.monthKey}
                className="grid gap-0.5"
                data-budget-history-month={month.monthKey}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`truncate text-[0.66rem] font-extrabold ${
                      month.status === "over"
                        ? "text-destructive"
                        : month.status === "high"
                          ? "text-amber"
                          : "text-toolbar-fg"
                    }`}
                  >
                    {month.monthLabel}
                  </span>
                  {month.status === "over" ? (
                    <span className="shrink-0 text-[0.58rem] font-extrabold uppercase text-destructive">
                      {t("usage.budgetHistoryStatus.over")}
                    </span>
                  ) : month.status === "high" ? (
                    <span className="shrink-0 text-[0.58rem] font-extrabold uppercase text-amber">
                      {t("usage.budgetHistoryStatus.high")}
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-[0.66rem] font-black text-toolbar-fg">
                    {formatUsd(month.spentUsd)}
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-toolbar-border"
                  role="progressbar"
                  aria-label={t("usage.budgetHistoryProgress", {
                    month: month.monthLabel,
                    used: formatUsd(month.spentUsd),
                    budget: formatUsd(month.budgetUsd),
                  })}
                  aria-valuenow={Math.round(month.usedPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`h-full rounded-full ${
                      month.status === "over"
                        ? "bg-destructive"
                        : month.status === "high"
                          ? "bg-amber"
                          : "bg-emerald"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(0, month.usedPct))}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[0.58rem] text-toolbar-muted">
                  <span>
                    {t("usage.budgetHistoryUtilization", {
                      pct: month.usedPct.toFixed(1),
                    })}
                  </span>
                  {month.budgetUsd > 0 ? (
                    <span className="flex items-center gap-0.5">
                      <TrendingUp size={9} aria-hidden="true" />
                      {t("usage.budgetHistoryTurns", {
                        count: month.turnCount,
                      })}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
