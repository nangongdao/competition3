import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：子组件（CameraPreview / transcript-list 等）依赖 useTranslation 与 i18n 实例。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { VisionColumn, type VisionColumnProps } from "./vision-column";
import {
  deriveFrameTelemetryStats,
  deriveSampleRateStats,
  EMPTY_FRAME_TELEMETRY,
} from "@/modules/assistant/lib/frame-telemetry";

function makeProps(overrides: Partial<VisionColumnProps> = {}): VisionColumnProps {
  return {
    videoRef: createRef<HTMLVideoElement | null>(),
    audioRef: createRef<HTMLAudioElement | null>(),
    canvasRef: createRef<HTMLCanvasElement | null>(),
    hasMedia: true,
    isMicrophoneMuted: false,
    microphoneStatusLabel: "麦克风开启",
    phase: "ready",
    annotations: [],
    onPanelDragStart: vi.fn(),
    onPanelDrop: vi.fn(),
    transcript: [],
    retryableEntryIds: new Set(),
    isRetryDisabled: false,
    onRetry: vi.fn(),
    isClearConfirmationVisible: false,
    onRequestClear: vi.fn(),
    onCancelClear: vi.fn(),
    onConfirmClear: vi.fn(),
    onExport: vi.fn(),
    textDraft: "",
    canSendTextMessage: true,
    isChatMode: true,
    hasRealtimeConnection: false,
    isSending: false,
    onTextDraftChange: vi.fn(),
    onTextMessageSubmit: vi.fn(),
    lastFrameDataUrl: null,
    sampledFrameCount: 0,
    sentFrameCount: 0,
    skippedAutoFrameCount: 0,
    prunedFrameCount: 0,
    isAutoSampling: false,
    samplingIntervalSeconds: 8,
    visualContextVisible: true,
    sceneMemoryCount: 0,
    sceneMemorySavingsTokens: 0,
    fusionCount: 0,
    fusionSavedCalls: 0,
    fusionImageTokens: 0,
    textHistorySummarizedCount: 0,
    textHistorySavedTokens: 0,
    frameTelemetryStats: deriveFrameTelemetryStats(EMPTY_FRAME_TELEMETRY),
    sampleRateStats: deriveSampleRateStats(EMPTY_FRAME_TELEMETRY),
    sampleWidth: 640,
    sampleHeight: 360,
    ...overrides,
  };
}

describe("VisionColumn", () => {
  it("renders the vision column region with drag handle", () => {
    const html = renderToStaticMarkup(<VisionColumn {...makeProps()} />);
    expect(html).toContain("vision-column");
    expect(html).toContain("拖动画面区");
  });

  it("wires the vision drop handler", () => {
    const html = renderToStaticMarkup(<VisionColumn {...makeProps()} />);
    expect(html).toContain('class="vision-column');
  });

  it("renders clear-confirmation group when clear is pending", () => {
    const html = renderToStaticMarkup(
      <VisionColumn
        {...makeProps({
          isClearConfirmationVisible: true,
          onConfirmClear: () => undefined,
          onCancelClear: () => undefined,
        })}
      />,
    );
    expect(html).toContain("conversation.confirmClearLabel");
    expect(html).toContain("conversation.confirmClear");
  });

  it("reflects the text-message composer wiring", () => {
    const html = renderToStaticMarkup(
      <VisionColumn
        {...makeProps({
          textDraft: "hello",
          canSendTextMessage: true,
        })}
      />,
    );
    expect(html).toContain('aria-label="conversation.messageInput"');
    expect(html).toContain('aria-label="conversation.sendButton"');
    expect(html).toContain("conversation.send");
  });

  it("renders scene-memory / fusion / text-history cost-savings stats in the visual context panel", () => {
    const html = renderToStaticMarkup(
      <VisionColumn
        {...makeProps({
          sceneMemoryCount: 2,
          sceneMemorySavingsTokens: 340,
          fusionCount: 3,
          fusionSavedCalls: 2,
          fusionImageTokens: 480,
          textHistorySummarizedCount: 4,
          textHistorySavedTokens: 900,
        })}
      />,
    );
    // 成本节省三区均渲染（aria-label 为 i18n key 由 mock 原样返回）。
    expect(html).toContain('aria-label="visualContext.sceneMemory"');
    expect(html).toContain('aria-label="visualContext.fusion"');
    expect(html).toContain('aria-label="visualContext.textHistory"');
  });

  it("renders the consolidated optimization-savings summary when multiple mechanisms are active", () => {
    const html = renderToStaticMarkup(
      <VisionColumn
        {...makeProps({
          skippedAutoFrameCount: 4,
          sampleWidth: 640,
          sampleHeight: 360,
          sceneMemorySavingsTokens: 340,
          textHistorySavedTokens: 1200,
          fusionImageTokens: 480,
        })}
      />,
    );
    expect(html).toContain('data-optimization-summary');
    expect(html).toContain('aria-label="visualContext.optimizationSummary"');
    expect(html).toContain('visualContext.optimizationTotal');
    // 四种机制均计入汇总。
    expect(html).toContain('visualContext.optimization.frame-diff');
    expect(html).toContain('visualContext.optimization.scene-memory');
    expect(html).toContain('visualContext.optimization.text-history');
    expect(html).toContain('visualContext.optimization.fusion');
  });

  it("does not render the optimization-savings summary when no mechanism is active", () => {
    const html = renderToStaticMarkup(<VisionColumn {...makeProps()} />);
    expect(html).not.toContain('data-optimization-summary');
  });
});
