export const FRAME_DIFF_GRID_WIDTH = 48;
export const FRAME_DIFF_GRID_HEIGHT = 27;
export const FRAME_DIFF_SEND_THRESHOLD = 0.04;
/** 局部变化判定：单格补偿后差异超过该值即视为显著局部变化。 */
export const FRAME_DIFF_LOCAL_THRESHOLD = 0.22;
/** 触发上传所需的显著变化格子数下限。 */
export const FRAME_DIFF_MIN_CHANGED_CELLS = 3;
/** 全局亮度偏移容忍度：低于该值的均匀偏移视为光照变化，不触发。 */
export const FRAME_DIFF_ILLUMINATION_TOLERANCE = 0.06;

export type FrameSignature = {
  width: number;
  height: number;
  luma: readonly number[];
};

export type FrameImageData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type FrameDiffReason =
  | "local-change"
  | "global-change"
  | "illumination-only"
  | "static";

export type FrameDiffResult = {
  /** 是否应发送该帧 */
  readonly shouldSend: boolean;
  /** 补偿后的全局平均差异 */
  readonly globalDiff: number;
  /** 显著变化的格子数 */
  readonly changedCells: number;
  /** 判定依据，用于 UI 展示与调试 */
  readonly reason: FrameDiffReason;
};

type FrameSignatureOptions = {
  width?: number;
  height?: number;
};

function normalizeGridSize(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeLuma(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function readPixelLuma(data: Uint8ClampedArray, pixelIndex: number): number {
  const red = data[pixelIndex] ?? 0;
  const green = data[pixelIndex + 1] ?? 0;
  const blue = data[pixelIndex + 2] ?? 0;

  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

export function createFrameSignatureFromImageData(
  imageData: FrameImageData,
  options: FrameSignatureOptions = {},
): FrameSignature {
  const gridWidth = normalizeGridSize(options.width, FRAME_DIFF_GRID_WIDTH);
  const gridHeight = normalizeGridSize(options.height, FRAME_DIFF_GRID_HEIGHT);
  const luma: number[] = [];

  if (imageData.width <= 0 || imageData.height <= 0) {
    return {
      width: gridWidth,
      height: gridHeight,
      luma,
    };
  }

  for (let gridY = 0; gridY < gridHeight; gridY += 1) {
    const sourceYStart = Math.floor((gridY * imageData.height) / gridHeight);
    const sourceYEnd = Math.min(
      imageData.height,
      Math.ceil(((gridY + 1) * imageData.height) / gridHeight),
    );

    for (let gridX = 0; gridX < gridWidth; gridX += 1) {
      const sourceXStart = Math.floor((gridX * imageData.width) / gridWidth);
      const sourceXEnd = Math.min(
        imageData.width,
        Math.ceil(((gridX + 1) * imageData.width) / gridWidth),
      );
      let sum = 0;
      let count = 0;

      for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
        for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
          const pixelIndex = (sourceY * imageData.width + sourceX) * 4;
          sum += readPixelLuma(imageData.data, pixelIndex);
          count += 1;
        }
      }

      luma.push(count === 0 ? 0 : sum / count);
    }
  }

  return {
    width: gridWidth,
    height: gridHeight,
    luma,
  };
}

export function frameDifferenceRatio(
  previous: FrameSignature,
  next: FrameSignature,
): number {
  if (
    previous.width !== next.width ||
    previous.height !== next.height ||
    previous.luma.length !== next.luma.length ||
    previous.luma.length === 0
  ) {
    return 1;
  }

  let deltaSum = 0;

  for (let index = 0; index < previous.luma.length; index += 1) {
    deltaSum += Math.abs(
      normalizeLuma(next.luma[index] ?? 0) -
        normalizeLuma(previous.luma[index] ?? 0),
    );
  }

  return deltaSum / previous.luma.length;
}

/**
 * 比较两帧签名，判断是否需要上传（三层判定）。
 *
 *   1. 先剔除全局亮度偏移（光照变化不代表内容变化）
 *   2. 局部显著变化 ≥ N 格 → 发送（捕捉小物体出现）
 *   3. 补偿后的全局差异超阈值 → 发送（捕捉场景切换）
 *
 * @param previous 上一帧签名
 * @param current 当前帧签名
 * @returns 判定结果与依据
 */
export function compareFrameSignatures(
  previous: FrameSignature,
  current: FrameSignature,
): FrameDiffResult {
  if (
    previous.width !== current.width ||
    previous.height !== current.height ||
    previous.luma.length !== current.luma.length
  ) {
    return {
      shouldSend: true,
      globalDiff: 1,
      changedCells: 0,
      reason: "global-change",
    };
  }

  if (current.luma.length === 0) {
    return {
      shouldSend: false,
      globalDiff: 0,
      changedCells: 0,
      reason: "static",
    };
  }

  const diffs = current.luma.map(
    (value, index) => value - (previous.luma[index] ?? 0),
  );

  // 1. 估计全局亮度偏移（中位数比均值更抗局部剧变干扰）
  const sorted = [...diffs].sort((a, b) => a - b);
  const illuminationShift = sorted[Math.floor(sorted.length / 2)] ?? 0;

  // 2. 补偿后的差异 = 剔除光照影响的真实内容变化
  const compensated = diffs.map((value) => Math.abs(value - illuminationShift));

  const changedCells = compensated.filter(
    (value) => value > FRAME_DIFF_LOCAL_THRESHOLD,
  ).length;

  const globalDiff =
    compensated.reduce((sum, value) => sum + value, 0) / compensated.length;

  // 3. 局部显著变化优先判定（解决小物体漏检）
  if (changedCells >= FRAME_DIFF_MIN_CHANGED_CELLS) {
    return {
      shouldSend: true,
      globalDiff,
      changedCells,
      reason: "local-change",
    };
  }

  if (globalDiff > FRAME_DIFF_SEND_THRESHOLD) {
    return {
      shouldSend: true,
      globalDiff,
      changedCells,
      reason: "global-change",
    };
  }

  // 补偿前超阈值但补偿后不超 → 纯光照变化，省掉这次上传
  const rawGlobalDiff =
    diffs.reduce((sum, value) => sum + Math.abs(value), 0) / diffs.length;

  if (rawGlobalDiff > FRAME_DIFF_SEND_THRESHOLD) {
    return {
      shouldSend: false,
      globalDiff,
      changedCells,
      reason: "illumination-only",
    };
  }

  return {
    shouldSend: false,
    globalDiff,
    changedCells,
    reason: "static",
  };
}

export function shouldSendFrame(
  previous: FrameSignature | null,
  next: FrameSignature,
  threshold = FRAME_DIFF_SEND_THRESHOLD,
): boolean {
  if (previous === null) {
    return true;
  }

  const result = compareFrameSignatures(previous, next);
  const normalizedThreshold = normalizeLuma(threshold);

  return result.shouldSend || result.globalDiff >= normalizedThreshold;
}
