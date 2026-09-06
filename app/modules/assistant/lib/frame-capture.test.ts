import { describe, expect, it, vi } from "vitest";

import {
  buildCapturedFrame,
  computeFrameScale,
  resolveFrameCaptureNotice,
} from "./frame-capture";
import { createFrameSignatureFromImageData } from "./frame-diff";

// 将 createFrameSignatureFromImageData 包装为可 mock 函数：
// 默认委托真实实现，仅在需要验证防御性回退时通过 mockImplementation 抛错。
vi.mock("./frame-diff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./frame-diff")>();
  return {
    ...actual,
    createFrameSignatureFromImageData: vi.fn(
      actual.createFrameSignatureFromImageData,
    ),
  };
});

function buildImageData(
  width: number,
  height: number,
  red = 120,
  green = 90,
  blue = 60,
): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4;
    data[dataIndex] = red;
    data[dataIndex + 1] = green;
    data[dataIndex + 2] = blue;
    data[dataIndex + 3] = 255;
  }

  return { width, height, data };
}

describe("computeFrameScale", () => {
  it("视频宽度超过 maxWidth 时等比缩小", () => {
    expect(computeFrameScale(1280, 720, 640)).toEqual({
      width: 640,
      height: 360,
    });
  });

  it("视频宽度小于 maxWidth 时保持原始尺寸", () => {
    expect(computeFrameScale(320, 240, 640)).toEqual({
      width: 320,
      height: 240,
    });
  });

  it("视频宽度等于 maxWidth 时保持原始尺寸", () => {
    expect(computeFrameScale(640, 480, 640)).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("非 16:9 比例按宽度等比缩放高度", () => {
    expect(computeFrameScale(1000, 500, 640)).toEqual({
      width: 640,
      height: 320,
    });
  });
});

describe("buildCapturedFrame", () => {
  it("成功构建帧（含帧签名）", () => {
    const imageData = buildImageData(2, 1);
    const captured = buildCapturedFrame("data:image/jpeg;base64,x", imageData);

    expect(captured).not.toBeNull();
    expect(captured?.frameDataUrl).toBe("data:image/jpeg;base64,x");
    expect(captured?.signature).toEqual(
      createFrameSignatureFromImageData(imageData),
    );
  });

  it("签名解析抛错时返回 null", () => {
    const imageData = buildImageData(2, 1);
    vi.mocked(createFrameSignatureFromImageData).mockImplementationOnce(() => {
      throw new Error("signature failed");
    });

    const captured = buildCapturedFrame("data:image/jpeg;base64,x", imageData);

    expect(captured).toBeNull();
  });
});

describe("resolveFrameCaptureNotice", () => {
  it("auto 采样在所有阶段都不展示提示", () => {
    expect(resolveFrameCaptureNotice("auto", "no-media")).toBeNull();
    expect(resolveFrameCaptureNotice("auto", "no-context")).toBeNull();
    expect(resolveFrameCaptureNotice("auto", "analyze-failed")).toBeNull();
    expect(resolveFrameCaptureNotice("auto", "success")).toBeNull();
  });

  it("manual 采样各阶段返回对应提示", () => {
    expect(resolveFrameCaptureNotice("manual", "no-media")).toBe(
      "请先授权摄像头后再采样画面。",
    );
    expect(resolveFrameCaptureNotice("manual", "no-context")).toBe(
      "当前浏览器无法读取画面。",
    );
    expect(resolveFrameCaptureNotice("manual", "analyze-failed")).toBe(
      "无法分析当前画面，请重试。",
    );
    expect(resolveFrameCaptureNotice("manual", "success")).toBe(
      "已采样当前画面。",
    );
  });
});
