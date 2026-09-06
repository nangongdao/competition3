import { memo } from "react";
import { useTranslation } from "react-i18next";

import { SessionSidebar } from "@/modules/assistant/components/session/sidebar";
import type { CalibrationViewModel } from "@/modules/assistant/lib/calibration-store";
import type { CalibrationWriteback } from "@/modules/assistant/lib/calibration-writeback";
import type { CostCockpit } from "@/modules/assistant/lib/cost-cockpit";
import type { BudgetHistoryMonth } from "@/modules/assistant/lib/budget-history";
import type { BudgetGuardrailState } from "@/modules/assistant/lib/budget-model";
import type { MonthEndForecast } from "@/modules/assistant/lib/global-budget-forecast";
import type { SessionComparisonSeries } from "@/modules/assistant/lib/session-comparison";
import type { SessionSummary, UsageTotals } from "@/modules/assistant/lib/session-client";
import type { UsageTrendSeries } from "@/modules/assistant/lib/usage-trend";

type SessionSidebarDrawerProps = {
  open: boolean;
  sessions: readonly SessionSummary[];
  activeSessionId: string | null;
  onNew: () => void;
  onSwitch: (sessionId: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onRemove: (sessionId: string) => void;
  onExport: (sessionId: string, format: "json" | "md") => void;
  onPrune: () => void;
  onClose: () => void;
  isPruning: boolean;
  /** ② 全局累计用量（跨会话）汇总；null 表示未加载。 */
  globalUsageTotals?: UsageTotals | null;
  /** ② 全局累计用量导出 bundle。 */
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

/**
 * 会话侧边栏抽屉（覆盖式，不改变主工作区 grid 布局）。
 *
 * M3.3 多会话管理的覆盖抽屉：点击遮罩或关闭按钮关闭。收敛主组件中
 * 相关的 JSX 与遮罩层。
 */
export const SessionSidebarDrawer = memo(function SessionSidebarDrawer({
  open,
  sessions,
  activeSessionId,
  onNew,
  onSwitch,
  onRename,
  onRemove,
  onExport,
  onPrune,
  onClose,
  isPruning,
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
}: SessionSidebarDrawerProps): React.JSX.Element | null {
  const { t } = useTranslation();

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="false"
      aria-label={t("toolbar.sidebarOverlay")}
    >
      <button
        type="button"
        aria-label={t("sidebar.closeSidebar")}
        onClick={onClose}
        className="h-full flex-1 cursor-default bg-[rgba(2,2,3,0.55)] backdrop-blur-[4px] [background-image:radial-gradient(ellipse_at_left,rgba(94,106,210,0.12),transparent_60%)] transition-colors duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
      />
      <div className="h-full w-[clamp(260px,28vw,340px)] max-w-[86vw] shrink-0 shadow-[inset_1px_0_0_0_rgba(255,255,255,0.06),-8px_0_32px_rgba(0,0,0,0.35)]">
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNew={onNew}
          onSwitch={onSwitch}
          onRename={onRename}
          onRemove={onRemove}
          onExport={onExport}
          onPrune={onPrune}
          onClose={onClose}
          isPruning={isPruning}
          globalUsageTotals={globalUsageTotals}
          globalUsageExport={globalUsageExport}
          budgetGuardrail={budgetGuardrail}
          monthSpentUsd={monthSpentUsd}
          monthEndForecast={monthEndForecast}
          onSaveBudget={onSaveBudget}
          isSavingBudget={isSavingBudget}
          sessionUsageTrend={sessionUsageTrend}
          sessionComparison={sessionComparison}
          costCockpit={costCockpit}
          costCockpitFactor={costCockpitFactor}
          budgetHistory={budgetHistory}
          calibrationView={calibrationView}
          currentEstimateUsd={currentEstimateUsd}
          calibrationWriteback={calibrationWriteback}
          showWritebackApply={showWritebackApply}
          onApplyWriteback={onApplyWriteback}
          onResetWriteback={onResetWriteback}
          onRecordCalibration={onRecordCalibration}
          onRemoveCalibration={onRemoveCalibration}
          onClearCalibration={onClearCalibration}
        />
      </div>
    </div>
  );
});
