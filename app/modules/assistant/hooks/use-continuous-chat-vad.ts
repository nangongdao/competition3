import { useEffect, useRef } from "react";

import { calculateAudioRootMeanSquare, getAudioContextConstructor } from "@/modules/assistant/lib/audio-utils";
import {
  CONTINUOUS_CHAT_AUDIO_LEVEL_POLL_MS,
  CONTINUOUS_CHAT_MAX_RECORDING_MS,
  createInitialVadState,
  evaluateContinuousChatVad,
} from "@/modules/assistant/lib/continuous-chat-vad";

export type UseContinuousChatVadOptions = {
  /** 要监听的音频轨；null 表示无可监听轨。 */
  audioTrack: MediaStreamTrack | null;
  /** 是否激活 VAD 监听（连续语音开启、正在录音、处于 Chat 模式）。 */
  enabled: boolean;
  /** VAD 判定说话结束（或达到最长录音时长）时触发。 */
  onUtteranceComplete: () => void;
};

/**
 * 连续对话 VAD（语音活动检测）hook。
 *
 * 在录音期间监听音频电平，用 `evaluateContinuousChatVad` 纯函数推进
 * VAD 状态机，检测到用户说完话（静音超过阈值）或超过最长录音时长时，
 * 触发 `onUtteranceComplete` 结束当前一轮录音。
 *
 * 与浏览器音频 API（AudioContext/AnalyserNode）解耦的逻辑在
 * `lib/continuous-chat-vad.ts` 中，本 hook 只负责桥接浏览器音频资源与
 * 该纯函数，并确保在卸载/停用时正确释放资源。
 *
 * @param options 见 {@link UseContinuousChatVadOptions}。
 */
export function useContinuousChatVad({
  audioTrack,
  enabled,
  onUtteranceComplete,
}: UseContinuousChatVadOptions): void {
  // 用 ref 保存最新回调，避免回调引用变化导致 effect 频繁重建（从而重置 VAD 状态）。
  const onUtteranceCompleteRef = useRef(onUtteranceComplete);
  onUtteranceCompleteRef.current = onUtteranceComplete;

  useEffect(() => {
    if (!enabled || audioTrack === null) {
      return;
    }

    const completeTurn = (): void => {
      onUtteranceCompleteRef.current();
    };

    let vadState = createInitialVadState();
    let isStopping = false;
    const recordingStartedAt = Date.now();
    const AudioContextConstructor = getAudioContextConstructor();
    let audioContext: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let intervalId: number | null = null;

    const stopAfterTurn = (): void => {
      if (isStopping) {
        return;
      }

      isStopping = true;
      completeTurn();
    };

    const maxRecordingTimeoutId = window.setTimeout(
      stopAfterTurn,
      CONTINUOUS_CHAT_MAX_RECORDING_MS,
    );

    if (AudioContextConstructor !== null) {
      try {
        audioContext = new AudioContextConstructor();
        const audioOnlyStream = new MediaStream([audioTrack]);
        const analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 1024;
        sourceNode = audioContext.createMediaStreamSource(audioOnlyStream);
        sourceNode.connect(analyserNode);

        const samples = new Uint8Array(analyserNode.fftSize);
        intervalId = window.setInterval(() => {
          analyserNode.getByteTimeDomainData(samples);
          const level = calculateAudioRootMeanSquare(samples);
          const now = Date.now();
          const elapsedMs = now - recordingStartedAt;

          const frameResult = evaluateContinuousChatVad(vadState, {
            level,
            now,
            elapsedMs,
          });
          vadState = frameResult.state;

          if (frameResult.shouldComplete) {
            stopAfterTurn();
          }
        }, CONTINUOUS_CHAT_AUDIO_LEVEL_POLL_MS);
      } catch {
        void audioContext?.close().catch(() => undefined);
        audioContext = null;
        sourceNode = null;
      }
    }

    return () => {
      window.clearTimeout(maxRecordingTimeoutId);

      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }

      sourceNode?.disconnect();
      void audioContext?.close().catch(() => undefined);
    };
    // 只依赖 audioTrack 与 enabled：回调通过 ref 间接引用，不参与重建。
  }, [audioTrack, enabled]);
}
