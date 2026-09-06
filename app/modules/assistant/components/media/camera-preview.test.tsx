import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AssistantPhase } from "@/modules/assistant/types";

// 隔离 i18n：用固定实现替换 useTranslation，避免 node 环境下的 i18n 初始化依赖。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { CameraPreview } from "./camera-preview";

describe("CameraPreview", () => {
  const baseProps = {
    videoRef: createRef<HTMLVideoElement | null>(),
    audioRef: createRef<HTMLAudioElement | null>(),
    hasMedia: true,
    isMicrophoneMuted: false,
    microphoneStatusLabel: "麦克风开启",
    phase: "ready" as AssistantPhase,
  };

  it("无媒体时展示等待输入提示", () => {
    const html = renderToStaticMarkup(
      <CameraPreview {...baseProps} hasMedia={false} />,
    );
    expect(html).toContain("camera.waitingForInput");
    expect(html).toContain("camera.videoOff");
  });

  it("有媒体时展示视频开启状态", () => {
    const html = renderToStaticMarkup(<CameraPreview {...baseProps} />);
    expect(html).toContain("camera.videoOn");
    expect(html).not.toContain("camera.videoOff");
  });

  it("渲染视频与音频元素", () => {
    const html = renderToStaticMarkup(<CameraPreview {...baseProps} />);
    expect(html).toContain("<video");
    expect(html).toContain("<audio");
    expect(html).toContain('aria-label="camera.preview"');
    expect(html).toContain('aria-label="camera.audio"');
  });

  it("静音状态渲染静音图标提示", () => {
    const html = renderToStaticMarkup(
      <CameraPreview {...baseProps} isMicrophoneMuted={true} />,
    );
    expect(html).toContain("camera.mediaStatus");
    expect(html).toContain("lucide-mic-off");
  });

  it("叠加空间标注层（非空标注时渲染）", () => {
    const html = renderToStaticMarkup(
      <CameraPreview
        {...baseProps}
        annotations={[
          { label: "茶杯", box: { x: 0.2, y: 0.3, w: 0.4, h: 0.5 } },
        ]}
      />,
    );
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("茶杯");
  });

  it("空标注时不渲染叠加层", () => {
    const html = renderToStaticMarkup(
      <CameraPreview {...baseProps} annotations={[]} />,
    );
    // 叠加层根节点带 aria-label（标注层标签），空标注时不应出现。
    expect(html).not.toContain('aria-label="spatialAnnotation.overlay"');
  });
});
