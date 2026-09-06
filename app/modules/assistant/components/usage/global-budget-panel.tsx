import { memo, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  CircleDollarSign,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  budgetProgressPct,
  type BudgetGuardrailState,
} from "@/modules/assistant/lib/budget-model";
import { formatUsd } from "@/modules/assistant/lib/cost-model";
import type { MonthEndForecast } from "@/modules/assistant/lib/global-budget-forecast";

type GlobalBudgetPanelProps = {
  /** 预算护栏状态。 */
  guardrail: BudgetGuardrailState;
  /** 当月已用金额（USD）。 */
  monthSpentUsd: number;
  /** 全局月度成本外推 vs 预算（可选；`valid` 为 false 时隐藏预测条）。 */
  forecast?: MonthEndForecast;
  /** 保存预算配置。 */
  onSave: (params: {
    monthlyBudgetUsd: number;
    alertThresholdPct: number;
  }) => void;
  /** 是否正在保存。 */
  isSaving?: boolean;
};

const fieldClassName =
  "min-w-0 flex-1 rounded-md border border-float-border bg-float-bg px-2 py-1 text-[0.72rem] font-semibold text-foreground focus:outline-2 focus:outline-offset-1 focus:outline-violet";
const labelClassName =
  "text-[0.62rem] font-[600] uppercase text-toolbar-muted";

/**
 * ① 全局预算护栏（跨会话成本护栏）面板。
 *
 * 基于 `computeBudgetGuardrail` 折叠的护栏状态，渲染：
 *   - 已用 / 剩余 / 使用率（含进度条）；
 *   - 告警级别（warn / over）与文案提示；
 *   - 预算金额与告警阈值的内联编辑保存。
 * 纯展示 + 轻量表单，数据与保存动作由上层注入。
 */
export const GlobalBudgetPanel = memo(function GlobalBudgetPanel({
  guardrail,
  monthSpentUsd,
  forecast,
  onSave,
  isSaving = false,
}: GlobalBudgetPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [budgetInput, setBudgetInput] = useState(
    guardrail.enabled ? String(guardrail.budgetUsd) : "",
  );
  const [thresholdInput, setThresholdInput] = useState(
    String(guardrail.alertThresholdPct),
  );

  const progress = budgetProgressPct(guardrail);
  const alertClass =
    guardrail.alertLevel === "over"
      ? "text-destructive"
      : guardrail.alertLevel === "warn"
        ? "text-amber"
        : "text-emerald";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const budget = Number(budgetInput);
    const threshold = Number(thresholdInput);
    if (!Number.isFinite(budget) || budget < 0) {
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
      return;
    }
    onSave({ monthlyBudgetUsd: budget, alertThresholdPct: threshold });
  };

  return (
    <div
      className="grid gap-2 rounded-md border border-toolbar-border bg-float-bg p-2.5"
      aria-label={t("usage.budgetPanel")}
    >
      <div className="flex items-center gap-2 text-[0.78rem] font-[600] text-toolbar-fg">
        {guardrail.alertLevel === "over" ? (
          <ShieldAlert size={15} aria-hidden="true" className="text-destructive" />
        ) : (
          <ShieldCheck size={15} aria-hidden="true" />
        )}
        <span>{t("usage.budgetTitle")}</span>
      </div>

      {guardrail.enabled ? (
        <>
          <dl className="m-0 grid grid-cols-3 gap-1.5">
            <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
              <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
                {t("usage.budgetSpent")}
              </dt>
              <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
                {formatUsd(guardrail.spentUsd)}
              </dd>
            </div>
            <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
              <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
                {t("usage.budgetRemaining")}
              </dt>
              <dd className="m-0 text-[0.9rem] font-[600] text-toolbar-fg">
                {formatUsd(guardrail.remainingUsd)}
              </dd>
            </div>
            <div className="grid gap-0.5 rounded-md bg-toolbar-border p-1.5">
              <dt className="text-[0.62rem] font-[600] uppercase text-toolbar-muted">
                {t("usage.budgetUsedPct")}
              </dt>
              <dd className={`m-0 text-[0.9rem] font-[600] ${alertClass}`}>
                {guardrail.usedPct.toFixed(1)}%
              </dd>
            </div>
          </dl>

          <div
            className="h-2 overflow-hidden rounded-full bg-toolbar-border"
            role="progressbar"
            aria-label={t("usage.budgetProgress", {
              used: formatUsd(guardrail.spentUsd),
              budget: formatUsd(guardrail.budgetUsd),
            })}
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full ${
                guardrail.alertLevel === "over"
                  ? "bg-destructive"
                  : guardrail.alertLevel === "warn"
                    ? "bg-amber"
                    : "bg-emerald"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {guardrail.exceededAlertThreshold ? (
            <p
              className={`m-0 text-[0.68rem] leading-[1.35] ${alertClass}`}
              role="note"
            >
              {t(
                guardrail.alertLevel === "over"
                  ? "usage.budgetOver"
                  : "usage.budgetWarn",
                { pct: guardrail.alertThresholdPct },
              )}
            </p>
          ) : null}
        </>
      ) : (
        <p className="m-0 text-[0.7rem] text-toolbar-muted">
          {t("usage.budgetGuardUnset")}
        </p>
      )}

      <p className="m-0 text-[0.68rem] leading-[1.35] text-toolbar-muted">
        {t("usage.budgetMonthHint", { spent: formatUsd(monthSpentUsd) })}
      </p>

      {forecast !== undefined && forecast.valid && guardrail.enabled ? (
        <div
          className="grid gap-1 rounded-md border border-toolbar-border bg-toolbar-bg p-2"
          data-budget-forecast
          aria-label={t("usage.budgetForecastTitle")}
        >
          <div className="flex items-center gap-1.5 text-[0.68rem] font-extrabold text-toolbar-fg">
            <TrendingUp size={13} aria-hidden="true" />
            <span>{t("usage.budgetForecastTitle")}</span>
          </div>
          <div className="grid gap-0.5">
            <div className="flex items-baseline justify-between gap-2 text-[0.72rem]">
              <span className="text-toolbar-muted">
                {t("usage.budgetForecastProjected")}
              </span>
              <span className="font-black text-toolbar-fg">
                {formatUsd(forecast.projectedMonthEndUsd)}
                {forecast.projectedDeltaUsd > 0 ? (
                  <span className="ml-1 font-bold text-amber">
                    +{formatUsd(forecast.projectedDeltaUsd)}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[0.72rem]">
              <span className="text-toolbar-muted">
                {t("usage.budgetForecastUtilization")}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 text-[0.66rem] font-black ${
                  forecast.status === "over-budget"
                    ? "bg-destructive/15 text-destructive"
                    : forecast.status === "at-risk"
                      ? "bg-amber/15 text-amber"
                      : "bg-emerald/15 text-emerald"
                }`}
              >
                <CircleDollarSign size={11} aria-hidden="true" />
                {forecast.projectedUtilizationPct.toFixed(0)}% ·
                {t(`usage.budgetForecastStatus.${forecast.status}`)}
              </span>
            </div>
            <p className="m-0 text-[0.64rem] leading-[1.3] text-toolbar-muted">
              {t("usage.budgetForecastRemaining", {
                days: forecast.remainingDays,
              })}
            </p>
          </div>
        </div>
      ) : null}

      <form className="grid gap-1.5" onSubmit={handleSubmit}>
        <label className="grid gap-0.5">
          <span className={labelClassName}>{t("usage.budgetAmount")}</span>
          <input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            value={budgetInput}
            onChange={(event) => setBudgetInput(event.target.value)}
            className={fieldClassName}
            aria-label={t("usage.budgetAmount")}
          />
        </label>
        <label className="grid gap-0.5">
          <span className={labelClassName}>{t("usage.budgetThreshold")}</span>
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            inputMode="numeric"
            value={thresholdInput}
            onChange={(event) => setThresholdInput(event.target.value)}
            className={fieldClassName}
            aria-label={t("usage.budgetThreshold")}
          />
        </label>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-[26px] items-center justify-center gap-1 rounded-md border border-toolbar-border bg-toolbar-bg px-2 text-[0.68rem] font-[600] text-toolbar-fg hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? t("usage.budgetSaving") : t("usage.budgetGuardSave")}
        </button>
      </form>
    </div>
  );
});
