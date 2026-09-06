import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts === undefined || Object.keys(opts).length === 0) {
        return key;
      }
      return `${key}:${Object.values(opts).join("/")}`;
    },
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { CalibrationPanel } from "./calibration-panel";
import { buildCalibrationViewModel } from "@/modules/assistant/lib/calibration-store";
import type { CalibrationSample } from "@/modules/assistant/lib/cost-calibration";

function sample(overrides: Partial<CalibrationSample> = {}): CalibrationSample {
  return {
    label: "session-1",
    estimatedUsd: 0.1,
    measuredUsd: 0.12,
    recordedAt: 1000,
    ...overrides,
  };
}

const noop = vi.fn();

describe("CalibrationPanel", () => {
  it("无样本时渲染空提示与当前估算成本", () => {
    const view = buildCalibrationViewModel([]);
    const html = renderToStaticMarkup(
      <CalibrationPanel
        viewModel={view}
        currentEstimateUsd={0.5}
        onRecord={noop}
        onRemove={noop}
        onClear={noop}
      />,
    );
    expect(html).toContain('aria-label="usage.calibrationPanel"');
    expect(html).toContain("data-calibration");
    expect(html).toContain("usage.calibrationTitle");
    expect(html).toContain("usage.calibrationEstimate");
    expect(html).toContain("usage.calibrationEmpty");
    expect(html).toContain('placeholder="usage.calibrationPlaceholder"');
  });

  it("渲染逐条样本（label / 估算→实测 / 相对偏差 / overrun 徽标）", () => {
    const view = buildCalibrationViewModel([
      sample({ estimatedUsd: 0.1, measuredUsd: 0.13 }),
    ]);
    const html = renderToStaticMarkup(
      <CalibrationPanel
        viewModel={view}
        currentEstimateUsd={0.1}
        onRecord={noop}
        onRemove={noop}
        onClear={noop}
      />,
    );
    expect(html).toContain('data-calibration-sample');
    expect(html).toContain("session-1");
    // 相对偏差 +30%。
    expect(html).toContain("+30.0%");
    // overrun 徽标（实测高于估算）。
    expect(html).toContain("usage.calibrationOverrun");
  });

  it("underrun 样本渲染低估徽标", () => {
    const view = buildCalibrationViewModel([
      sample({ estimatedUsd: 0.1, measuredUsd: 0.08 }),
    ]);
    const html = renderToStaticMarkup(
      <CalibrationPanel
        viewModel={view}
        currentEstimateUsd={0.1}
        onRecord={noop}
        onRemove={noop}
        onClear={noop}
      />,
    );
    expect(html).toContain("usage.calibrationUnderrun");
    expect(html).toContain("-20.0%");
  });

  it("汇总偏差超过阈值时渲染需校准告警", () => {
    const view = buildCalibrationViewModel([
      sample({ estimatedUsd: 0.1, measuredUsd: 0.2 }),
    ]);
    const html = renderToStaticMarkup(
      <CalibrationPanel
        viewModel={view}
        currentEstimateUsd={0.1}
        onRecord={noop}
        onRemove={noop}
        onClear={noop}
      />,
    );
    expect(html).toContain('data-calibration-summary');
    expect(html).toContain("usage.calibrationNeedsCalibration:10");
    expect(html).toContain('role="status"');
  });

  it("汇总偏差在阈值内时渲染无需校准文案", () => {
    const view = buildCalibrationViewModel([
      sample({ estimatedUsd: 0.1, measuredUsd: 0.105 }),
    ]);
    const html = renderToStaticMarkup(
      <CalibrationPanel
        viewModel={view}
        currentEstimateUsd={0.1}
        onRecord={noop}
        onRemove={noop}
        onClear={noop}
      />,
    );
    expect(html).toContain("usage.calibrationWithinTolerance");
    expect(html).not.toContain("usage.calibrationNeedsCalibration");
  });

  it("有样本时渲染清空按钮与删除按钮", () => {
    const view = buildCalibrationViewModel([sample({})]);
    const html = renderToStaticMarkup(
      <CalibrationPanel
        viewModel={view}
        currentEstimateUsd={0.1}
        onRecord={noop}
        onRemove={noop}
        onClear={noop}
      />,
    );
    expect(html).toContain("usage.calibrationClear");
    expect(html).toContain('aria-label="usage.calibrationRemove"');
  });

  it("需校准且未回写时渲染自动回写入口", () => {
    const view = buildCalibrationViewModel([
      sample({ estimatedUsd: 0.1, measuredUsd: 0.2 }),
    ]);
    const html = renderToStaticMarkup(
      <CalibrationPanel
        viewModel={view}
        currentEstimateUsd={0.1}
        writeback={{ applied: false, factor: 1, derivedAt: 0, totalRelativeDeltaPct: 0 }}
        showWritebackApply={true}
        onApplyWriteback={noop}
        onResetWriteback={noop}
        onRecord={noop}
        onRemove={noop}
        onClear={noop}
      />,
    );
    expect(html).toContain("data-calibration-writeback-apply");
    expect(html).toContain("usage.calibrationWritebackApply");
  });

  it("无需校准时不渲染自动回写入口", () => {
    const view = buildCalibrationViewModel([
      sample({ estimatedUsd: 0.1, measuredUsd: 0.105 }),
    ]);
    const html = renderToStaticMarkup(
      <CalibrationPanel
        viewModel={view}
        currentEstimateUsd={0.1}
        writeback={{ applied: false, factor: 1, derivedAt: 0, totalRelativeDeltaPct: 0 }}
        showWritebackApply={false}
        onApplyWriteback={noop}
        onResetWriteback={noop}
        onRecord={noop}
        onRemove={noop}
        onClear={noop}
      />,
    );
    expect(html).not.toContain("data-calibration-writeback-apply");
    expect(html).not.toContain("data-calibration-writeback-active");
  });

  it("已回写时渲染校正后估算、原始估算与重置入口", () => {
    const view = buildCalibrationViewModel([
      sample({ estimatedUsd: 0.1, measuredUsd: 0.2 }),
    ]);
    const html = renderToStaticMarkup(
      <CalibrationPanel
        viewModel={view}
        currentEstimateUsd={0.1}
        writeback={{ applied: true, factor: 2, derivedAt: 1000, totalRelativeDeltaPct: 100 }}
        showWritebackApply={false}
        onApplyWriteback={noop}
        onResetWriteback={noop}
        onRecord={noop}
        onRemove={noop}
        onClear={noop}
      />,
    );
    expect(html).toContain("data-calibration-corrected");
    expect(html).toContain("usage.calibrationWritebackCorrectedEstimate");
    expect(html).toContain("usage.calibrationWritebackOriginal");
    expect(html).toContain("data-calibration-writeback-active");
    expect(html).toContain("data-calibration-writeback-reset");
    // 校正后估算 = 0.1 × 2 = 0.2。
    expect(html).toContain("$0.2000");
  });

  it("已回写时不渲染自动回写入口", () => {
    const view = buildCalibrationViewModel([
      sample({ estimatedUsd: 0.1, measuredUsd: 0.2 }),
    ]);
    const html = renderToStaticMarkup(
      <CalibrationPanel
        viewModel={view}
        currentEstimateUsd={0.1}
        writeback={{ applied: true, factor: 2, derivedAt: 1000, totalRelativeDeltaPct: 100 }}
        showWritebackApply={true}
        onApplyWriteback={noop}
        onResetWriteback={noop}
        onRecord={noop}
        onRemove={noop}
        onClear={noop}
      />,
    );
    expect(html).not.toContain("data-calibration-writeback-apply");
  });
});
