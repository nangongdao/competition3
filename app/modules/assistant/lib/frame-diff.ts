export const FRAME_DIFF_GRID_WIDTH = 48;
export const FRAME_DIFF_GRID_HEIGHT = 27;
export const FRAME_DIFF_SEND_THRESHOLD = 0.04;
/** 局部变化判定：单格补偿后差异超过该值即视为显著局部变化。 */
export const FRAME_DIFF_LOCAL_THRESHOLD = 0.22;
/** 触发上传所需的显著变化格子数下限。 */
export const FRAME_DIFF_MIN_CHANGED_CELLS = 3;
/** 全局亮度偏移容忍度：低于该值的均匀偏移视为光照变化，不触发。 */
export const FRAME_DIFF_ILLUMINATION_TOLERANCE = 0.06;

/** 亮光环境下可接受的全局亮度偏移上限（归一化亮度 ≥0.5）。 */
export const FRAME_DIFF_HIGH_LIGHT_TOLERANCE = 0.12;
/** 暗光环境下可接受的全局亮度偏移上限（归一化亮度 <0.3）。 */
export const FRAME_DIFF_LOW_LIGHT_TOLERANCE = 0.2;
/** 判定为"暗光"的归一化亮度阈值（低于该值采用高光照容忍）。 */
export const FRAME_DIFF_LOW_LIGHT_LUMA = 0.3;
/** 判定为"亮光"的归一化亮度阈值（高于该值采用常规光照容忍）。 */
export const FRAME_DIFF_HIGH_LIGHT_LUMA = 0.5;

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
 * 计算一帧签名的平均亮度。
 *
 * 用于光照自适应：暗光下传感器增益高、亮度抖动明显，需要更高的光照容忍；
 * 亮光下量化更精细，可收紧容忍以捕捉真实变化。空签名返回 0。
 *
 * @param signature 帧签名
 * @returns 归一化平均亮度 [0, 1]
 */
export function meanLuma(signature: FrameSignature): number {
  if (signature.luma.length === 0) {
    return 0;
  }

  const sum = signature.luma.reduce((acc, value) => acc + normalizeLuma(value), 0);
  return sum / signature.luma.length;
}

/**
 * 根据画面平均亮度解析自适应的光照容忍度。
 *
 * 思路：暗光环境（平均亮度低）传感器增益被放大，像素亮度抖动更剧烈，
 * 同一大小的全局亮度偏移更可能是光照/噪声而非内容变化，因此提高容忍度；
 * 亮光环境量化更精细，用更小的容忍度以捕捉真实场景变化。
 *
 * 在暗光与亮光阈值之间线性插值，避免跳变。
 *
 * @param frameLuma 当前帧平均亮度 [0, 1]
 * @returns 该亮度下可接受的全局亮度偏移上限
 */
export function resolveIlluminationTolerance(frameLuma: number): number {
  const normalizedLuma = normalizeLuma(frameLuma);

  if (normalizedLuma < FRAME_DIFF_LOW_LIGHT_LUMA) {
    return FRAME_DIFF_LOW_LIGHT_TOLERANCE;
  }

  if (normalizedLuma >= FRAME_DIFF_HIGH_LIGHT_LUMA) {
    return FRAME_DIFF_HIGH_LIGHT_TOLERANCE;
  }

  const t = (normalizedLuma - FRAME_DIFF_LOW_LIGHT_LUMA) /
    (FRAME_DIFF_HIGH_LIGHT_LUMA - FRAME_DIFF_LOW_LIGHT_LUMA);
  return FRAME_DIFF_LOW_LIGHT_TOLERANCE +
    (FRAME_DIFF_HIGH_LIGHT_TOLERANCE - FRAME_DIFF_LOW_LIGHT_TOLERANCE) * t;
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

  // 补偿前超阈值但补偿后不超 → 可能为光照变化
  const rawGlobalDiff =
    diffs.reduce((sum, value) => sum + Math.abs(value), 0) / diffs.length;

  if (rawGlobalDiff > FRAME_DIFF_SEND_THRESHOLD) {
    // 光照自适应：raw 偏移超过当前亮度下的容忍上限时，不能用"纯光照"解释，
    // 应视为真实场景切换（避免强光/剧烈抖动被误判为光照而漏检）。
    const tolerance = resolveIlluminationTolerance(meanLuma(current));

    if (rawGlobalDiff > tolerance) {
      return {
        shouldSend: true,
        globalDiff,
        changedCells,
        reason: "global-change",
      };
    }

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
