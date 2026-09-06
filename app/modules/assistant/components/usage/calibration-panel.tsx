import { memo, useState } from "react";
import { Check, Scale, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { CalibrationViewModel } from "@/modules/assistant/lib/calibration-store";
import {
  parseCalibrationInput,
} from "@/modules/assistant/lib/calibration-store";
import {
  applyCalibrationFactor,
  type CalibrationWriteback,
} from "@/modules/assistant/lib/calibration-writeback";
import { formatUsd } from "@/modules/assistant/lib/cost-model";

type CalibrationPanelProps = {
  /** 校准视图模型（估算 vs 实测差异 + 汇总）。 */
  viewModel: CalibrationViewModel;
  /** 当前会话前端估算成本（USD）。 */
  currentEstimateUsd: number;
  /** 已应用的校准回写视图（未回写时为默认空回写）。 */
  writeback?: CalibrationWriteback;
  /** 是否展示「自动回写校正估算单价」入口（需校准且尚未回写）。 */
  showWritebackApply?: boolean;
  /** 应用回写（把当前建议校正系数写回估算单价）。 */
  onApplyWriteback?: () => void;
  /** 清除回写，恢复原始估算单价。 */
  onResetWriteback?: () => void;
  /** 记录一条「实际账单金额」校准样本。 */
  onRecord: (measuredUsd: number) => void;
  /** 删除指定下标样本。 */
  onRemove: (index: number) => void;
  /** 清空全部样本。 */
  onClear: () => void;
};

function formatSignedPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * 成本校准工作台面板（估算 vs 实测）。
 *
 * 把离线 `cost-calibration.ts` 接入应用内：用户在当前会话记录「provider 控制台实际账单」，
 * 面板实时计算估算 vs 实测差异（绝对/相对 %）、逐条样本列表与汇总，并按既定口径
 * （偏差 >10%）提示「单价假设需校准」。持久化由调用方 hook 负责。
 *
 * 纯展示 + 轻交互（本地 input state），数据由 `use-calibration` 注入。
 */
export const CalibrationPanel = memo(function CalibrationPanel({
  viewModel,
  currentEstimateUsd,
  writeback,
  showWritebackApply = false,
  onApplyWriteback,
  onResetWriteback,
  onRecord,
  onRemove,
  onClear,
}: CalibrationPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const hasSamples = viewModel.samples.length > 0;
  const writebackApplied = writeback?.applied === true;
  const correctedEstimateUsd = writebackApplied
    ? applyCalibrationFactor(currentEstimateUsd, writeback.factor)
    : currentEstimateUsd;

  const handleRecord = (): void => {
    const parsed = parseCalibrationInput(draft);
    if (parsed === null) {
      return;
    }
    onRecord(parsed);
    setDraft("");
  };

  return (
    <div
      className="grid gap-2 rounded-md border border-toolbar-border bg-float-bg p-2.5"
      aria-label={t("usage.calibrationPanel")}
      data-calibration
    >
      <div className="flex items-center gap-2 text-[0.78rem] font-extrabold text-toolbar-fg">
        <Scale size={15} aria-hidden="true" />
        <span>{t("usage.calibrationTitle")}</span>
      </div>

      {/* 当前估算成本（回写时展示原始 + 校正）+ 输入实际账单 + 记录。 */}
      <div className="grid gap-1.5">
        <div className="grid gap-0.5">
          <div className="flex items-baseline justify-between gap-2 text-[0.66rem] text-toolbar-muted">
            <span>
              {writebackApplied
                ? t("usage.calibrationWritebackCorrectedEstimate")
                : t("usage.calibrationEstimate")}
            </span>
            <span className="font-black text-toolbar-fg" data-calibration-corrected>
              {formatUsd(correctedEstimateUsd)}
            </span>
          </div>
          {writebackApplied ? (
            <div className="flex items-baseline justify-between gap-2 text-[0.6rem] text-toolbar-muted">
              <span>{t("usage.calibrationWritebackOriginal")}</span>
              <span className="line-through opacity-70">
                {formatUsd(currentEstimateUsd)}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={draft}
            placeholder={t("usage.calibrationPlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleRecord();
              }
            }}
            className="min-h-[26px] w-28 rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[0.72rem] font-semibold text-foreground placeholder:text-fog transition-[border-color,box-shadow] duration-[200ms] focus:border-[color:var(--color-primary)] focus:shadow-[0_0_0_3px_rgba(94,106,210,0.15)] focus:outline-none"
          />
          <button
            type="button"
            onClick={handleRecord}
            className="inline-flex min-h-[26px] items-center gap-1 rounded-lg border-0 bg-[color:var(--color-primary)] px-2 text-[0.7rem] font-[600] text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_2px_8px_rgba(94,106,210,0.3)] transition-[background,box-shadow] duration-[200ms] hover:bg-[#6872d9]"
          >
            {t("usage.calibrationRecord")}
          </button>
        </div>
      </div>

      {!hasSamples ? (
        <p className="m-0 text-[0.68rem] leading-[1.35] text-toolbar-muted">
          {t("usage.calibrationEmpty")}
        </p>
      ) : (
        <>
          {/* 逐条样本列表。 */}
          <div className="grid gap-1">
            {viewModel.samples.map((sample, index) => {
              const delta = viewModel.deltas[index];
              return (
                <div
                  key={`${sample.label}-${sample.recordedAt}-${index}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-1.5 rounded-md bg-toolbar-border px-1.5 py-1"
                  data-calibration-sample
                >
                  <div className="grid gap-0.5">
                    <div className="flex items-center gap-1.5 text-[0.62rem]">
                      <span className="max-w-[9rem] truncate font-extrabold text-toolbar-fg">
                        {sample.label}
                      </span>
                      {delta?.overrun ? (
                        <span className="rounded-full bg-amber/10 px-1 text-[0.55rem] font-extrabold uppercase text-amber">
                          {t("usage.calibrationOverrun")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald/10 px-1 text-[0.55rem] font-extrabold uppercase text-emerald">
                          {t("usage.calibrationUnderrun")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[0.6rem] text-toolbar-muted">
                      <span>
                        {t("usage.calibrationEst")} {formatUsd(sample.estimatedUsd)}
                      </span>
                      <span aria-hidden="true">→</span>
                      <span className="font-bold text-toolbar-fg">
                        {formatUsd(sample.measuredUsd)}
                      </span>
                      <span
                        className={`font-black ${
                          delta && delta.absoluteDeltaUsd > 0
                            ? "text-amber"
                            : "text-emerald"
                        }`}
                      >
                        {delta ? formatSignedPct(delta.relativeDeltaPct) : "—"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={t("usage.calibrationRemove")}
                    onClick={() => onRemove(index)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md text-toolbar-muted hover:bg-toolbar-border hover:text-toolbar-fg"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* 汇总 + 校准告警。 */}
          <div
            className="grid gap-1 rounded-md bg-toolbar-border px-1.5 py-1.5"
            data-calibration-summary
          >
            <div className="flex items-baseline justify-between text-[0.64rem] text-toolbar-muted">
              <span>{t("usage.calibrationSummary")}</span>
              <span
                className={`font-black ${
                  viewModel.summary.totalAbsoluteDeltaUsd > 0
                    ? "text-amber"
                    : "text-emerald"
                }`}
              >
                {formatSignedPct(viewModel.summary.totalRelativeDeltaPct)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[0.62rem] text-toolbar-muted">
              <span>
                {t("usage.calibrationTotals", {
                  estimated: formatUsd(viewModel.summary.totalEstimatedUsd),
                  measured: formatUsd(viewModel.summary.totalMeasuredUsd),
                })}
              </span>
            </div>
            {viewModel.needsCalibration ? (
              <p
                className="m-0 flex items-center gap-1 text-[0.62rem] font-bold text-amber"
                role="status"
              >
                <Scale size={11} aria-hidden="true" />
                {t("usage.calibrationNeedsCalibration", {
                  threshold: 10,
                })}
              </p>
            ) : (
              <p
                className="m-0 text-[0.6rem] leading-[1.3] text-toolbar-muted"
                role="status"
              >
                {t("usage.calibrationWithinTolerance")}
              </p>
            )}
          </div>

          {/* 校准偏差自动回写估算单价。 */}
          {writebackApplied ? (
            <div
              className="grid gap-1 rounded-md bg-[color:var(--color-primary)]/[0.08] px-1.5 py-1.5"
              data-calibration-writeback-active
            >
              <div className="flex items-center gap-1.5 text-[0.62rem] font-bold text-[color:var(--color-primary)]">
                <Check size={11} aria-hidden="true" />
                <span>
                  {t("usage.calibrationWritebackActive", {
                    factor: Number.isFinite(writeback.factor)
                      ? writeback.factor.toFixed(2)
                      : "1.00",
                    pct: Number.isFinite(writeback.totalRelativeDeltaPct)
                      ? Math.abs(writeback.totalRelativeDeltaPct).toFixed(1)
                      : "0",
                  })}
                </span>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onResetWriteback}
                  data-calibration-writeback-reset
                  className="inline-flex min-h-[22px] items-center gap-1 rounded-md border border-panel-border bg-float-bg px-1.5 text-[0.62rem] font-bold text-toolbar-muted hover:bg-toolbar-border hover:text-toolbar-fg"
                >
                  <X size={11} aria-hidden="true" />
                  {t("usage.calibrationWritebackReset")}
                </button>
              </div>
            </div>
          ) : showWritebackApply && onApplyWriteback ? (
            <div className="grid gap-1">
              <button
                type="button"
                onClick={onApplyWriteback}
                data-calibration-writeback-apply
                className="inline-flex min-h-[26px] items-center justify-center gap-1.5 rounded-lg bg-[color:var(--color-primary)] px-2 text-[0.7rem] font-[600] text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_2px_8px_rgba(94,106,210,0.3)] transition-[background,box-shadow] duration-[200ms] hover:bg-[#6872d9]"
              >
                <Check size={12} aria-hidden="true" />
                {t("usage.calibrationWritebackApply")}
              </button>
            </div>
          ) : null}

          {/* 清空。 */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-[22px] items-center gap-1 rounded-md border border-panel-border bg-float-bg px-1.5 text-[0.62rem] font-bold text-toolbar-muted hover:bg-toolbar-border hover:text-toolbar-fg"
            >
              <X size={11} aria-hidden="true" />
              {t("usage.calibrationClear")}
            </button>
          </div>
        </>
      )}
    </div>
  );
});
