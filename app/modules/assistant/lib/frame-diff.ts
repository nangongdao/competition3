export const FRAME_DIFF_GRID_WIDTH = 32;
export const FRAME_DIFF_GRID_HEIGHT = 18;
export const FRAME_DIFF_SEND_THRESHOLD = 0.04;

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

export function shouldSendFrame(
  previous: FrameSignature | null,
  next: FrameSignature,
  threshold = FRAME_DIFF_SEND_THRESHOLD,
): boolean {
  if (previous === null) {
    return true;
  }

  const normalizedThreshold = normalizeLuma(threshold);

  return frameDifferenceRatio(previous, next) >= normalizedThreshold;
}
