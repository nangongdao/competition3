import { memo } from "react";
import { TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatTokens, formatUsd } from "@/modules/assistant/lib/cost-model";
import type { UsageTrendSeries } from "@/modules/assistant/lib/usage-trend";

type SessionUsageTrendChartProps = {
  /** 会话级用量趋势序列（由纯函数 `buildUsageTrendSeries` 产出）。 */
  series: UsageTrendSeries;
};

/** 图表像素尺寸（固定视口，viewBox 自适应缩放）。 */
const CHART_WIDTH = 300;
const CHART_HEIGHT = 110;
const PAD_LEFT = 6;
const PAD_RIGHT = 6;
const PAD_TOP = 8;
const PAD_BOTTOM = 14;

/**
 * 会话级用量趋势可视化（② 功能增量）。
 *
 * 依赖无关的轻量 SVG 图表，把逐轮用量折叠为两条可读趋势：
 *   - 累计成本折线（gpt-realtime / chat 换算的估算成本随轮次增长）；
 *   - 每轮输入 token 柱状（成本主要驱动因子）。
 * 仅渲染趋势概要（累计成本 / 输入输出 token / 峰值）与折线，不引入图表库。
 */
export const SessionUsageTrendChart = memo(function SessionUsageTrendChart({
  series,
}: SessionUsageTrendChartProps): React.JSX.Element {
  const { t } = useTranslation();
  const { points, totalCostUsd, totalInputTokens, totalOutputTokens, peakTokens } =
    series;

  const plotWidth = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  // —— 累计成本折线 ——
  const costMax = Math.max(series.peakCostUsd, 1e-6);
  let cumulative = 0;
  const linePoints = points.map((point, i) => {
    cumulative = Math.max(cumulative, point.cumulativeCostUsd);
    const x = PAD_LEFT + (i / Math.max(points.length - 1, 1)) * plotWidth;
    const y =
      PAD_TOP + plotHeight - (cumulative / costMax) * plotHeight;
    return { x, y };
  });

  // —— 每轮输入 token 柱状 ——
  const tokenMax = Math.max(peakTokens, 1);
  const barWidth = points.length > 0 ? plotWidth / points.length : 0;

  return (
    <div
      className="grid gap-2 rounded-md border border-panel-border bg-panel-border p-3"
      aria-label={t("usage.trend")}
    >
      <div className="flex items-center gap-2">
        <TrendingUp size={16} aria-hidden="true" />
        <span className="text-[0.82rem] font-[600] text-foreground">
          {t("usage.trendTitle")}
        </span>
      </div>

      <dl className="m-0 grid grid-cols-3 gap-2">
        <div className="grid gap-0.5">
          <dt className="text-[0.62rem] font-[600] uppercase text-fog">
            {t("usage.trendTotalCost")}
          </dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-foreground">
            {formatUsd(totalCostUsd)}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-[0.62rem] font-[600] uppercase text-fog">
            {t("usage.trendInput")}
          </dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-foreground">
            {formatTokens(totalInputTokens)}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-[0.62rem] font-[600] uppercase text-fog">
            {t("usage.trendOutput")}
          </dt>
          <dd className="m-0 text-[0.9rem] font-[600] text-foreground">
            {formatTokens(totalOutputTokens)}
          </dd>
        </div>
      </dl>

      {points.length === 0 ? (
        <p className="m-0 text-[0.7rem] text-fog">{t("usage.trendEmpty")}</p>
      ) : (
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-auto w-full max-w-[320px]"
          role="img"
          aria-label={t("usage.trendChart")}
        >
          {/* 每轮输入 token 柱状 */}
          {points.map((point, i) => {
            const x = PAD_LEFT + (i / points.length) * plotWidth;
            const barHeight = (point.inputTokens / tokenMax) * plotHeight;
            return (
              <rect
                key={`bar-${i}`}
                x={x + barWidth * 0.15}
                y={PAD_TOP + plotHeight - barHeight}
                width={barWidth * 0.7}
                height={barHeight}
                fill="currentColor"
                opacity={0.22}
                className="text-foreground"
              >
                <title>{`${t("usage.trendTurn")} #${point.index} · ${formatTokens(point.inputTokens)} in`}</title>
              </rect>
            );
          })}
          {/* 累计成本折线 */}
          {linePoints.length > 1 ? (
            <>
              <polyline
                points={linePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinejoin="round"
                className="text-violet"
              />
              {linePoints.map((p, i) => (
                <circle
                  key={`dot-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={2.2}
                  fill="currentColor"
                  className="text-violet"
                />
              ))}
            </>
          ) : null}
        </svg>
      )}

      <div className="flex items-center justify-between text-[0.68rem] text-fog">
        <span>
          {t("usage.trendRounds", { count: points.length })}
        </span>
        <span>{t("usage.trendChartLegend")}</span>
      </div>
    </div>
  );
});
