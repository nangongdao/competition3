import { memo } from "react";
import { BookOpen, History, ImageIcon, Merge, PiggyBank, ShieldCheck, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FrameTelemetryStats, SampleRateStats } from "@/modules/assistant/lib/frame-telemetry";
import {
  buildOptimizationSavings,
} from "@/modules/assistant/lib/optimization-savings";
import { formatTokens, formatUsd } from "@/modules/assistant/lib/cost-model";

type VisualContextPanelProps = {
  lastFrameDataUrl: string | null;
  sampledFrameCount: number;
  sentFrameCount: number;
  skippedAutoFrameCount: number;
  prunedFrameCount: number;
  isAutoSampling: boolean;
  samplingIntervalSeconds: number;
  isVisible: boolean;
  /** M4.1 场景记忆：已保留的关键帧文字摘要条数。 */
  sceneMemoryCount: number;
  /** M4.1 场景记忆：预估的图像 token 节省。 */
  sceneMemorySavingsTokens: number;
  /** M4.2 多模态融合：语音与并发画面合并次数。 */
  fusionCount: number;
  /** M4.2 多模态融合：节省的 API 往返调用次数。 */
  fusionSavedCalls: number;
  /** M4.2 多模态融合：融合帧的图像 token。 */
  fusionImageTokens: number;
  /** 文本历史摘要：被压缩的早期对话轮次条数。 */
  textHistorySummarizedCount: number;
  /** 文本历史摘要：预估节省的文本 token。 */
  textHistorySavedTokens: number;
  /** 帧采样性能遥测：离屏 Worker 帧处理耗时指标。 */
  frameTelemetryStats: FrameTelemetryStats;
  /** 帧采样节拍遥测：实际采样频率（FPS）指标。 */
  sampleRateStats: SampleRateStats;
  /** 采样帧宽度（像素），用于把帧差分节省折算为 token/USD。 */
  sampleWidth?: number;
  /** 采样帧高度（像素），用于把帧差分节省折算为 token/USD。 */
  sampleHeight?: number;
};

/**
 * "最近画面" 面板：最近一帧缩略图 + 帧统计。
 */
export const VisualContextPanel = memo(function VisualContextPanel({
  lastFrameDataUrl,
  sampledFrameCount,
  sentFrameCount,
  skippedAutoFrameCount,
  prunedFrameCount,
  isAutoSampling,
  samplingIntervalSeconds,
  isVisible,
  sceneMemoryCount,
  sceneMemorySavingsTokens,
  fusionCount,
  fusionSavedCalls,
  fusionImageTokens,
  textHistorySummarizedCount,
  textHistorySavedTokens,
  frameTelemetryStats,
  sampleRateStats,
  sampleWidth = 0,
  sampleHeight = 0,
}: VisualContextPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const optimizationSummary = buildOptimizationSavings({
    skippedFrameCount: skippedAutoFrameCount,
    sampleWidth,
    sampleHeight,
    sceneMemorySavingsTokens: sceneMemorySavingsTokens,
    textHistorySavedTextTokens: textHistorySavedTokens,
    fusionImageTokens: fusionImageTokens,
  });
  return (
    <div
      className="grid grid-cols-[minmax(160px,230px)_minmax(0,1fr)] items-stretch gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] max-[480px]:grid-cols-1"
      aria-label={t("visualContext.panel")}
      hidden={!isVisible}
    >
      <div className="col-span-full text-accent">
        <ImageIcon size={18} aria-hidden="true" />
        <span>{t("visualContext.title")}</span>
      </div>

      <div className="min-h-[104px] overflow-hidden rounded-md border border-border bg-soft-bg">
        {lastFrameDataUrl ? (
          <img
            src={lastFrameDataUrl}
            alt={t("visualContext.alt")}
            className="block h-full min-h-[104px] w-full object-cover"
          />
        ) : (
          <div className="grid min-h-[104px] place-items-center gap-2 text-center text-sm font-[600] text-soft-fg">
            <ImageIcon size={22} aria-hidden="true" />
            <span>{t("visualContext.empty")}</span>
          </div>
        )}
      </div>

      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(86px,1fr))] gap-2.5 max-[480px]:grid-cols-1">
        <div className="grid min-h-[104px] content-center gap-2 rounded-md bg-soft-bg p-3.5">
          <dt className="text-xs font-[600] uppercase text-soft-fg-muted">
            {t("visualContext.sampled")}
          </dt>
          <dd className="m-0 text-[1.35rem] font-[600] text-foreground">
            {sampledFrameCount}
          </dd>
        </div>
        <div className="grid min-h-[104px] content-center gap-2 rounded-md bg-soft-bg p-3.5">
          <dt className="text-xs font-[600] uppercase text-soft-fg-muted">
            {t("visualContext.sent")}
          </dt>
          <dd className="m-0 text-[1.35rem] font-[600] text-foreground">
            {sentFrameCount}
          </dd>
        </div>
        <div className="grid min-h-[104px] content-center gap-2 rounded-md bg-soft-bg p-3.5">
          <dt className="text-xs font-[600] uppercase text-soft-fg-muted">
            {t("visualContext.skipped")}
          </dt>
          <dd className="m-0 text-[1.35rem] font-[600] text-foreground">
            {skippedAutoFrameCount}
          </dd>
        </div>
        <div className="grid min-h-[104px] content-center gap-2 rounded-md bg-soft-bg p-3.5">
          <dt className="text-xs font-[600] uppercase text-soft-fg-muted">
            {t("visualContext.pruned")}
          </dt>
          <dd className="m-0 text-[1.35rem] font-[600] text-foreground">
            {prunedFrameCount}
          </dd>
        </div>
        <div className="grid min-h-[104px] content-center gap-2 rounded-md bg-soft-bg p-3.5">
          <dt className="text-xs font-[600] uppercase text-soft-fg-muted">
            {t("visualContext.interval")}
          </dt>
          <dd className="m-0 text-[1.35rem] font-[600] text-foreground">
            {isAutoSampling ? t("visualContext.seconds", { count: samplingIntervalSeconds }) : t("visualContext.manual")}
          </dd>
        </div>
      </dl>

      {frameTelemetryStats.count > 0 && (
        <div
          className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-soft-bg px-3.5 py-2.5 text-sm"
          aria-label={t("visualContext.frameTelemetry")}
          data-frame-telemetry
        >
          <span className="inline-flex items-center gap-1.5 font-bold text-accent">
            <Timer size={16} aria-hidden="true" />
            {t("visualContext.frameTelemetry", { count: frameTelemetryStats.count })}
          </span>
          <span className="font-semibold text-soft-fg-bright">
            {t("visualContext.frameAvgMs", { ms: frameTelemetryStats.averageMs.toFixed(1) })}
          </span>
          <span className="font-semibold text-soft-fg-bright">
            {t("visualContext.frameMaxMs", { ms: frameTelemetryStats.maxMs.toFixed(1) })}
          </span>
          {sampleRateStats.tickCount > 0 && (
            <span className="font-semibold text-soft-fg-bright">
              {t("visualContext.sampleRateFps", {
                fps: sampleRateStats.averageFps.toFixed(2),
              })}
            </span>
          )}
        </div>
      )}

      {sceneMemoryCount > 0 && (
        <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-soft-bg px-3.5 py-2.5 text-sm" aria-label={t("visualContext.sceneMemory")}>
          <span className="inline-flex items-center gap-1.5 font-bold text-accent">
            <BookOpen size={16} aria-hidden="true" />
            {t("visualContext.sceneMemory", { count: sceneMemoryCount })}
          </span>
          {sceneMemorySavingsTokens > 0 && (
            <span className="font-semibold text-soft-fg-bright">
              {t("visualContext.sceneMemorySavings", { tokens: sceneMemorySavingsTokens })}
            </span>
          )}
        </div>
      )}

      {fusionCount > 0 && (
        <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-soft-bg px-3.5 py-2.5 text-sm" aria-label={t("visualContext.fusion")}>
          <span className="inline-flex items-center gap-1.5 font-bold text-accent">
            <Merge size={16} aria-hidden="true" />
            {t("visualContext.fusion", { count: fusionCount })}
          </span>
          {fusionSavedCalls > 0 && (
            <span className="font-semibold text-soft-fg-bright">
              {t("visualContext.fusionSavedCalls", { count: fusionSavedCalls })}
            </span>
          )}
          {fusionImageTokens > 0 && (
            <span className="font-semibold text-soft-fg-bright">
              {t("visualContext.fusionImageTokens", { tokens: fusionImageTokens })}
            </span>
          )}
        </div>
      )}

      {textHistorySummarizedCount > 0 && (
        <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-soft-bg px-3.5 py-2.5 text-sm" aria-label={t("visualContext.textHistory")}>
          <span className="inline-flex items-center gap-1.5 font-bold text-accent">
            <History size={16} aria-hidden="true" />
            {t("visualContext.textHistory", { count: textHistorySummarizedCount })}
          </span>
          {textHistorySavedTokens > 0 && (
            <span className="font-semibold text-soft-fg-bright">
              {t("visualContext.textHistorySavings", { tokens: textHistorySavedTokens })}
            </span>
          )}
        </div>
      )}

      {optimizationSummary.activeMechanismCount > 0 && (
        <div
          className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-soft-bg px-3.5 py-2.5 text-sm"
          aria-label={t("visualContext.optimizationSummary")}
          data-optimization-summary
        >
          <span className="inline-flex items-center gap-1.5 font-bold text-accent">
            <PiggyBank size={16} aria-hidden="true" />
            {t("visualContext.optimizationTotal", {
              count: optimizationSummary.activeMechanismCount,
              tokens: formatTokens(optimizationSummary.totalSavedTokens),
              usd: formatUsd(optimizationSummary.totalSavedUsd),
            })}
          </span>
          {optimizationSummary.items.map((item) => (
            <span key={item.id} className="font-semibold text-soft-fg-bright">
              {t(`visualContext.optimization.${item.id}`, {
                tokens: formatTokens(item.savedTokens),
                usd: formatUsd(item.savedUsd),
              })}
            </span>
          ))}
        </div>
      )}

      <aside
        className="inline-flex min-h-[46px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-soft-fg-bright backdrop-blur-md max-[480px]:min-h-auto max-[480px]:items-start max-[480px]:py-3"
        aria-label={t("visualContext.security")}
        data-security-strip
      >
        <ShieldCheck size={18} aria-hidden="true" />
        <span>{t("visualContext.securityHint")}</span>
      </aside>
    </div>
  );
});
