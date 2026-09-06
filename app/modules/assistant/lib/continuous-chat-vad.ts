/**
 * 连续对话 VAD（语音活动检测）状态机。
 *
 * 纯函数，负责从"响度采样序列"推导"是否应结束本次录音"。
 * 与浏览器音频 API 解耦，便于单测。
 */

export const CONTINUOUS_CHAT_AUDIO_LEVEL_POLL_MS = 100;
export const CONTINUOUS_CHAT_MIN_RECORDING_MS = 900;
export const CONTINUOUS_CHAT_SILENCE_MS = 1_100;
export const CONTINUOUS_CHAT_MAX_RECORDING_MS = 12_000;
export const CONTINUOUS_CHAT_RESTART_DELAY_MS = 350;
export const CONTINUOUS_CHAT_SPEECH_THRESHOLD = 0.035;

export type ContinuousChatVadState = {
  /** 本次录音是否已检测到过高于阈值的语音。 */
  hasDetectedSpeech: boolean;
  /** 检测到语音后首次低于阈值的时刻（Unix ms）。 */
  silenceStartedAt: number | null;
};

export function createInitialVadState(): ContinuousChatVadState {
  return {
    hasDetectedSpeech: false,
    silenceStartedAt: null,
  };
}

export type ContinuousChatVadFrameInput = {
  /** 当前响度 RMS 值。 */
  level: number;
  /** 当前时刻（Unix ms）。 */
  now: number;
  /** 录音已持续时长（ms）。 */
  elapsedMs: number;
  minRecordingMs?: number;
  silenceMs?: number;
  speechThreshold?: number;
};

export type ContinuousChatVadFrameResult = {
  state: ContinuousChatVadState;
  /** 是否应结束本次录音。 */
  shouldComplete: boolean;
};

/**
 * 根据一帧响度采样推进 VAD 状态机。
 *
 * 规则：
 *   1. 响度达标 → 记为已检测到语音，清除静音起点。
 *   2. 尚未检测到语音，或录音未满最短时长 → 保持现状。
 *   3. 首次进入静音 → 记录静音起点。
 *   4. 静音持续超过阈值 → 判定说话结束。
 */
export function evaluateContinuousChatVad(
  state: ContinuousChatVadState,
  input: ContinuousChatVadFrameInput,
): ContinuousChatVadFrameResult {
  const minRecordingMs =
    input.minRecordingMs ?? CONTINUOUS_CHAT_MIN_RECORDING_MS;
  const silenceMs = input.silenceMs ?? CONTINUOUS_CHAT_SILENCE_MS;
  const speechThreshold =
    input.speechThreshold ?? CONTINUOUS_CHAT_SPEECH_THRESHOLD;

  if (input.level >= speechThreshold) {
    return {
      state: { hasDetectedSpeech: true, silenceStartedAt: null },
      shouldComplete: false,
    };
  }

  if (!state.hasDetectedSpeech || input.elapsedMs < minRecordingMs) {
    return { state, shouldComplete: false };
  }

  if (state.silenceStartedAt === null) {
    return {
      state: { ...state, silenceStartedAt: input.now },
      shouldComplete: false,
    };
  }

  if (input.now - state.silenceStartedAt >= silenceMs) {
    return { state, shouldComplete: true };
  }

  return { state, shouldComplete: false };
}
