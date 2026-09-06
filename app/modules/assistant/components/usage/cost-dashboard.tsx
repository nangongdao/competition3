import { memo, useMemo } from "react";
import { ArrowLeft, Gauge, Scale } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

import { useCostDashboard } from "@/modules/assistant/hooks/use-cost-dashboard";
import { annotateMeasuredInterval } from "@/modules/assistant/lib/calibration-scaling";
import { GlobalUsagePanel } from "@/modules/assistant/components/usage/global-usage-panel";
import { GlobalBudgetPanel } from "@/modules/assistant/components/usage/global-budget-panel";
import { CostCockpitPanel } from "@/modules/assistant/components/usage/cost-cockpit-panel";
import { BudgetHistoryPanel } from "@/modules/assistant/components/usage/budget-history-panel";
import { SessionComparisonPanel } from "@/modules/assistant/components/usage/session-comparison-panel";
import { CostAlertCenter } from "@/modules/assistant/components/usage/cost-alert-center";
import { useCostAlertNotifications } from "@/modules/assistant/hooks/use-cost-alert-notifications";
import { GlobalShortcutHost } from "@/modules/assistant/components/global-shortcut-host";
import type { CommandAction } from "@/modules/assistant/lib/command-registry";

/**
 * 成本驾驶舱页面主体。
 *
 * 把整套成本治理能力（全局累计用量 / 预算护栏 / 成本驾驶舱 / 预算历史 /
 * 跨会话成本对比 / 成本告警）集中到一个全屏仪表盘视图，供评审/运维一眼
 * 看清「过去审计 + 现在护栏 + 未来预测 + 主动告警」的成本闭环。
 *
 * 数据由 `useCostDashboard` 聚合，本组件仅负责布局与接线。
 */
export const CostDashboard = memo(function CostDashboard(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLoaded, globalUsage, budget, calibrationFactor } =
    useCostDashboard();

  // 成本页命令面板命令：导航 / 面板类动作（返回工作台等）。
  const dashboardCommands = useMemo<readonly CommandAction[]>(
    () => [
      {
        id: "nav-home",
        group: "navigation",
        labelKey: "commandPalette.navHome",
        hintKey: "commandPalette.navHomeHint",
        keywords: ["home", "workspace", "工作台", "assistant"],
        action: () => navigate("/"),
      },
    ],
    [navigate],
  );

  const calibrationActive =
    Number.isFinite(calibrationFactor) && calibrationFactor !== 1;

  // 成本告警通知：把护栏 / 月度外推 / 历史审计折叠为可去重、可忽略的通知。
  const {
    notifications: costAlertNotifications,
    activeCount: costAlertActiveCount,
    hasFreshAlert: costAlertHasFreshAlert,
    dismiss: dismissCostAlert,
    dismissAll: dismissAllCostAlerts,
  } = useCostAlertNotifications({
    isLoaded,
    input: {
      guardrail: budget.guardrail,
      monthEndForecast: budget.monthEndForecast,
      budgetHistory: budget.budgetHistory,
    },
  });

  return (
    <div
      className="min-h-screen w-full bg-background text-foreground"
      data-testid="cost-dashboard"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:px-8">
        {/* 顶部标题栏 */}
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              aria-label={t("usage.costDashboard.backToWorkspace")}
              title={t("usage.costDashboard.backToWorkspace")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-muted-foreground transition-colors hover:bg-white/[0.08]"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
                <Gauge size={20} className="text-accent" aria-hidden="true" />
                {t("usage.costDashboard.title")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("usage.costDashboard.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 校准回写已应用提示（全局金额已按系数校正）。 */}
            {calibrationActive ? (
              <span
                data-calibration-badge
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent"
                aria-label={t("usage.costDashboard.calibrated")}
              >
                <Scale size={14} aria-hidden="true" />
                {t("usage.costDashboard.calibrated")}{" "}
                {t("usage.costDashboard.calibrationFactor", {
                  factor: calibrationFactor.toFixed(2),
                })}
              </span>
            ) : null}
            {/* 成本告警中心（右下角铃铛浮层）。 */}
            <CostAlertCenter
              notifications={costAlertNotifications}
              activeCount={costAlertActiveCount}
              showBanner={costAlertHasFreshAlert}
              onDismiss={dismissCostAlert}
              onDismissAll={dismissAllCostAlerts}
            />
          </div>
        </header>

        <main className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 主列：成本驾驶舱 + 预算历史审计。 */}
          <div className="grid content-start gap-4 lg:col-span-2">
            {budget.costCockpit !== null ? (
              <CostCockpitPanel
                cockpit={budget.costCockpit}
                measuredInterval={
                  calibrationFactor !== 1
                    ? annotateMeasuredInterval(
                        budget.costCockpit.forecast,
                        calibrationFactor,
                      )
                    : null
                }
              />
            ) : (
              <EmptyState message={t("usage.costDashboard.notLoaded")} />
            )}
            <BudgetHistoryPanel history={budget.budgetHistory} />
          </div>

          {/* 侧列：全局用量 + 预算护栏 + 跨会话成本对比。 */}
          <div className="grid content-start gap-4">
            <GlobalUsagePanel
              totals={globalUsage.globalUsageTotals}
              exportBundle={globalUsage.globalUsageExport}
            />
            <GlobalBudgetPanel
              guardrail={budget.guardrail}
              monthSpentUsd={budget.monthSpentUsd}
              forecast={budget.monthEndForecast}
              onSave={budget.saveBudget}
              isSaving={budget.isSavingBudget}
            />
            <SessionComparisonPanel comparison={budget.comparison} />
          </div>
        </main>
      </div>
      {/* 全局命令面板 + 快捷键 + 桌面通知（Cmd+K / 快捷键配置）。 */}
      <GlobalShortcutHost scope="costs" commands={dashboardCommands} />
    </div>
  );
});

function EmptyState({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="grid place-items-center rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8 text-sm text-muted-foreground">
      {message}
    </div>
  );
}
