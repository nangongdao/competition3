import { memo } from "react";
import { CalendarClock, Gauge, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CostCockpit } from "@/modules/assistant/lib/cost-cockpit";
import { formatUsd } from "@/modules/assistant/lib/cost-model";
import type { MeasuredInterval } from "@/modules/assistant/lib/calibration-scaling";

type CostCockpitPanelProps = {
  /** 成本驾驶舱聚合结果。 */
  cockpit: CostCockpit;
  /**
   * 驾驶舱趋势图的「实测区间」标注（估算 vs 实测漂移范围）。
   * 已应用校准回写时由上层经 `annotateMeasuredInterval` 计算注入；否则不渲染。
   */
  measuredInterval?: MeasuredInterval | null;
};

/**
 * ④ 全局成本看板（成本驾驶舱）面板。
 *
 * 把成本护栏的局部能力聚合成一站式驾驶舱视图：
 *   - 顶部：全局预算护栏摘要（已用 / 剩余 / 使用率 / 告警）；
 *   - 中部：超限 / 接近阈值会话计数；
 *   - 逐会话成本条形对比（带超限 / 接近阈值标注）；
 *   - 底部：成本趋势外推（按会话成本线性外推，给出本月末 / 下月预测）。
 *
 * 纯展示组件，数据由 `buildCostCockpit` 聚合后注入。
 */
export const CostCockpitPanel = memo(function CostCockpitPanel({
  cockpit,
  measuredInterval = null,
}: CostCockpitPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const { guardrail, comparison, overBudgetCount, approachingBudgetCount, forecast, monthForecast } =
    cockpit;
  const top = comparison.points.slice(0, 8);
  const alertClass =
    guardrail.alertLevel === "over"
      ? "text-destructive"
      : guardrail.alertLevel === "warn"
        ? "text-amber"
        : "text-emerald";

  // 月度前瞻预测的状态徽标颜色。
  const monthStatusClass =
    monthForecast.status === "over-budget"
      ? "bg-destructive/10 text-destructive"
      : monthForecast.status === "at-risk"
        ? "bg-amber/10 text-amber"
        : "bg-emerald/10 text-emerald";

  return (
    <div
      className="grid gap-2 rounded-md border border-toolbar-border bg-float-bg p-2.5"
      aria-label={t("usage.cockpitPanel")}
    >
      <div className="flex items-center gap-2 text-[0.78rem] font-extrabold text-toolbar-fg">
        <Gauge size={15} aria-hidden="true" />
        <span>{t("usage.cockpitTitle")}</span>
      </div>

      {/* 全局预算护栏摘要。 */}
      <dl className="m-0 grid grid-cols-3 gap-1.5">
        <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
          <dt className="text-[0.62rem] font-extrabold uppercase text-toolbar-muted">
            {t("usage.budgetSpent")}
          </dt>
          <dd className={`m-0 text-[0.9rem] font-black ${alertClass}`}>
            {formatUsd(guardrail.spentUsd)}
          </dd>
        </div>
        <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
          <dt className="text-[0.62rem] font-extrabold uppercase text-toolbar-muted">
            {t("usage.budgetRemaining")}
          </dt>
          <dd className="m-0 text-[0.9rem] font-black text-toolbar-fg">
            {formatUsd(guardrail.remainingUsd)}
          </dd>
        </div>
        <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
          <dt className="text-[0.62rem] font-extrabold uppercase text-toolbar-muted">
            {t("usage.budgetUsedPct")}
          </dt>
          <dd className={`m-0 text-[0.9rem] font-black ${alertClass}`}>
            {guardrail.usedPct.toFixed(1)}%
          </dd>
        </div>
      </dl>

      {/* 月度前瞻预测：基于当月逐日消费趋势外推到月末。 */}
      <div
        className="grid gap-1.5 rounded-md border border-toolbar-border bg-toolbar-bg p-1.5"
        data-budget-forecast
        aria-label={t("usage.cockpitMonthForecast")}
      >
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 text-[0.66rem] font-extrabold text-toolbar-fg">
            <CalendarClock size={13} aria-hidden="true" />
            <span>{t("usage.budgetForecastTitle")}</span>
          </div>
          {monthForecast.valid && guardrail.enabled ? (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[0.58rem] font-black uppercase ${monthStatusClass}`}
              role="status"
              aria-label={t("usage.budgetForecastStatus." + monthForecast.status)}
            >
              {t("usage.budgetForecastStatus." + monthForecast.status)}
            </span>
          ) : null}
        </div>
        {monthForecast.valid ? (
          <>
            <dl className="m-0 grid grid-cols-3 gap-1">
              <div className="grid gap-0.5">
                <dt className="text-[0.58rem] font-extrabold uppercase text-toolbar-muted">
                  {t("usage.budgetForecastProjected")}
                </dt>
                <dd className="m-0 text-[0.74rem] font-black text-toolbar-fg">
                  {formatUsd(monthForecast.projectedMonthEndUsd)}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-[0.58rem] font-extrabold uppercase text-toolbar-muted">
                  {t("usage.forecastDelta")}
                </dt>
                <dd className="m-0 text-[0.74rem] font-black text-toolbar-fg">
                  {formatUsd(monthForecast.projectedDeltaUsd)}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-[0.58rem] font-extrabold uppercase text-toolbar-muted">
                  {t("usage.budgetForecastUtilization")}
                </dt>
                <dd className={`m-0 text-[0.74rem] font-black ${monthStatusClass}`}>
                  {monthForecast.projectedUtilizationPct.toFixed(0)}%
                </dd>
              </div>
            </dl>
            <p className="m-0 text-[0.6rem] leading-[1.3] text-toolbar-muted">
              {t("usage.budgetForecastRemaining", {
                days: monthForecast.remainingDays,
              })}
            </p>
          </>
        ) : (
          <p className="m-0 text-[0.66rem] leading-[1.3] text-toolbar-muted">
            {t("usage.cockpitMonthForecastInsufficient")}
          </p>
        )}
      </div>

      {/* 超限 / 接近阈值会话计数。 */}
      <div className="flex flex-wrap items-center gap-1.5 text-[0.68rem] text-toolbar-muted">
        <span
          className="rounded-full bg-destructive/10 px-2 py-0.5 font-extrabold text-destructive"
          role="status"
          aria-label={t("usage.cockpitOverBudgetCount", {
            count: overBudgetCount,
          })}
        >
          {t("usage.cockpitOverBudgetCount", { count: overBudgetCount })}
        </span>
        <span
          className="rounded-full bg-amber/10 px-2 py-0.5 font-extrabold text-amber"
          role="status"
          aria-label={t("usage.cockpitApproachingCount", {
            count: approachingBudgetCount,
          })}
        >
          {t("usage.cockpitApproachingCount", { count: approachingBudgetCount })}
        </span>
      </div>

      {/* 逐会话成本对比。 */}
      <div className="grid gap-1.5">
        {top.length === 0 ? (
          <p className="m-0 text-[0.7rem] text-toolbar-muted">
            {t("usage.comparisonEmpty")}
          </p>
        ) : (
          top.map((point) => (
            <div
              key={point.sessionId}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5"
              title={`${point.title} · ${point.turnCount} ${t("usage.comparisonTurns")}`}
            >
              <div className="grid min-w-0 gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`truncate text-[0.66rem] font-extrabold ${
                      point.status === "over-budget"
                        ? "text-destructive"
                        : point.status === "approaching"
                          ? "text-amber"
                          : "text-toolbar-fg"
                    }`}
                  >
                    {point.title || t("usage.comparisonUntitled")}
                  </span>
                  {point.status === "over-budget" ? (
                    <span className="shrink-0 text-[0.58rem] font-extrabold uppercase text-destructive">
                      {t("usage.cockpitOver")}
                    </span>
                  ) : point.status === "approaching" ? (
                    <span className="shrink-0 text-[0.58rem] font-extrabold uppercase text-amber">
                      {t("usage.cockpitApproach")}
                    </span>
                  ) : null}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-toolbar-border">
                  <div
                    className={`h-full rounded-full ${
                      point.status === "over-budget"
                        ? "bg-destructive"
                        : point.status === "approaching"
                          ? "bg-amber"
                          : "bg-violet"
                    }`}
                    style={{
                      width: `${Math.max(2, point.costRatio * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-[0.66rem] font-black text-toolbar-fg">
                {formatUsd(point.estimatedCostUsd)}
              </span>
            </div>
          ))
        )}
        {comparison.sessionCount > top.length ? (
          <p className="m-0 text-[0.62rem] text-toolbar-muted">
            {t("usage.comparisonMore", {
              count: comparison.sessionCount - top.length,
            })}
          </p>
        ) : null}
      </div>

      {/* 成本趋势外推（基于会话成本）。 */}
      <div
        className="grid gap-1.5 rounded-md border border-toolbar-border bg-toolbar-bg p-1.5"
        aria-label={t("usage.cockpitTrendForecast")}
      >
        <div className="flex items-center gap-1.5 text-[0.66rem] font-extrabold text-toolbar-fg">
          <TrendingUp size={13} aria-hidden="true" />
          <span>{t("usage.forecastTitle")}</span>
        </div>
        {forecast.valid ? (
          <>
            <dl className="m-0 grid grid-cols-3 gap-1">
              <div className="grid gap-0.5">
                <dt className="text-[0.58rem] font-extrabold uppercase text-toolbar-muted">
                  {t("usage.forecastCurrent")}
                </dt>
                <dd className="m-0 text-[0.74rem] font-black text-toolbar-fg">
                  {formatUsd(forecast.currentTotalUsd)}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-[0.58rem] font-extrabold uppercase text-toolbar-muted">
                  {t("usage.forecastProjected")}
                </dt>
                <dd className="m-0 text-[0.74rem] font-black text-toolbar-fg">
                  {formatUsd(forecast.projectedTotalUsd)}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-[0.58rem] font-extrabold uppercase text-toolbar-muted">
                  {t("usage.forecastDelta")}
                </dt>
                <dd className="m-0 text-[0.74rem] font-black text-toolbar-fg">
                  {formatUsd(forecast.projectedDeltaUsd)}
                </dd>
              </div>
            </dl>
            {/* 实测区间标注：估算 vs 实测的漂移范围（已校准回写时展示）。 */}
            {measuredInterval ? (
              <div
                className="grid gap-1 rounded-md border border-accent/20 bg-accent/5 p-1.5"
                data-measured-interval
                aria-label={t("usage.cockpitMeasuredInterval")}
              >
                <div className="flex items-center gap-1.5 text-[0.6rem] font-extrabold text-accent">
                  <span aria-hidden="true">↕</span>
                  <span>{t("usage.cockpitMeasuredInterval")}</span>
                </div>
                <dl className="m-0 grid grid-cols-2 gap-1">
                  <div className="grid gap-0.5">
                    <dt className="text-[0.55rem] font-extrabold uppercase text-toolbar-muted">
                      {t("usage.cockpitMeasuredCurrent")}
                    </dt>
                    <dd className="m-0 text-[0.7rem] font-black text-toolbar-fg">
                      {formatUsd(measuredInterval.lowUsd)} –{" "}
                      {formatUsd(measuredInterval.highUsd)}
                    </dd>
                  </div>
                  <div className="grid gap-0.5">
                    <dt className="text-[0.55rem] font-extrabold uppercase text-toolbar-muted">
                      {t("usage.cockpitMeasuredProjected")}
                    </dt>
                    <dd className="m-0 text-[0.7rem] font-black text-toolbar-fg">
                      {formatUsd(measuredInterval.measuredProjectedUsd)}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
            <p className="m-0 text-[0.6rem] leading-[1.3] text-toolbar-muted">
              {t("usage.cockpitForecastNote", {
                days: forecast.horizonDays,
                count: forecast.fitPointCount,
              })}
            </p>
          </>
        ) : (
          <p className="m-0 text-[0.66rem] leading-[1.3] text-toolbar-muted">
            {t("usage.cockpitForecastInsufficient", {
              count: forecast.fitPointCount,
            })}
          </p>
        )}
      </div>
    </div>
  );
});
