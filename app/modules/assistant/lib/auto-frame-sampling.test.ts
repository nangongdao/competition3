import { describe, expect, it } from "vitest";

import { FRAME_DIFF_SEND_THRESHOLD, type FrameSignature } from "./frame-diff";
import {
  AUTO_FRAME_CONTEXT_PROMPT,
  resolveAutoFrameTurn,
} from "./auto-frame-sampling";

function buildSignature(luma: readonly number[]): FrameSignature {
  return { width: luma.length, height: 1, luma };
}

describe("resolveAutoFrameTurn", () => {
  it("returns no-frame when the capture produced no frame", () => {
    expect(
      resolveAutoFrameTurn({
        capturedFrame: null,
        lastUploadedSignature: null,
      }),
    ).toEqual({ action: "no-frame" });
  });

  it("returns send when there is no previous baseline", () => {
    const signature = buildSignature([0, 0, 0, 0]);
    expect(
      resolveAutoFrameTurn({
        capturedFrame: { frameDataUrl: "data:image/jpeg;base64,abc", signature },
        lastUploadedSignature: null,
      }),
    ).toEqual({ action: "send", frameDataUrl: "data:image/jpeg;base64,abc" });
  });

  it("returns send when the frame differs above the send threshold", () => {
    const baseline = buildSignature([0, 0, 0, 0]);
    // 明显不同的画面：所有单元亮度拉满。
    const changed = buildSignature([
      255, 255, 255, 255, 255, 255, 255, 255,
    ]);
    expect(
      resolveAutoFrameTurn({
        capturedFrame: { frameDataUrl: "data:image/jpeg;base64,def", signature: changed },
        lastUploadedSignature: baseline,
      }),
    ).toEqual({ action: "send", frameDataUrl: "data:image/jpeg;base64,def" });
  });

  it("returns skip when the frame differs below the send threshold", () => {
    // 32 个单元、仅一个单元有 +1 亮度：globalDiff=1/32≈0.031 < 0.04，
    // 且变化单元数不足局部阈值 → 应跳过（避免噪声帧反复上传）。
    const baseline = buildSignature(new Array(32).fill(0));
    const nearlySame = buildSignature(
      new Array(32).fill(0).map((_, index) => (index === 31 ? 1 : 0)),
    );
    expect(
      resolveAutoFrameTurn({
        capturedFrame: { frameDataUrl: "data:image/jpeg;base64,ghi", signature: nearlySame },
        lastUploadedSignature: baseline,
      }),
    ).toEqual({ action: "skip" });
  });

  it("exposes a stable auto-frame context prompt", () => {
    expect(typeof AUTO_FRAME_CONTEXT_PROMPT).toBe("string");
    expect(AUTO_FRAME_CONTEXT_PROMPT.length).toBeGreaterThan(0);
  });

  it("uses the project-wide frame difference send threshold", () => {
    expect(FRAME_DIFF_SEND_THRESHOLD).toBeGreaterThan(0);
    expect(FRAME_DIFF_SEND_THRESHOLD).toBeLessThan(1);
  });
});
