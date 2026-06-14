import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isRecord } from "@/modules/assistant/lib/type-guards";
import type {
  SpeechApiErrorResponse,
  SpeechTranscriptionSuccessResponse,
} from "../../../../src/worker/routes/speech/types";

const MAX_RECORDING_MS = 15_000;
const AUDIO_FORM_FIELD_NAME = "audio";
const AUDIO_FILE_BASENAME = "chat-voice";
const preferredAudioMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/wav",
] as const;

type WorkerSpeechTranscriptionStatus =
  | "unsupported"
  | "idle"
  | "recording"
  | "transcribing"
  | "error";

type WorkerSpeechTranscriptionState = {
  isRecordingSupported: boolean;
  status: WorkerSpeechTranscriptionStatus;
  errorMessage?: string;
};

type UseWorkerSpeechTranscriptionInput = {
  stream: MediaStream | null;
  language?: string;
  onStatusMessage: (message: string) => void;
};

type UseWorkerSpeechTranscriptionResult = {
  transcriptionState: WorkerSpeechTranscriptionState;
  startRecording: () => boolean;
  stopRecording: () => Promise<SpeechTranscriptionSuccessResponse | null>;
  cancelRecording: () => void;
};

type MediaRecorderConstructorLike = {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
  isTypeSupported?: (mimeType: string) => boolean;
};

type MediaRecorderScope = {
  MediaRecorder?: MediaRecorderConstructorLike;
};

type MediaRecorderSupportScope = {
  MediaRecorder?: {
    isTypeSupported?: (mimeType: string) => boolean;
  };
};

type PendingStop = {
  promise: Promise<SpeechTranscriptionSuccessResponse | null>;
  resolve: (response: SpeechTranscriptionSuccessResponse | null) => void;
};

function getMediaRecorderScope(): MediaRecorderScope | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window as unknown as MediaRecorderScope;
}

function getMediaRecorderConstructor(
  scope: MediaRecorderScope | null = getMediaRecorderScope(),
): MediaRecorderConstructorLike | null {
  return scope?.MediaRecorder ?? null;
}

export function getSupportedAudioRecordingMimeType(
  scope: MediaRecorderSupportScope | null = getMediaRecorderScope(),
): string {
  const MediaRecorderConstructor = scope?.MediaRecorder ?? null;

  if (MediaRecorderConstructor === null) {
    return "";
  }

  const isTypeSupported = MediaRecorderConstructor.isTypeSupported;

  if (isTypeSupported === undefined) {
    return "";
  }

  return (
    preferredAudioMimeTypes.find((mimeType) => isTypeSupported(mimeType)) ?? ""
  );
}

export function getAudioRecordingFileExtension(mimeType: string): string {
  const normalizedMimeType = mimeType.split(";")[0]?.trim().toLowerCase();

  if (normalizedMimeType === "audio/mp4") {
    return "m4a";
  }

  if (normalizedMimeType === "audio/ogg") {
    return "ogg";
  }

  if (normalizedMimeType === "audio/wav") {
    return "wav";
  }

  return "webm";
}

function isSpeechTranscriptionSuccessResponse(
  value: unknown,
): value is SpeechTranscriptionSuccessResponse {
  return (
    isRecord(value) &&
    value.success === true &&
    typeof value.text === "string" &&
    typeof value.model === "string"
  );
}

function isSpeechApiErrorResponse(
  value: unknown,
): value is SpeechApiErrorResponse {
  return (
    isRecord(value) &&
    value.success === false &&
    typeof value.error === "string" &&
    typeof value.code === "string"
  );
}

export function getLocalizedSpeechApiErrorMessage(
  errorResponse: SpeechApiErrorResponse,
): string {
  if (errorResponse.code === "missing_openai_api_key") {
    return "Worker 尚未配置 OPENAI_TRANSCRIPTION_API_KEY 或 OPENAI_API_KEY，无法进行语音转文字。";
  }

  if (errorResponse.code === "invalid_transcription_provider_config") {
    return "语音转文字 API 地址配置无效，请检查 OPENAI_BASE_URL 或 OPENAI_TRANSCRIPTIONS_URL。";
  }

  if (errorResponse.code === "invalid_audio_upload") {
    return "录音上传内容无效，请重新录制一段语音。";
  }

  if (errorResponse.code === "transcription_failed") {
    return `语音转文字调用失败：${errorResponse.error}`;
  }

  if (errorResponse.code === "invalid_transcription_response") {
    return "语音转文字返回内容不符合预期。";
  }

  return errorResponse.error;
}

function createPendingStop(): PendingStop {
  let resolvePendingStop: PendingStop["resolve"] = () => undefined;
  const promise = new Promise<SpeechTranscriptionSuccessResponse | null>(
    (resolve) => {
      resolvePendingStop = resolve;
    },
  );

  return {
    promise,
    resolve: resolvePendingStop,
  };
}

async function readTranscriptionError(response: Response): Promise<string> {
  try {
    const value = (await response.json()) as unknown;

    if (isSpeechApiErrorResponse(value)) {
      return getLocalizedSpeechApiErrorMessage(value);
    }
  } catch {
    return `语音转文字请求失败，状态码 ${response.status}。`;
  }

  return `语音转文字请求失败，状态码 ${response.status}。`;
}

async function readTranscriptionSuccess(
  response: Response,
): Promise<SpeechTranscriptionSuccessResponse> {
  let value: unknown;

  try {
    value = (await response.json()) as unknown;
  } catch {
    throw new Error(
      "语音转文字返回格式不符合预期，请确认当前访问的是 Worker 地址。",
    );
  }

  if (!isSpeechTranscriptionSuccessResponse(value)) {
    throw new Error("语音转文字返回格式不符合预期。");
  }

  return value;
}

async function transcribeAudioBlob(input: {
  audioBlob: Blob;
  language: string | undefined;
}): Promise<SpeechTranscriptionSuccessResponse> {
  const formData = new FormData();
  const mimeType = input.audioBlob.type;
  const filename = `${AUDIO_FILE_BASENAME}.${getAudioRecordingFileExtension(
    mimeType,
  )}`;
  formData.set(AUDIO_FORM_FIELD_NAME, input.audioBlob, filename);

  if (input.language !== undefined && input.language.trim().length > 0) {
    formData.set("language", input.language.trim());
  }

  const response = await fetch("/api/speech/transcription", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readTranscriptionError(response));
  }

  return readTranscriptionSuccess(response);
}

export function useWorkerSpeechTranscription({
  stream,
  language,
  onStatusMessage,
}: UseWorkerSpeechTranscriptionInput): UseWorkerSpeechTranscriptionResult {
  const recorderSupport = useMemo(
    () => getMediaRecorderConstructor() !== null,
    [],
  );
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const pendingStopRef = useRef<PendingStop | null>(null);
  const [transcriptionState, setTranscriptionState] =
    useState<WorkerSpeechTranscriptionState>({
      isRecordingSupported: recorderSupport,
      status: recorderSupport ? "idle" : "unsupported",
    });

  const clearRecordingTimer = useCallback((): void => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resolvePendingStop = useCallback(
    (response: SpeechTranscriptionSuccessResponse | null): void => {
      const pendingStop = pendingStopRef.current;
      pendingStopRef.current = null;
      pendingStop?.resolve(response);
    },
    [],
  );

  const cancelRecording = useCallback((): void => {
    clearRecordingTimer();
    chunksRef.current = [];
    resolvePendingStop(null);

    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (recorder !== null && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      recorder.stop();
    }

    setTranscriptionState((current) => ({
      ...current,
      status: recorderSupport ? "idle" : "unsupported",
      errorMessage: undefined,
    }));
  }, [clearRecordingTimer, recorderSupport, resolvePendingStop]);

  const startRecording = useCallback((): boolean => {
    const MediaRecorderConstructor = getMediaRecorderConstructor();

    if (MediaRecorderConstructor === null) {
      const message = "当前浏览器不支持本地录音。";
      setTranscriptionState({
        isRecordingSupported: false,
        status: "unsupported",
        errorMessage: message,
      });
      onStatusMessage(message);
      return false;
    }

    if (recorderRef.current !== null) {
      return false;
    }

    const audioTrack = stream?.getAudioTracks()[0];

    if (audioTrack === undefined) {
      const message = "请先授权麦克风后再进行语音提问。";
      setTranscriptionState({
        isRecordingSupported: true,
        status: "error",
        errorMessage: message,
      });
      onStatusMessage(message);
      return false;
    }

    const mimeType = getSupportedAudioRecordingMimeType();
    const audioOnlyStream = new MediaStream([audioTrack]);
    chunksRef.current = [];

    try {
      const recorder =
        mimeType.length > 0
          ? new MediaRecorderConstructor(audioOnlyStream, { mimeType })
          : new MediaRecorderConstructor(audioOnlyStream);

      recorder.ondataavailable = (event): void => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (): void => {
        const message = "录音失败，请重新授权麦克风后再试。";
        clearRecordingTimer();
        recorderRef.current = null;
        chunksRef.current = [];
        setTranscriptionState({
          isRecordingSupported: true,
          status: "error",
          errorMessage: message,
        });
        onStatusMessage(message);
        resolvePendingStop(null);
      };

      recorder.onstop = (): void => {
        clearRecordingTimer();
        recorderRef.current = null;
        const audioChunks = chunksRef.current;
        chunksRef.current = [];

        if (audioChunks.length === 0) {
          const message = "没有录到可转写的语音，请再试一次。";
          setTranscriptionState({
            isRecordingSupported: true,
            status: "error",
            errorMessage: message,
          });
          onStatusMessage(message);
          resolvePendingStop(null);
          return;
        }

        const audioBlob = new Blob(audioChunks, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });

        setTranscriptionState({
          isRecordingSupported: true,
          status: "transcribing",
        });
        onStatusMessage("正在转写语音。");

        void transcribeAudioBlob({ audioBlob, language })
          .then((result) => {
            setTranscriptionState({
              isRecordingSupported: true,
              status: "idle",
            });
            resolvePendingStop(result);
          })
          .catch((error: unknown) => {
            const message =
              error instanceof Error && error.message.trim().length > 0
                ? error.message
                : "语音转文字请求失败。";
            setTranscriptionState({
              isRecordingSupported: true,
              status: "error",
              errorMessage: message,
            });
            onStatusMessage(message);
            resolvePendingStop(null);
          });
      };

      recorderRef.current = recorder;
      recorder.start();
      timeoutRef.current = window.setTimeout(() => {
        const activeRecorder = recorderRef.current;

        if (activeRecorder !== null && activeRecorder.state !== "inactive") {
          activeRecorder.stop();
        }
      }, MAX_RECORDING_MS);
      setTranscriptionState({
        isRecordingSupported: true,
        status: "recording",
      });
      onStatusMessage("正在录音，请说出你的问题。");
      return true;
    } catch {
      recorderRef.current = null;
      chunksRef.current = [];
      const message = "录音启动失败，请检查麦克风权限。";
      setTranscriptionState({
        isRecordingSupported: true,
        status: "error",
        errorMessage: message,
      });
      onStatusMessage(message);
      return false;
    }
  }, [
    clearRecordingTimer,
    language,
    onStatusMessage,
    resolvePendingStop,
    stream,
  ]);

  const stopRecording = useCallback(async (): Promise<
    SpeechTranscriptionSuccessResponse | null
  > => {
    const recorder = recorderRef.current;

    if (recorder === null) {
      return null;
    }

    if (pendingStopRef.current !== null) {
      return pendingStopRef.current.promise;
    }

    const pendingStop = createPendingStop();
    pendingStopRef.current = pendingStop;

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    return pendingStop.promise;
  }, []);

  useEffect(() => {
    return () => {
      cancelRecording();
    };
  }, [cancelRecording]);

  return {
    transcriptionState,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
