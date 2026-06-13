import { describe, expect, it } from "vitest";

import {
  createFrameSignatureFromImageData,
  frameDifferenceRatio,
  FRAME_DIFF_SEND_THRESHOLD,
  shouldSendFrame,
  type FrameImageData,
  type FrameSignature,
} from "./frame-diff";

function buildSignature(
  luma: readonly number[],
  width = luma.length,
  height = 1,
): FrameSignature {
  return {
    width,
    height,
    luma,
  };
}

function buildSolidImageData(
  width: number,
  height: number,
  red: number,
  green: number,
  blue: number,
): FrameImageData {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4;
    data[dataIndex] = red;
    data[dataIndex + 1] = green;
    data[dataIndex + 2] = blue;
    data[dataIndex + 3] = 255;
  }

  return {
    width,
    height,
    data,
  };
}

describe("createFrameSignatureFromImageData", () => {
  it("downscales image data into a grayscale luma grid", () => {
    const imageData: FrameImageData = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        0, 0, 0, 255,
        255, 255, 255, 255,
      ]),
    };

    const signature = createFrameSignatureFromImageData(imageData, {
      width: 1,
      height: 1,
    });

    expect(signature.width).toBe(1);
    expect(signature.height).toBe(1);
    expect(signature.luma[0]).toBeCloseTo(0.5, 6);
  });

  it("uses the requested grid size and keeps luma values normalized", () => {
    const imageData = buildSolidImageData(4, 2, 255, 0, 0);

    const signature = createFrameSignatureFromImageData(imageData, {
      width: 2,
      height: 2,
    });

    expect(signature.luma).toHaveLength(4);
    expect(signature.luma.every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});

describe("frameDifferenceRatio", () => {
  it("returns zero for identical frame signatures", () => {
    const previous = buildSignature([0.1, 0.4, 0.7]);
    const next = buildSignature([0.1, 0.4, 0.7]);

    expect(frameDifferenceRatio(previous, next)).toBe(0);
  });

  it("returns the normalized mean absolute luma delta", () => {
    const previous = buildSignature([0.1, 0.4, 0.7]);
    const next = buildSignature([0.2, 0.5, 0.9]);

    expect(frameDifferenceRatio(previous, next)).toBeCloseTo(
      (0.1 + 0.1 + 0.2) / 3,
      6,
    );
  });

  it("treats incompatible signatures as a full scene change", () => {
    const previous = buildSignature([0.1, 0.2], 2, 1);
    const next = buildSignature([0.1, 0.2], 1, 2);

    expect(frameDifferenceRatio(previous, next)).toBe(1);
  });
});

describe("shouldSendFrame", () => {
  it("sends when there is no previous uploaded signature", () => {
    expect(shouldSendFrame(null, buildSignature([0.5]))).toBe(true);
  });

  it("skips synthetic noise below the configured threshold", () => {
    const previous = buildSignature([0.5, 0.5, 0.5]);
    const next = buildSignature([0.52, 0.49, 0.51]);

    expect(shouldSendFrame(previous, next, FRAME_DIFF_SEND_THRESHOLD)).toBe(false);
  });

  it("sends a synthetic scene change above the configured threshold", () => {
    const previous = buildSignature([0.2, 0.2, 0.2]);
    const next = buildSignature([0.8, 0.7, 0.9]);

    expect(shouldSendFrame(previous, next, FRAME_DIFF_SEND_THRESHOLD)).toBe(true);
  });
});
