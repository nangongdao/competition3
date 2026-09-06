import { memo, useMemo, useState } from "react";
import {
  Download,
  FileText,
  Gauge,
  MessageSquare,
  PenLine,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";
import { GlobalUsagePanel } from "@/modules/assistant/components/usage/global-usage-panel";
import { GlobalBudgetPanel } from "@/modules/assistant/components/usage/global-budget-panel";
import { CostForecastPanel } from "@/modules/assistant/components/usage/cost-forecast-panel";
import { SessionComparisonPanel } from "@/modules/assistant/components/usage/session-comparison-panel";
import { CostCockpitPanel } from "@/modules/assistant/components/usage/cost-cockpit-panel";
import { annotateMeasuredInterval } from "@/modules/assistant/lib/calibration-scaling";
import { BudgetHistoryPanel } from "@/modules/assistant/components/usage/budget-history-panel";
import { CalibrationPanel } from "@/modules/assistant/components/usage/calibration-panel";
import type { CalibrationViewModel } from "@/modules/assistant/lib/calibration-store";
import type { CalibrationWriteback } from "@/modules/assistant/lib/calibration-writeback";
import type { CostCockpit } from "@/modules/assistant/lib/cost-cockpit";
import type { BudgetHistoryMonth } from "@/modules/assistant/lib/budget-history";
import type { BudgetGuardrailState } from "@/modules/assistant/lib/budget-model";
import type { MonthEndForecast } from "@/modules/assistant/lib/global-budget-forecast";
import type { SessionComparisonSeries } from "@/modules/assistant/lib/session-comparison";
import type { SessionSummary, UsageTotals } from "@/modules/assistant/lib/session-client";
import type { UsageTrendSeries } from "@/modules/assistant/lib/usage-trend";

/** 校准视图模型的空缺省值（无样本）。 */
const EMPTY_CALIBRATION_VIEW: CalibrationViewModel = {
  samples: [],
  deltas: [],
  summary: {
    samples: [],
    totalEstimatedUsd: 0,
    totalMeasuredUsd: 0,
    totalAbsoluteDeltaUsd: 0,
    totalRelativeDeltaPct: 0,
    overrun: false,
  },
  needsCalibration: false,
};

type SessionSidebarProps = {
  sessions: readonly SessionSummary[];
  activeSessionId: string | null;
  onNew: () => void;
  onSwitch: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onRemove: (sessionId: string) => void;
  onExport: (sessionId: string, format: "json" | "md") => void;
  onPrune?: () => void;
  onClose: () => void;
  isPruning?: boolean;
  /** 全局跨会话累计用量（② 功能增量；null 表示未加载）。 */
  globalUsageTotals?: UsageTotals | null;
  /** 全局累计用量导出 bundle（② 功能增量）。 */
  globalUsageExport?: {
    jsonDownloadUrl: string;
    csvDownloadUrl: string;
    jsonFilename: string;
    csvFilename: string;
  } | null;
  /** ① 全局预算护栏状态。 */
  budgetGuardrail?: BudgetGuardrailState | null;
  /** ① 当月已用金额（USD）。 */
  monthSpentUsd?: number;
  /** ① 全局月度成本外推 vs 预算。 */
  monthEndForecast?: MonthEndForecast | null;
  /** ① 保存预算配置。 */
  onSaveBudget?: (params: {
    monthlyBudgetUsd: number;
    alertThresholdPct: number;
  }) => void;
  /** ① 是否正在保存预算。 */
  isSavingBudget?: boolean;
  /** ② 会话级用量趋势（用于成本外推）。 */
  sessionUsageTrend?: UsageTrendSeries | null;
  /** ③ 跨会话成本对比序列。 */
  sessionComparison?: SessionComparisonSeries | null;
  /** ④ 全局成本看板（成本驾驶舱）聚合结果。 */
  costCockpit?: CostCockpit | null;
  /** ④ 已应用的校准回写系数（未回写为 1）；用于给驾驶舱趋势图标注实测区间。 */
  costCockpitFactor?: number;
  /** ⑤ 预算历史审计序列（最近 N 个月 vs 月度预算）。 */
  budgetHistory?: readonly BudgetHistoryMonth[];
  /** ⑥ 成本校准视图模型。 */
  calibrationView?: CalibrationViewModel;
  /** ⑥ 当前会话前端估算成本（USD）。 */
  currentEstimateUsd?: number;
  /** ⑥ 已应用的校准回写视图（未回写时为默认空回写）。 */
  calibrationWriteback?: CalibrationWriteback;
  /** ⑥ 是否展示「自动回写校正估算单价」入口。 */
  showWritebackApply?: boolean;
  /** ⑥ 应用校准回写（把校正系数写回估算单价）。 */
  onApplyWriteback?: () => void;
  /** ⑥ 重置校准回写，恢复原始估算单价。 */
  onResetWriteback?: () => void;
  /** ⑥ 记录一条「实际账单金额」校准样本。 */
  onRecordCalibration?: (measuredUsd: number) => void;
  /** ⑥ 删除指定下标样本。 */
  onRemoveCalibration?: (index: number) => void;
  /** ⑥ 清空全部样本。 */
  onClearCalibration?: () => void;
};

function formatRelativeTime(timestamp: number, t: (key: string, opts?: { count?: number }) => string): string {
  const diffMs = Date.now() - timestamp;
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) {
    return t("sidebar.justNow");
  }

  if (diffMs < hourMs) {
    return t("sidebar.minutesAgo", { count: Math.floor(diffMs / minuteMs) });
  }

  if (diffMs < dayMs) {
    return t("sidebar.hoursAgo", { count: Math.floor(diffMs / hourMs) });
  }

  if (diffMs < 7 * dayMs) {
    return t("sidebar.daysAgo", { count: Math.floor(diffMs / dayMs) });
  }

  return new Date(timestamp).toLocaleDateString();
}

function defaultSessionTitle(session: SessionSummary, fallback: string): string {
  if (session.title !== undefined && session.title.trim().length > 0) {
    return session.title;
  }

  return fallback;
}

type EditingState = {
  sessionId: string;
  value: string;
} | null;

type ConfirmRemoveState = {
  sessionId: string;
} | null;

/**
 * 会话侧边栏（M3.3 多会话管理）。
 *
 * 复用 shadcn/ui 基础组件，支持新建 / 切换 / 重命名（行内编辑）/
 * 删除（二次确认）/ 导出（JSON / Markdown）。
 * 图标统一使用 Lucide，界面无 emoji。
 */
export const SessionSidebar = memo(function SessionSidebar({
  sessions,
  activeSessionId,
  onNew,
  onSwitch,
  onRename,
  onRemove,
  onExport,
  onPrune,
  onClose,
  isPruning = false,
  globalUsageTotals = null,
  globalUsageExport = null,
  budgetGuardrail = null,
  monthSpentUsd = 0,
  monthEndForecast = null,
  onSaveBudget,
  isSavingBudget = false,
  sessionUsageTrend = null,
  sessionComparison = null,
  costCockpit = null,
  costCockpitFactor = 1,
  budgetHistory = [],
  calibrationView,
  currentEstimateUsd = 0,
  calibrationWriteback,
  showWritebackApply = false,
  onApplyWriteback,
  onResetWriteback,
  onRecordCalibration,
  onRemoveCalibration,
  onClearCalibration,
}: SessionSidebarProps): React.JSX.Element {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<EditingState>(null);
  const [confirmRemove, setConfirmRemove] = useState<ConfirmRemoveState>(null);

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [sessions],
  );

  function startRename(session: SessionSummary): void {
    setConfirmRemove(null);
    setEditing({ sessionId: session.id, value: defaultSessionTitle(session, t("sidebar.newSessionDefault")) });
  }

  function commitRename(sessionId: string): void {
    if (editing === null) {
      return;
    }

    const title = editing.value.trim();

    if (title.length > 0) {
      onRename(sessionId, title);
    }

    setEditing(null);
  }

  function requestRemove(sessionId: string): void {
    setEditing(null);
    setConfirmRemove({ sessionId });
  }

  function cancelRemove(): void {
    setConfirmRemove(null);
  }

  return (
    <aside
      className="flex h-full flex-col border-r border-toolbar-border bg-toolbar-bg text-toolbar-fg backdrop-blur-xl"
      aria-label={t("sidebar.title")}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <div className="flex items-center gap-2 text-[0.86rem] font-[600] text-toolbar-fg">
          <MessageSquare size={16} aria-hidden="true" />
          <span>{t("sidebar.sessions")}</span>
          <span className="rounded-full bg-toolbar-border px-2 py-0.5 text-[0.68rem] text-toolbar-muted">
            {sessions.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/costs"
            title={t("usage.costDashboard.entry")}
            aria-label={t("usage.costDashboard.entry")}
            className="inline-flex min-h-[30px] min-w-[30px] items-center justify-center rounded-md text-toolbar-muted transition-colors hover:bg-white/[0.08] hover:text-toolbar-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Gauge size={16} aria-hidden="true" />
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNew}
            title={t("sidebar.newSession")}
            aria-label={t("sidebar.newSession")}
            className="min-h-[30px] px-2 text-toolbar-muted"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="max-[480px]:hidden">{t("sidebar.new")}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            title={t("sidebar.closeSidebar")}
            aria-label={t("sidebar.closeSidebar")}
            className="min-h-[30px] min-w-[30px] text-toolbar-muted"
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <Separator />

      <div
        className="flex-1 space-y-1 overflow-y-auto px-2 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        tabIndex={0}
        aria-label={t("sidebar.sessionList")}
      >
        {sortedSessions.length === 0 ? (
          <div className="px-2 py-8 text-center text-[0.78rem] text-toolbar-muted">
            <MessageSquare size={20} className="mx-auto mb-2 opacity-60" aria-hidden="true" />
            <p>{t("sidebar.emptyTitle")}</p>
            <p className="mt-1 text-[0.7rem] opacity-70">{t("sidebar.emptyHint")}</p>
          </div>
        ) : (
          sortedSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const isEditing = editing?.sessionId === session.id;
            const isConfirming = confirmRemove?.sessionId === session.id;

            return (
              <div
                key={session.id}
                data-active={isActive}
                className="group relative rounded-md border border-transparent transition-colors data-[active=true]:border-primary data-[active=true]:bg-primary/10"
              >
                {isConfirming ? (
                  <div className="flex items-center justify-between gap-1 px-2.5 py-2">
                    <span className="text-[0.74rem] font-bold text-toolbar-muted">
                      {t("sidebar.confirmRemove")}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelRemove}
                        className="min-h-[26px] px-2 text-[0.72rem] text-toolbar-muted"
                      >
                        {t("sidebar.cancel")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          onRemove(session.id);
                          setConfirmRemove(null);
                        }}
                        className="min-h-[26px] px-2 text-[0.72rem]"
                      >
                        {t("sidebar.delete")}
                      </Button>
                    </div>
                  </div>
                ) : isEditing ? (
                  <form
                    className="flex items-center gap-1 px-2 py-1.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitRename(session.id);
                    }}
                  >
                    <Input
                      autoFocus
                      value={editing?.value ?? ""}
                      onChange={(event) =>
                        setEditing({ sessionId: session.id, value: event.target.value })
                      }
                      onBlur={() => commitRename(session.id)}
                      aria-label={t("sidebar.sessionName")}
                      className="h-8 text-[0.8rem]"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      type="submit"
                      className="min-h-[30px] px-2 text-[0.72rem]"
                    >
                      {t("sidebar.save")}
                    </Button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onSwitch(session.id)}
                      aria-pressed={isActive}
                      className="flex w-full cursor-pointer flex-col items-start gap-0.5 px-2.5 py-2 text-left"
                    >
                      <span className="line-clamp-1 w-full text-[0.82rem] font-[600] text-toolbar-fg">
                        {defaultSessionTitle(session, t("sidebar.newSessionDefault"))}
                      </span>
                    <span className="text-[0.68rem] text-toolbar-muted">
                      {t("sidebar.messagesCount", { count: session.messageCount })} · {formatRelativeTime(session.updatedAt, t)}
                    </span>
                    </button>

                    <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex group-focus-within:flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("sidebar.rename")}
                        aria-label={t("sidebar.renameWithTitle", { title: defaultSessionTitle(session, t("sidebar.newSessionDefault")) })}
                        onClick={() => startRename(session)}
                        className="min-h-[26px] min-w-[26px] text-toolbar-muted"
                      >
                        <PenLine size={14} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("sidebar.exportJson")}
                        aria-label={t("sidebar.exportJsonWithTitle", { title: defaultSessionTitle(session, t("sidebar.newSessionDefault")) })}
                        onClick={() => onExport(session.id, "json")}
                        className="min-h-[26px] min-w-[26px] text-toolbar-muted"
                      >
                        <Download size={14} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("sidebar.delete")}
                        aria-label={t("sidebar.deleteWithTitle", { title: defaultSessionTitle(session, t("sidebar.newSessionDefault")) })}
                        onClick={() => requestRemove(session.id)}
                        className="min-h-[26px] min-w-[26px] text-toolbar-muted hover:text-destructive"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <Separator />

      <div className="space-y-1.5 px-3 py-2.5">
        <Button
          variant="outline"
          size="sm"
          disabled={activeSessionId === null}
          onClick={() => {
            if (activeSessionId !== null) {
              onExport(activeSessionId, "md");
            }
          }}
          className="w-full justify-start text-[0.76rem] text-toolbar-fg"
        >
          <FileText size={15} aria-hidden="true" />
          <span>{t("sidebar.exportCurrentMarkdown")}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onPrune}
          disabled={isPruning}
          className="w-full justify-start text-[0.76rem] text-toolbar-fg"
        >
          <Trash2 size={15} aria-hidden="true" />
          <span>{isPruning ? t("sidebar.pruning") : t("sidebar.pruneEmpty")}</span>
        </Button>
        {isPruning && (
          <p className="text-center text-[0.68rem] text-toolbar-muted">{t("sidebar.pruningHint")}</p>
        )}
      </div>

      <Separator />

      {/* ② 全局跨会话累计用量视图（基于 GET /api/sessions/usage/totals）。 */}
      <div className="grid gap-2.5 px-3 py-2.5">
        <GlobalUsagePanel
          totals={globalUsageTotals}
          exportBundle={globalUsageExport}
        />

        {/* ① 全局预算护栏（跨会话成本护栏）。 */}
        {budgetGuardrail !== null ? (
          <GlobalBudgetPanel
            guardrail={budgetGuardrail}
            monthSpentUsd={monthSpentUsd}
            forecast={monthEndForecast ?? undefined}
            onSave={
              onSaveBudget ??
              (() => {
                /* 未接线时静默。 */
              })
            }
            isSaving={isSavingBudget}
          />
        ) : null}

        {/* ② 成本趋势外推/预测（基于当前会话趋势）。 */}
        {sessionUsageTrend !== null && sessionUsageTrend.points.length > 0 ? (
          <CostForecastPanel series={sessionUsageTrend} />
        ) : null}

        {/* ③ 跨会话成本对比。 */}
        {sessionComparison !== null ? (
          <SessionComparisonPanel comparison={sessionComparison} />
        ) : null}

        {/* ④ 全局成本看板（成本驾驶舱）。 */}
        {costCockpit !== null ? (
          <CostCockpitPanel
            cockpit={costCockpit}
            measuredInterval={
              costCockpitFactor !== 1
                ? annotateMeasuredInterval(costCockpit.forecast, costCockpitFactor)
                : null
            }
          />
        ) : null}

        {/* ⑤ 预算历史审计（最近 N 个月 vs 月度预算）。 */}
        {budgetHistory.length > 0 ? (
          <BudgetHistoryPanel history={budgetHistory} />
        ) : null}

        {/* ⑥ 成本校准工作台（估算 vs 实测）。 */}
        {onRecordCalibration !== undefined &&
        onRemoveCalibration !== undefined &&
        onClearCalibration !== undefined ? (
          <CalibrationPanel
            viewModel={calibrationView ?? EMPTY_CALIBRATION_VIEW}
            currentEstimateUsd={currentEstimateUsd}
            writeback={calibrationWriteback}
            showWritebackApply={showWritebackApply}
            onApplyWriteback={onApplyWriteback}
            onResetWriteback={onResetWriteback}
            onRecord={onRecordCalibration}
            onRemove={onRemoveCalibration}
            onClear={onClearCalibration}
          />
        ) : null}
      </div>
    </aside>
  );
});
