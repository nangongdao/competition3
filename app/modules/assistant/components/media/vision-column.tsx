import { memo } from "react";
import { GripVertical } from "lucide-react";

import { CameraPreview } from "@/modules/assistant/components/media/camera-preview";
import { VisualContextPanel } from "@/modules/assistant/components/media/visual-context-panel";
import { ConversationBoard } from "@/modules/assistant/components/conversation/conversation-board";
import type {
  AssistantPhase,
  TranscriptEntry,
} from "@/modules/assistant/types";
import type { SpatialAnnotation } from "@/modules/assistant/lib/spatial-annotation";
import type { WorkspacePanelId } from "@/modules/assistant/lib/workspace-layout";
import type { FrameTelemetryStats, SampleRateStats } from "@/modules/assistant/lib/frame-telemetry";

export type VisionColumnProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  hasMedia: boolean;
  isMicrophoneMuted: boolean;
  microphoneStatusLabel: string;
  phase: AssistantPhase;
  annotations: readonly SpatialAnnotation[];
  /** 面板拖拽开始（vision 列）。 */
  onPanelDragStart: (
    event: React.DragEvent<HTMLElement>,
    panel: WorkspacePanelId,
  ) => void;
  /** 面板拖拽落点（vision 列）。 */
  onPanelDrop: (
    event: React.DragEvent<HTMLElement>,
    panel: WorkspacePanelId,
  ) => void;
  transcript: readonly TranscriptEntry[];
  retryableEntryIds: ReadonlySet<string>;
  isRetryDisabled: boolean;
  onRetry: (entryId: string) => void;
  isClearConfirmationVisible: boolean;
  onRequestClear: () => void;
  onCancelClear: () => void;
  onConfirmClear: () => void;
  onExport: (format: "json" | "md") => void;
  textDraft: string;
  canSendTextMessage: boolean;
  isChatMode: boolean;
  hasRealtimeConnection: boolean;
  isSending: boolean;
  onTextDraftChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTextMessageSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  lastFrameDataUrl: string | null;
  sampledFrameCount: number;
  sentFrameCount: number;
  skippedAutoFrameCount: number;
  prunedFrameCount: number;
  isAutoSampling: boolean;
  samplingIntervalSeconds: number;
  visualContextVisible: boolean;
  sceneMemoryCount: number;
  sceneMemorySavingsTokens: number;
  fusionCount: number;
  fusionSavedCalls: number;
  fusionImageTokens: number;
  textHistorySummarizedCount: number;
  textHistorySavedTokens: number;
  /** 帧采样性能遥测指标。 */
  frameTelemetryStats: FrameTelemetryStats;
  /** 帧采样节拍遥测指标（实际采样 FPS）。 */
  sampleRateStats: SampleRateStats;
  /** 采样帧宽度（像素）。 */
  sampleWidth: number;
  /** 采样帧高度（像素）。 */
  sampleHeight: number;
};

/**
 * 视觉列子组件。
 *
 * 收敛主组件 vision 列 JSX：拖拽句柄 + 摄像头预览 + 对话面板 + 视觉上下文面板
 * + 采样 canvas。将大幅降低 `assistant-workspace` 主组件 JSX 规模。
 */
export const VisionColumn = memo(function VisionColumn({
  videoRef,
  audioRef,
  canvasRef,
  hasMedia,
  isMicrophoneMuted,
  microphoneStatusLabel,
  phase,
  annotations,
  onPanelDragStart,
  onPanelDrop,
  transcript,
  retryableEntryIds,
  isRetryDisabled,
  onRetry,
  isClearConfirmationVisible,
  onRequestClear,
  onCancelClear,
  onConfirmClear,
  onExport,
  textDraft,
  canSendTextMessage,
  isChatMode,
  hasRealtimeConnection,
  isSending,
  onTextDraftChange,
  onTextMessageSubmit,
  lastFrameDataUrl,
  sampledFrameCount,
  sentFrameCount,
  skippedAutoFrameCount,
  prunedFrameCount,
  isAutoSampling,
  samplingIntervalSeconds,
  visualContextVisible,
  sceneMemoryCount,
  sceneMemorySavingsTokens,
  fusionCount,
  fusionSavedCalls,
  fusionImageTokens,
  textHistorySummarizedCount,
  textHistorySavedTokens,
  frameTelemetryStats,
  sampleRateStats,
  sampleWidth,
  sampleHeight,
}: VisionColumnProps): React.JSX.Element {
  return (
    <section
      className="vision-column workspace-region bg-[linear-gradient(135deg,rgba(94,106,210,0.16),transparent_35%),linear-gradient(315deg,rgba(139,150,247,0.1),transparent_38%),var(--color-background)] px-[clamp(18px,3vw,38px)] max-[480px]:px-3.5"
      aria-labelledby="vision-title"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onPanelDrop(event, "vision")}
    >
      <div
        className="inline-flex cursor-grab select-none items-center gap-[5px] self-start text-[0.72rem] font-[600] text-soft-fg [-moz-user-select:none] [-webkit-user-select:none] max-[768px]:hidden"
        draggable
        aria-hidden="true"
        onDragStart={(event) => onPanelDragStart(event, "vision")}
      >
        <GripVertical size={17} />
        拖动画面区
      </div>
      <CameraPreview
        videoRef={videoRef}
        audioRef={audioRef}
        hasMedia={hasMedia}
        isMicrophoneMuted={isMicrophoneMuted}
        microphoneStatusLabel={microphoneStatusLabel}
        phase={phase}
        annotations={annotations}
      />

      <ConversationBoard
        transcript={transcript}
        retryableEntryIds={retryableEntryIds}
        isRetryDisabled={isRetryDisabled}
        onRetry={onRetry}
        isClearConfirmationVisible={isClearConfirmationVisible}
        onRequestClear={onRequestClear}
        onCancelClear={onCancelClear}
        onConfirmClear={onConfirmClear}
        onExport={onExport}
        textDraft={textDraft}
        canSendTextMessage={canSendTextMessage}
        isChatMode={isChatMode}
        hasRealtimeConnection={hasRealtimeConnection}
        isSending={isSending}
        onTextDraftChange={onTextDraftChange}
        onTextMessageSubmit={onTextMessageSubmit}
      />

      <VisualContextPanel
        lastFrameDataUrl={lastFrameDataUrl}
        sampledFrameCount={sampledFrameCount}
        sentFrameCount={sentFrameCount}
        skippedAutoFrameCount={skippedAutoFrameCount}
        prunedFrameCount={prunedFrameCount}
        isAutoSampling={isAutoSampling}
        samplingIntervalSeconds={samplingIntervalSeconds}
        isVisible={visualContextVisible}
        sceneMemoryCount={sceneMemoryCount}
        sceneMemorySavingsTokens={sceneMemorySavingsTokens}
        fusionCount={fusionCount}
        fusionSavedCalls={fusionSavedCalls}
        fusionImageTokens={fusionImageTokens}
        textHistorySummarizedCount={textHistorySummarizedCount}
        textHistorySavedTokens={textHistorySavedTokens}
        frameTelemetryStats={frameTelemetryStats}
        sampleRateStats={sampleRateStats}
        sampleWidth={sampleWidth}
        sampleHeight={sampleHeight}
      />

      <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true" />
    </section>
  );
});
