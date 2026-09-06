import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SpatialAnnotation } from "@/modules/assistant/lib/spatial-annotation";

// 隔离 i18n：用固定实现替换 useTranslation，避免 node 环境下的 i18n 初始化依赖。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => {
    if (key === "spatialAnnotation.item") {
      return `标注：${String(opts?.label ?? "")}`;
    }
    return key;
  } }),
}));

import { AnnotationOverlay } from "./annotation-overlay";

describe("AnnotationOverlay", () => {
  it("标注为空时返回 null", () => {
    const html = renderToStaticMarkup(
      <AnnotationOverlay annotations={[]} label="标注层" />,
    );
    expect(html).toBe("");
  });

  it("渲染标注框与标签", () => {
    const annotations: readonly SpatialAnnotation[] = [
      { label: "茶杯", box: { x: 0.2, y: 0.3, w: 0.4, h: 0.5 } },
      { label: "书", box: { x: 0.6, y: 0.1, w: 0.2, h: 0.3 } },
    ];

    const html = renderToStaticMarkup(
      <AnnotationOverlay annotations={annotations} label="标注层" />,
    );

    expect(html).toContain("pointer-events-none");
    expect(html).toContain("标注：茶杯");
    expect(html).toContain("标注：书");
  });

  it("使用归一化百分比定位", () => {
    const annotations: readonly SpatialAnnotation[] = [
      { label: "杯子", box: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 } },
    ];

    const html = renderToStaticMarkup(
      <AnnotationOverlay annotations={annotations} label="标注层" />,
    );

    expect(html).toContain("left:25%");
    expect(html).toContain("top:50%");
    expect(html).toContain("width:50%");
    expect(html).toContain("height:25%");
  });

  it("设置可访问标签与 aria-hidden 不阻塞交互", () => {
    const annotations: readonly SpatialAnnotation[] = [
      { label: "x", box: { x: 0, y: 0, w: 0.5, h: 0.5 } },
    ];

    const html = renderToStaticMarkup(
      <AnnotationOverlay annotations={annotations} label="标注层" />,
    );

    expect(html).toContain('aria-label="标注层"');
    expect(html).toContain("overflow-hidden");
  });
});
