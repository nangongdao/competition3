import { useCallback, useEffect, useRef, useState } from "react";

import type { MediaPermissionState } from "@/modules/assistant/types";

const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: "user",
  },
};

type UseMediaCaptureResult = {
  stream: MediaStream | null;
  mediaState: MediaPermissionState;
  requestAccess: () => Promise<void>;
  stopAccess: () => void;
};

function isMediaDevicesSupported(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

function getMediaErrorState(error: unknown): MediaPermissionState {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return {
        status: "denied",
        errorMessage: "The browser denied camera or microphone access.",
      };
    }

    if (error.name === "NotFoundError") {
      return {
        status: "error",
        errorMessage: "No available camera or microphone device was detected.",
      };
    }
  }

  return {
    status: "error",
    errorMessage:
      "Media device startup failed. Check browser permissions and device usage.",
  };
}

export function useMediaCapture(): UseMediaCaptureResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mediaState, setMediaState] = useState<MediaPermissionState>({
    status: "idle",
  });
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = useCallback((targetStream: MediaStream | null): void => {
    targetStream?.getTracks().forEach((track) => {
      track.stop();
    });
  }, []);

  const requestAccess = useCallback(async (): Promise<void> => {
    if (!isMediaDevicesSupported()) {
      setMediaState({
        status: "unsupported",
        errorMessage:
          "This browser does not support camera and microphone capture.",
      });
      return;
    }

    setMediaState({ status: "requesting" });

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia(
        MEDIA_CONSTRAINTS,
      );
      stopTracks(streamRef.current);
      streamRef.current = nextStream;
      setStream(nextStream);
      setMediaState({ status: "granted" });
    } catch (error: unknown) {
      stopTracks(streamRef.current);
      streamRef.current = null;
      setStream(null);
      setMediaState(getMediaErrorState(error));
    }
  }, [stopTracks]);

  const stopAccess = useCallback((): void => {
    stopTracks(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setMediaState({ status: "idle" });
  }, [stopTracks]);

  useEffect(() => {
    return () => {
      stopTracks(streamRef.current);
      streamRef.current = null;
    };
  }, [stopTracks]);

  return {
    stream,
    mediaState,
    requestAccess,
    stopAccess,
  };
}
