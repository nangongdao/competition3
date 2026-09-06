import { memo } from "react";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SpatialAnnotation } from "@/modules/assistant/lib/spatial-annotation";

type AnnotationOverlayProps = {
  /** 要叠加渲染的空间标注。 */
  annotations: readonly SpatialAnnotation[];
  /** 标注层的可访问标签。 */
  label: string;
};

/**
 * 摄像头预览上的空间定位标注叠加层。
 *
 * 用归一化坐标（0~1）直接以百分比定位绘制标注框与标签，无需测量容器尺寸。
 * 叠加层 `pointer-events-none`，不阻塞下方 `<video>` 与 HUD 的交互。
 *
 * 纯展示组件：不包含解析/请求逻辑，数据由上层传入。
 */
export const AnnotationOverlay = memo(function AnnotationOverlay({
  annotations,
  label,
}: AnnotationOverlayProps): React.JSX.Element | null {
  const { t } = useTranslation();

  if (annotations.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      aria-label={label}
    >
      {annotations.map((annotation, index) => {
        const box = annotation.box;

        return (
          <div
            key={`${annotation.label}-${index}`}
            className="absolute rounded-sm border-[2px] border-[rgba(103,217,215,0.95)] shadow-[0_0_8px_rgba(103,217,215,0.45)]"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
          >
            <span className="absolute -top-6 left-0 inline-flex max-w-[160px] items-center gap-1 truncate rounded-md bg-[rgba(10,10,12,0.85)] px-1.5 py-0.5 text-xs font-[600] text-[color:var(--color-accent)] backdrop-blur-md">
              <MapPin size={11} aria-hidden="true" />
              <span className="truncate">{annotation.label}</span>
            </span>
            <span className="sr-only">{t("spatialAnnotation.item", { label: annotation.label })}</span>
          </div>
        );
      })}
    </div>
  );
});
