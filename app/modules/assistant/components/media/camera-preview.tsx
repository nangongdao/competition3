import { memo, type RefObject } from "react";
import { Camera, Mic, MicOff, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AssistantPhase } from "@/modules/assistant/types";
import type { SpatialAnnotation } from "@/modules/assistant/lib/spatial-annotation";
import { AnnotationOverlay } from "@/modules/assistant/components/media/annotation-overlay";

type CameraPreviewProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  hasMedia: boolean;
  isMicrophoneMuted: boolean;
  microphoneStatusLabel: string;
  phase: AssistantPhase;
  /** M4.3 空间定位标注：模型回复中解析出的归一化坐标标注，叠加在视频上。 */
  annotations?: readonly SpatialAnnotation[];
};

/**
 * 摄像头预览 + 远端音频 + 媒体状态 HUD。
 *
 * 仅负责渲染，不含任何采样/会话编排逻辑。
 */
export const CameraPreview = memo(function CameraPreview({
  videoRef,
  audioRef,
  hasMedia,
  isMicrophoneMuted,
  microphoneStatusLabel,
  phase,
  annotations = [],
}: CameraPreviewProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      className="relative aspect-video max-h-[min(42vh,520px)] min-h-0 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[radial-gradient(circle_at_50%_50%,rgba(94,106,210,0.16),transparent_34%),repeating-linear-gradient(90deg,rgba(255,255,255,0.05)_0,rgba(255,255,255,0.05)_1px,transparent_1px,transparent_40px),#050506]"
    >
      <video
        ref={videoRef}
        className="block h-full min-h-0 w-full bg-transparent object-cover"
        autoPlay
        muted
        playsInline
        aria-label={t("camera.preview")}
      />
      <audio
        ref={audioRef}
        className="pointer-events-none absolute h-px w-px opacity-0"
        autoPlay
        aria-label={t("camera.audio")}
      />

      {/* M4.3 空间定位标注叠加层：不阻塞视频/HUD 交互。 */}
      <AnnotationOverlay
        annotations={annotations}
        label={t("spatialAnnotation.overlay")}
      />

      {!hasMedia ? (
        <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 p-6 text-center text-foreground">
          <Video size={34} aria-hidden="true" />
          <h2 className="m-0 text-[2.4rem] leading-none tracking-normal max-[480px]:text-[2rem]">
            {t("camera.waitingForInput")}
          </h2>
          <p className="m-0 max-w-[34ch] leading-relaxed text-muted">
            {t("camera.grantHint")}
          </p>
        </div>
      ) : null}

      <div
        className="absolute left-4 top-4 flex flex-wrap gap-2"
        aria-label={t("camera.mediaStatus")}
      >
        <span className="inline-flex min-h-[34px] items-center gap-2 rounded-lg border border-white/10 bg-[rgba(10,10,12,0.72)] px-2.5 text-sm font-[600] text-foreground backdrop-blur-md">
          <Camera size={15} aria-hidden="true" />
          {hasMedia ? t("camera.videoOn") : t("camera.videoOff")}
        </span>
        <span className="inline-flex min-h-[34px] items-center gap-2 rounded-lg border border-white/10 bg-[rgba(10,10,12,0.72)] px-2.5 text-sm font-[600] text-foreground backdrop-blur-md">
          {isMicrophoneMuted ? (
            <MicOff size={15} aria-hidden="true" />
          ) : (
            <Mic size={15} aria-hidden="true" />
          )}
          {microphoneStatusLabel}
        </span>
      </div>

      <div
        className="absolute bottom-[18px] right-[18px] inline-flex h-[46px] items-end gap-[5px] rounded-lg border border-white/10 bg-[rgba(10,10,12,0.72)] p-[9px]"
        aria-hidden="true"
        data-active={phase}
        data-audio-meter
      >
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
});
