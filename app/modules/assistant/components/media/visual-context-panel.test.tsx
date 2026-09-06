import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：用固定实现替换 useTranslation。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { VisualContextPanel } from "./visual-context-panel";
import {
  deriveFrameTelemetryStats,
  deriveSampleRateStats,
  EMPTY_FRAME_TELEMETRY,
  type FrameTelemetryState,
} from "@/modules/assistant/lib/frame-telemetry";

const EMPTY: FrameTelemetryState = EMPTY_FRAME_TELEMETRY;

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    lastFrameDataUrl: null,
    sampledFrameCount: 3,
    sentFrameCount: 2,
    skippedAutoFrameCount: 1,
    prunedFrameCount: 0,
    isAutoSampling: true,
    samplingIntervalSeconds: 8,
    isVisible: true,
    sceneMemoryCount: 0,
    sceneMemorySavingsTokens: 0,
    fusionCount: 0,
    fusionSavedCalls: 0,
    fusionImageTokens: 0,
    textHistorySummarizedCount: 0,
    textHistorySavedTokens: 0,
    frameTelemetryStats: deriveFrameTelemetryStats(EMPTY),
    sampleRateStats: deriveSampleRateStats(EMPTY),
    ...overrides,
  };
}

describe("VisualContextPanel", () => {
  it("不可见时渲染 hidden 属性", () => {
    const html = renderToStaticMarkup(
      <VisualContextPanel {...makeProps({ isVisible: false })} />,
    );
    expect(html).toContain('hidden=""');
  });

  it("无最近帧时渲染空态占位", () => {
    const html = renderToStaticMarkup(
      <VisualContextPanel {...makeProps({ lastFrameDataUrl: null })} />,
    );
    expect(html).toContain("visualContext.empty");
    expect(html).not.toContain("<img");
  });

  it("有最近帧时渲染缩略图 img", () => {
    const html = renderToStaticMarkup(
      <VisualContextPanel {...makeProps({ lastFrameDataUrl: "data:image/jpeg;base64,AAAA" })} />,
    );
    expect(html).toContain("<img");
    expect(html).toContain('src="data:image/jpeg;base64,AAAA"');
  });

  it("展示采样/发送/跳过/剪枝计数与采样间隔", () => {
    const html = renderToStaticMarkup(
      <VisualContextPanel
        {...makeProps({
          sampledFrameCount: 3,
          sentFrameCount: 2,
          skippedAutoFrameCount: 1,
          prunedFrameCount: 4,
          isAutoSampling: true,
          samplingIntervalSeconds: 8,
        })}
      />,
    );
    expect(html).toContain("visualContext.sampled");
    expect(html).toContain("visualContext.sent");
    expect(html).toContain("visualContext.skipped");
    expect(html).toContain("visualContext.pruned");
    expect(html).toContain("visualContext.seconds");
    expect(html).toContain(">3<");
    expect(html).toContain(">2<");
    expect(html).toContain(">1<");
    expect(html).toContain(">4<");
  });

  it("手动采样模式展示 manual 而非秒数", () => {
    const html = renderToStaticMarkup(
      <VisualContextPanel {...makeProps({ isAutoSampling: false })} />,
    );
    expect(html).toContain("visualContext.manual");
    expect(html).not.toContain("visualContext.seconds");
  });

  it("无帧处理遥测时不渲染耗时区", () => {
    const html = renderToStaticMarkup(
      <VisualContextPanel {...makeProps({ frameTelemetryStats: deriveFrameTelemetryStats(EMPTY) })} />,
    );
    expect(html).not.toContain("visualContext.frameTelemetry");
  });

  it("有帧处理遥测时渲染耗时与采样 FPS", () => {
    const withTelemetry: FrameTelemetryState = {
      ...EMPTY,
      count: 10,
      totalMs: 100,
      maxMs: 15,
      lastMs: 8,
      tickCount: 9,
      totalIntervalMs: 4500,
      lastIntervalMs: 500,
      lastTimestampMs: 1700000000000,
    };
    const html = renderToStaticMarkup(
      <VisualContextPanel
        {...makeProps({
          frameTelemetryStats: deriveFrameTelemetryStats(withTelemetry),
          sampleRateStats: deriveSampleRateStats(withTelemetry),
        })}
      />,
    );
    expect(html).toContain("visualContext.frameTelemetry");
    expect(html).toContain("visualContext.frameAvgMs");
    expect(html).toContain("visualContext.frameMaxMs");
    // tickCount > 0 → 采样 FPS 展示
    expect(html).toContain("visualContext.sampleRateFps");
  });

  it("有场景记忆时渲染记忆条数与节省 token", () => {
    const html = renderToStaticMarkup(
      <VisualContextPanel
        {...makeProps({ sceneMemoryCount: 3, sceneMemorySavingsTokens: 1500 })}
      />,
    );
    expect(html).toContain("visualContext.sceneMemory");
    expect(html).toContain("visualContext.sceneMemorySavings");
  });

  it("有融合统计时渲染融合次数与节省往返/图像 token", () => {
    const html = renderToStaticMarkup(
      <VisualContextPanel
        {...makeProps({ fusionCount: 2, fusionSavedCalls: 1, fusionImageTokens: 800 })}
      />,
    );
    expect(html).toContain("visualContext.fusion");
    expect(html).toContain("visualContext.fusionSavedCalls");
    expect(html).toContain("visualContext.fusionImageTokens");
  });

  it("有文本历史摘要统计时渲染压缩条数与节省 token", () => {
    const html = renderToStaticMarkup(
      <VisualContextPanel
        {...makeProps({ textHistorySummarizedCount: 5, textHistorySavedTokens: 640 })}
      />,
    );
    expect(html).toContain("visualContext.textHistory");
    expect(html).toContain("visualContext.textHistorySavings");
  });

  it("无文本历史摘要时不渲染摘要区", () => {
    const html = renderToStaticMarkup(<VisualContextPanel {...makeProps()} />);
    expect(html).not.toContain("visualContext.textHistory");
  });

  it("渲染安全提示条", () => {
    const html = renderToStaticMarkup(<VisualContextPanel {...makeProps()} />);
    expect(html).toContain('data-security-strip');
    expect(html).toContain("visualContext.securityHint");
  });

  it("无优化节省时不渲染汇总条", () => {
    const html = renderToStaticMarkup(<VisualContextPanel {...makeProps()} />);
    expect(html).not.toContain('data-optimization-summary');
  });

  it("多种机制节省时渲染统一汇总条（token + USD）", () => {
    const html = renderToStaticMarkup(
      <VisualContextPanel
        {...makeProps({
          skippedAutoFrameCount: 2,
          sampleWidth: 640,
          sampleHeight: 360,
          sceneMemoryCount: 2,
          sceneMemorySavingsTokens: 340,
          textHistorySummarizedCount: 3,
          textHistorySavedTokens: 900,
          fusionCount: 1,
          fusionSavedCalls: 1,
          fusionImageTokens: 425,
        })}
      />,
    );
    expect(html).toContain('data-optimization-summary');
    expect(html).toContain('aria-label="visualContext.optimizationSummary"');
    expect(html).toContain("visualContext.optimizationTotal");
    expect(html).toContain("visualContext.optimization.frame-diff");
    expect(html).toContain("visualContext.optimization.scene-memory");
    expect(html).toContain("visualContext.optimization.text-history");
    expect(html).toContain("visualContext.optimization.fusion");
  });
});
