/**
 * 媒体元素绑定 hook。
 *
 * 收敛 `assistant-workspace` 主组件中两个内联 effect：把本地摄像头/麦克风 `stream`
 * 绑定到 `<video>` 元素、把远端 Realtime 音频 `remoteStream` 绑定到 `<audio>` 元素，
 * 并在流变化或卸载时清理 `srcObject`。
 *
 * 行为与原内联 effect 等价：
 * - 元素不存在时跳过；
 * - 绑定非空流后调用 `play()`（静默吞掉播放失败，例如浏览器未允许自动播放）；
 * - 依赖变化或卸载时把 `srcObject` 置回 `null`。
 */

import { useEffect } from "react";

type MediaStreamBindingInput = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  stream: MediaStream | null;
  remoteStream: MediaStream | null;
};

/** 把本地流绑定到 video、远端流绑定到 audio，并在清理时解绑。 */
export function useMediaStreamBinding({
  videoRef,
  audioRef,
  stream,
  remoteStream,
}: MediaStreamBindingInput): void {
  useEffect(() => {
    const videoElement = videoRef.current;

    if (videoElement === null) {
      return;
    }

    videoElement.srcObject = stream;

    if (stream !== null) {
      void videoElement.play().catch(() => undefined);
    }

    return () => {
      videoElement.srcObject = null;
    };
  }, [videoRef, stream]);

  useEffect(() => {
    const audioElement = audioRef.current;

    if (audioElement === null) {
      return;
    }

    audioElement.srcObject = remoteStream;

    if (remoteStream !== null) {
      void audioElement.play().catch(() => undefined);
    }

    return () => {
      audioElement.srcObject = null;
    };
  }, [audioRef, remoteStream]);
}
