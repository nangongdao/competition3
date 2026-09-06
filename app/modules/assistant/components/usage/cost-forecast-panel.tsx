import { memo, useMemo } from "react";
import { ChartSpline } from "lucide-react";
import { useTranslation } from "react-i18next";

import { forecastCost, type CostForecast } from "@/modules/assistant/lib/cost-forecast";
import { formatUsd } from "@/modules/assistant/lib/cost-model";
import type { UsageTrendSeries } from "@/modules/assistant/lib/usage-trend";

type CostForecastPanelProps = {
  /** 会话/全局趋势序列（用于外推）。 */
  series: UsageTrendSeries;
  /** 当前时间戳（ms）。 */
  now?: number;
  /** 预测 horizon。 */
  horizon?: "remaining-month" | "next-month" | "fixed-days";
  /** fixed-days 时的外推天数。 */
  fixedDays?: number;
};

const CHART_WIDTH = 300;
const CHART_HEIGHT = 90;
const PAD_LEFT = 6;
const PAD_RIGHT = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 14;

/**
 * ② 成本趋势外推/预测面板。
 *
 * 基于既有趋势序列用线性回归外推未来累计成本，渲染：
 *   - 当前累计成本 / 预测目标 / 预测增量；
 *   - 历史累计成本折线 + 虚线外推线段（SVG）。
 * 数据与预测由纯函数 `forecastCost` 产出。
 */
export const CostForecastPanel = memo(function CostForecastPanel({
  series,
  now = Date.now(),
  horizon = "remaining-month",
  fixedDays = 7,
}: CostForecastPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const forecast: CostForecast = useMemo(
    () => forecastCost(series, horizon, now, { fixedDays }),
    [series, horizon, now, fixedDays],
  );

  if (series.points.length === 0) {
    return (
      <div
        className="grid gap-2 rounded-md border border-toolbar-border bg-float-bg p-2.5"
        aria-label={t("usage.forecastPanel")}
      >
        <div className="flex items-center gap-2 text-[0.78rem] font-[600] text-toolbar-fg">
          <ChartSpline size={15} aria-hidden="true" />
          <span>{t("usage.forecastTitle")}</span>
        </div>
        <p className="m-0 text-[0.7rem] text-toolbar-muted">
          {t("usage.forecastEmpty")}
        </p>
      </div>
    );
  }

  const plotWidth = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const maxCost = Math.max(
    series.totalCostUsd,
    forecast.valid ? forecast.projectedTotalUsd : 0,
    1e-6,
  );

  // 历史累计成本折线（按 points 索引映射 x，值映射 y）。
  let cumulative = 0;
  const histPoints = series.points.map((point, i) => {
    cumulative = Math.max(cumulative, point.cumulativeCostUsd);
    const x = PAD_LEFT + (i / Math.max(series.points.length - 1, 1)) * plotWidth;
    const y = PAD_TOP + plotHeight - (cumulative / maxCost) * plotHeight;
    return { x, y };
  });

  // 外推线段（当前锚点 → 未来 horizon 终点）。
  const lastHistPoint = histPoints[histPoints.length - 1];
  const projectionPolyline = forecast.projectionPoints.map((p, i) => {
    const x =
      lastHistPoint !== undefined
        ? lastHistPoint.x +
          (i / Math.max(forecast.projectionPoints.length - 1, 1)) *
            (PAD_LEFT + plotWidth - lastHistPoint.x)
        : PAD_LEFT + plotWidth / 2 + (i * plotWidth) / 4;
    const y = PAD_TOP + plotHeight - (p.cumulativeCostUsd / maxCost) * plotHeight;
    return { x, y };
  });

  return (
    <div
      className="grid gap-2 rounded-md border border-toolbar-border bg-float-bg p-2.5"
      aria-label={t("usage.forecastPanel")}
    >
      <div className="flex items-center gap-2 text-[0.78rem] font-[600] text-toolbar-fg">
        <ChartSpline size={15} aria-hidden="true" />
        <span>{t("usage.forecastTitle")}</span>
      </div>

      <dl className="m-0 grid grid-cols-3 gap-1.5">
        <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
          <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
            {t("usage.forecastCurrent")}
          </dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
            {formatUsd(series.totalCostUsd)}
          </dd>
        </div>
        <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
          <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
            {t("usage.forecastProjected")}
          </dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
            {forecast.valid
              ? formatUsd(forecast.projectedTotalUsd)
              : "—"}
          </dd>
        </div>
        <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
          <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
            {t("usage.forecastDelta")}
          </dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
            {forecast.valid ? formatUsd(forecast.projectedDeltaUsd) : "—"}
          </dd>
        </div>
      </dl>

      {!forecast.valid ? (
        <p className="m-0 text-[0.7rem] leading-[1.35] text-toolbar-muted">
          {t("usage.forecastInsufficient", { count: forecast.fitPointCount })}
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-auto w-full max-w-[300px]"
            role="img"
            aria-label={t("usage.forecastChart")}
          >
            {histPoints.length > 1 ? (
              <polyline
                points={histPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinejoin="round"
                className="text-violet"
              />
            ) : null}
            {projectionPolyline.length === 2 ? (
              <line
                x1={projectionPolyline[0].x}
                y1={projectionPolyline[0].y}
                x2={projectionPolyline[1].x}
                y2={projectionPolyline[1].y}
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray="4 3"
                className="text-amber"
              />
            ) : null}
            {histPoints.map((p, i) => (
              <circle
                key={`dot-${i}`}
                cx={p.x}
                cy={p.y}
                r={2}
                fill="currentColor"
                className="text-violet"
              />
            ))}
          </svg>
          <p className="m-0 text-[0.66rem] leading-[1.35] text-toolbar-muted">
            {t("usage.forecastNote", {
              horizon: t(
                horizon === "remaining-month"
                  ? "usage.forecastHorizonMonth"
                  : horizon === "next-month"
                    ? "usage.forecastHorizonNext"
                    : "usage.forecastHorizonDays",
                { days: forecast.horizonDays },
              ),
            })}
          </p>
        </>
      )}
    </div>
  );
});
