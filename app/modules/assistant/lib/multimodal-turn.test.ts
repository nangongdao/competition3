import { describe, expect, it } from "vitest";

import {
  buildMultimodalTurn,
  compareFusionStrategies,
  DEFAULT_FUSION_WINDOW_MS,
  estimateFusedFrameTokens,
  toMultimodalFrame,
  type MultimodalFrame,
} from "./multimodal-turn";

const T0 = 1_000_000;

function frame(capturedAt: number): MultimodalFrame {
  return toMultimodalFrame("data:image/jpeg;base64,abc", capturedAt, 640, 360);
}

describe("buildMultimodalTurn", () => {
  it("fuses voice + concurrent frame into a single multimodal request", () => {
    const turn = buildMultimodalTurn("这是桌面", {
      frame: frame(T0 - 100),
      utteranceEndAt: T0,
    });

    expect(turn.fused).toBe(true);
    expect(turn.strategy).toBe("fused-multimodal");
    expect(turn.message).toBe("这是桌面");
    expect(turn.imageDataUrl).toBe("data:image/jpeg;base64,abc");
  });

  it("includes scene context in the fused turn when provided", () => {
    const turn = buildMultimodalTurn("这是什么", {
      frame: frame(T0 - 50),
      sceneContext: "此前画面（文字摘要）：\n- 桌上有咖啡",
      utteranceEndAt: T0,
    });

    expect(turn.strategy).toBe("fused-multimodal");
    expect(turn.sceneContext).toContain("桌上有咖啡");
  });

  it("does not fuse when the frame predates the utterance beyond the window", () => {
    const turn = buildMultimodalTurn("旧问题", {
      frame: frame(T0 - DEFAULT_FUSION_WINDOW_MS - 1000),
      utteranceEndAt: T0,
    });

    expect(turn.fused).toBe(false);
    expect(turn.strategy).toBe("text-only");
    expect(turn.imageDataUrl).toBeUndefined();
  });

  it("fuses when no utteranceEndAt is given but a frame exists", () => {
    const turn = buildMultimodalTurn("说话", { frame: frame(T0) });

    expect(turn.strategy).toBe("fused-multimodal");
    expect(turn.fused).toBe(true);
  });

  it("returns text-only when there is voice but no frame", () => {
    const turn = buildMultimodalTurn("只有语音", {});

    expect(turn.fused).toBe(false);
    expect(turn.strategy).toBe("text-only");
    expect(turn.imageDataUrl).toBeUndefined();
  });

  it("returns image-only when there is a frame but no voice", () => {
    const turn = buildMultimodalTurn("  ", { frame: frame(T0) });

    expect(turn.strategy).toBe("image-only");
    expect(turn.imageDataUrl).toBe("data:image/jpeg;base64,abc");
  });

  it("returns empty when there is neither voice nor frame", () => {
    const turn = buildMultimodalTurn("", {});

    expect(turn.strategy).toBe("empty");
    expect(turn.fused).toBe(false);
  });

  it("uses the default fusion window when a non-positive value is given", () => {
    const turn = buildMultimodalTurn("说话", {
      frame: frame(T0 - 1000),
      utteranceEndAt: T0,
      fusionWindowMs: 0,
    });

    expect(turn.strategy).toBe("fused-multimodal");
  });
});

describe("estimateFusedFrameTokens", () => {
  it("returns 0 when dimensions are missing", () => {
    expect(
      estimateFusedFrameTokens({ dataUrl: "x", capturedAt: T0 }),
    ).toBe(0);
  });

  it("reuses the cost-model image token estimate", () => {
    expect(estimateFusedFrameTokens(frame(T0))).toBeGreaterThan(0);
  });
});

describe("compareFusionStrategies", () => {
  it("reports one saved call roundtrip for a fused multimodal turn", () => {
    const turn = buildMultimodalTurn("说话", {
      frame: frame(T0),
    });
    const comparison = compareFusionStrategies(turn, frame(T0));

    expect(comparison.fusedCallCount).toBe(1);
    expect(comparison.separateCallCount).toBe(2);
    expect(comparison.savedCallCount).toBe(1);
    expect(comparison.note).toContain("省 1 次");
  });

  it("reports zero saved roundtrips for a non-fused text-only turn", () => {
    const turn = buildMultimodalTurn("只有语音", {});
    const comparison = compareFusionStrategies(turn);

    expect(comparison.fusedCallCount).toBe(1);
    expect(comparison.separateCallCount).toBe(1);
    expect(comparison.savedCallCount).toBe(0);
  });

  it("estimates image tokens for a fused turn with dimensions", () => {
    const turn = buildMultimodalTurn("说话", { frame: frame(T0) });
    const comparison = compareFusionStrategies(turn, frame(T0));

    expect(comparison.fusedImageTokens).toBeGreaterThan(0);
  });
});

describe("toMultimodalFrame", () => {
  it("omits zero or missing dimensions", () => {
    const result = toMultimodalFrame("x", T0, 0, undefined);
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
  });
});
