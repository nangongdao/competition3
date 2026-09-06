type AudioContextConstructor = typeof AudioContext;

type BrowserAudioContextScope = Window & {
  webkitAudioContext?: AudioContextConstructor;
};

/**
 * 返回当前浏览器可用的 AudioContext 构造函数。
 *
 * 优先使用标准 `AudioContext`，缺失时回退到带 `webkit` 前缀的实现，
 * 非浏览器环境（如单元测试）返回 null。
 */
export function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const scope = window as BrowserAudioContextScope;

  if (typeof AudioContext !== "undefined") {
    return AudioContext;
  }

  return scope.webkitAudioContext ?? null;
}

/**
 * 计算一组时域采样（0-255，中心 128）的均方根（RMS）。
 *
 * 用于连续对话 VAD 的响度判定。空数组返回 0，避免除零。
 */
export function calculateAudioRootMeanSquare(samples: Uint8Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let squaredTotal = 0;

  for (const sample of samples) {
    const normalizedSample = (sample - 128) / 128;
    squaredTotal += normalizedSample * normalizedSample;
  }

  return Math.sqrt(squaredTotal / samples.length);
}
