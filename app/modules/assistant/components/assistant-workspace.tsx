import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Camera,
  CircleStop,
  Download,
  Gauge,
  Image as ImageIcon,
  Hand,
  Mic,
  MicOff,
  Play,
  Radio,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Video,
  Volume2,
} from "lucide-react";

import { useChatCompletion } from "@/modules/assistant/hooks/use-chat-completion";
import { useBrowserSpeechAdapter } from "@/modules/assistant/hooks/use-browser-speech-adapter";
import { useMediaCapture } from "@/modules/assistant/hooks/use-media-capture";
import { useProviderConfig } from "@/modules/assistant/hooks/use-provider-config";
import {
  REALTIME_IDLE_DISCONNECT_MS,
  REALTIME_IDLE_WARNING_MS,
  type RealtimeResponseMode,
  useRealtimeSession,
} from "@/modules/assistant/hooks/use-realtime-session";
import {
  formatTokens,
  formatUsd,
  serializeUsageReportCsv,
  serializeUsageReportJson,
} from "@/modules/assistant/lib/cost-model";
import {
  createFrameSignatureFromImageData,
  FRAME_DIFF_SEND_THRESHOLD,
  shouldSendFrame,
  type FrameSignature,
} from "@/modules/assistant/lib/frame-diff";
import type {
  AssistantPhase,
  CostControlSetting,
  MediaPermissionStatus,
  RealtimeConnectionStatus,
  TranscriptEntry,
  TranscriptSpeaker,
} from "@/modules/assistant/types";
import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";
import type { ProviderMode } from "../../../../src/worker/routes/provider/types";

const initialTranscript: readonly TranscriptEntry[] = [
  {
    id: "entry-0",
    speaker: "system",
    text: "?????????",
    createdAt: Date.now(),
  },
  {
    id: "entry-1",
    speaker: "assistant",
    text: "Worker ?? OPENAI_API_KEY ? OPENAI_CHAT_MODEL ???????? Chat Completions?Realtime ???????????????",
    createdAt: Date.now(),
  },
] as const;

const phaseLabels: Record<AssistantPhase, string> = {
  idle: "???",
  ready: "?????",
  connecting: "???",
  listening: "???",
  thinking: "???",
  responding: "???",
  error: "????",
};

const mediaLabels: Record<MediaPermissionStatus, string> = {
  idle: "???",
  requesting: "???",
  granted: "???",
  denied: "???",
  unsupported: "???",
  error: "??",
};

const realtimeLabels: Record<RealtimeConnectionStatus, string> = {
  idle: "???",
  "creating-session": "????",
  connecting: "???",
  connected: "???",
  error: "??",
};

const turnDetectionLabels: Record<RealtimeTurnDetectionMode, string> = {
  "server-vad": "??? VAD",
  "push-to-talk": "????",
};

const turnDetectionOptions: readonly {
  value: RealtimeTurnDetectionMode;
  label: string;
}[] = [
  {
    value: "server-vad",
    label: "??? VAD",
  },
  {
    value: "push-to-talk",
    label: "????",
  },
] as const;

const responseBudgetLabels: Record<RealtimeResponseBudget, string> = {
  brief: "??",
  standard: "??",
  detailed: "??",
};

const responseBudgetOptions: readonly {
  value: RealtimeResponseBudget;
  label: string;
}[] = [
  {
    value: "brief",
    label: "??",
  },
  {
    value: "standard",
    label: "??",
  },
  {
    value: "detailed",
    label: "??",
  },
] as const;

const responseModeLabels: Record<RealtimeResponseMode, string> = {
  "audio-text": "??+??",
  "text-only": "???",
};

const providerModeLabels: Record<ProviderMode, string> = {
  chat: "Chat Completions",
  realtime: "Realtime",
};

const providerModeOptions: readonly {
  value: ProviderMode;
  label: string;
}[] = [
  {
    value: "chat",
    label: "????",
  },
  {
    value: "realtime",
    label: "Realtime",
  },
] as const;

function formatEntryTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function getSpeakerLabel(speaker: TranscriptSpeaker): string {
  if (speaker === "assistant") {
    return "AI";
  }

  if (speaker === "user") {
    return "?";
  }

  return "??";
}

function isActiveSession(phase: AssistantPhase): boolean {
  return (
    phase === "connecting" ||
    phase === "listening" ||
    phase === "thinking" ||
    phase === "responding"
  );
}

function buildDownloadDataUrl(contentType: string, content: string): string {
  return `data:${contentType};charset=utf-8,${encodeURIComponent(content)}`;
}

type CapturedFrame = {
  frameDataUrl: string;
  signature: FrameSignature;
};

export function AssistantWorkspace(): React.JSX.Element {
  const { mediaState, requestAccess, stopAccess, stream } = useMediaCapture();
  const {
    providerMode,
    isProviderConfigLoading,
    providerConfigError,
    setProviderMode,
  } = useProviderConfig();
  const { chatState, sendChatCompletion } = useChatCompletion();
  const [assistantPhase, setAssistantPhase] = useState<AssistantPhase>("idle");
  const [transcript, setTranscript] = useState<readonly TranscriptEntry[]>(
    initialTranscript,
  );
  const [lastFrameDataUrl, setLastFrameDataUrl] = useState<string | null>(null);
  const [sampledFrameCount, setSampledFrameCount] = useState(0);
  const [sentFrameCount, setSentFrameCount] = useState(0);
  const [skippedAutoFrameCount, setSkippedAutoFrameCount] = useState(0);
  const [isAutoSampling, setIsAutoSampling] = useState(false);
  const [samplingIntervalSeconds, setSamplingIntervalSeconds] = useState(8);
  const [isFramePruningEnabled, setIsFramePruningEnabled] = useState(true);
  const [turnDetectionMode, setTurnDetectionMode] =
    useState<RealtimeTurnDetectionMode>("server-vad");
  const [responseBudget, setResponseBudget] =
    useState<RealtimeResponseBudget>("standard");
  const [responseMode, setResponseMode] =
    useState<RealtimeResponseMode>("audio-text");
  const [isChatAnswerSpeechEnabled, setIsChatAnswerSpeechEnabled] =
    useState(false);
  const [textDraft, setTextDraft] = useState("");
  const nextEntryIdRef = useRef(initialTranscript.length);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastUploadedFrameSignatureRef = useRef<FrameSignature | null>(null);

  const hasMedia = mediaState.status === "granted" && stream !== null;
  const hasActiveSession = isActiveSession(assistantPhase);

  const addTranscript = useCallback(
    (speaker: TranscriptSpeaker, text: string): void => {
      const id = `entry-${nextEntryIdRef.current}`;
      nextEntryIdRef.current += 1;

      setTranscript((current) => [
        ...current,
        {
          id,
          speaker,
          text,
          createdAt: Date.now(),
        },
      ]);
    },
    [],
  );

  const handleRealtimePhaseChange = useCallback((phase: AssistantPhase): void => {
    setAssistantPhase(phase);
  }, []);

  const handleChatSpeechTranscript = useCallback(
    (recognizedText: string): void => {
      setTextDraft((currentDraft) => {
        const trimmedCurrentDraft = currentDraft.trim();

        if (trimmedCurrentDraft.length === 0) {
          return recognizedText;
        }

        return `${trimmedCurrentDraft} ${recognizedText}`;
      });
      addTranscript("system", "????????????");
    },
    [addTranscript],
  );

  const handleBrowserSpeechStatus = useCallback(
    (message: string): void => {
      addTranscript("system", message);
    },
    [addTranscript],
  );

  const {
    speechState,
    startListening: startChatSpeechInput,
    stopListening: stopChatSpeechInput,
    speak: speakChatAnswer,
    cancelSpeech: cancelChatSpeech,
  } = useBrowserSpeechAdapter({
    language: "zh-CN",
    onTranscript: handleChatSpeechTranscript,
    onStatusMessage: handleBrowserSpeechStatus,
  });

  const {
    realtimeState,
    remoteStream,
    usageReport,
    prunedFrameCount,
    startSession: startRealtimeSession,
    stopSession: stopRealtimeSession,
    sendVisualContext,
    sendTextMessage,
    isMicrophoneMuted,
    isPushToTalkActive,
    setMicrophoneMuted,
    startPushToTalk,
    stopPushToTalk,
  } = useRealtimeSession({
    stream,
    onTranscript: addTranscript,
    onPhaseChange: handleRealtimePhaseChange,
    pruneConsumedFrames: isFramePruningEnabled,
    responseMode,
  });

  const hasRealtimeConnection = realtimeState.status === "connected";
  const isChatMode = providerMode === "chat";
  const isRealtimeMode = providerMode === "realtime";
  const isChatSpeechListening = speechState.recognitionStatus === "listening";
  const usageExport = useMemo(() => {
    const generatedAt = Date.now();

    return {
      jsonDownloadUrl: buildDownloadDataUrl(
        "application/json",
        serializeUsageReportJson(usageReport, generatedAt),
      ),
      csvDownloadUrl: buildDownloadDataUrl(
        "text/csv",
        serializeUsageReportCsv(usageReport, generatedAt),
      ),
      jsonFilename: `realtime-usage-${generatedAt}.json`,
      csvFilename: `realtime-usage-${generatedAt}.csv`,
    };
  }, [usageReport]);
  const activeTurnDetectionMode =
    realtimeState.costPolicy?.turnDetectionMode ?? turnDetectionMode;
  const activeResponseBudget =
    realtimeState.costPolicy?.responseBudget ?? responseBudget;
  const isPushToTalkMode = activeTurnDetectionMode === "push-to-talk";
  const microphoneStatusLabel = !hasMedia
    ? "?????"
    : isChatMode
      ? speechState.isRecognitionSupported
        ? "?????"
        : "?????"
    : isMicrophoneMuted
      ? "??????"
      : isPushToTalkMode
        ? isPushToTalkActive
          ? "?????"
          : "??????"
        : "??????";
  const chatSpeechStatusLabel = !speechState.isRecognitionSupported
    ? "?????????????"
    : !hasMedia
      ? "????????????????"
      : isChatSpeechListening
        ? "????????????????"
        : speechState.recognitionStatus === "error"
          ? speechState.recognitionError ?? "??????????"
          : "?????????????? Chat ?????";
  const costControls: readonly CostControlSetting[] = [
    {
      label: "????",
      value: providerModeLabels[providerMode],
      detail: isChatMode
        ? "?? HTTP ?? /v1/chat/completions????????? API ??"
        : "WebRTC Realtime ??????????? Realtime ????",
    },
    {
      label: "????",
      value:
        isChatMode
          ? "???????"
          : realtimeState.costPolicy?.visualContextMode ??
        (isAutoSampling ? "????" : "????"),
      detail: isChatMode
        ? "????????????? Chat ?????"
        : "??????????????????",
    },
    {
      label: "????",
      value: isChatMode
        ? "????"
        : realtimeState.costPolicy
        ? `${Math.round(realtimeState.costPolicy.maxSessionSeconds / 60)} ??`
        : "10 ??",
      detail: isChatMode
        ? "Chat Completions ??? WebRTC ?????????????"
        : "??????????? Realtime ???",
    },
    {
      label: "????",
      value: `${Math.round(REALTIME_IDLE_DISCONNECT_MS / 1000)} ?`,
      detail: `${Math.round(
        REALTIME_IDLE_WARNING_MS / 1000,
      )} ?????????????????`,
    },
    {
      label: "????",
      value: realtimeState.costPolicy
        ? `${responseBudgetLabels[activeResponseBudget]} / ${formatTokens(
            realtimeState.costPolicy.maxResponseOutputTokens,
          )}`
        : responseBudgetLabels[activeResponseBudget],
      detail: "Worker ???????????? token?",
    },
    {
      label: "????",
      value: isChatMode
        ? isChatAnswerSpeechEnabled
          ? "??+?????"
          : "??"
        : responseModeLabels[responseMode],
      detail: isChatMode
        ? "Chat ?????? token????????????????"
        : responseMode === "text-only"
          ? "????????????"
          : "??????????????",
    },
    {
      label: "????",
      value: "???",
      detail: "?????????? Worker ??",
    },
    {
      label: "????",
      value: isChatMode
        ? speechState.isRecognitionSupported
          ? "?????"
          : "???"
        : turnDetectionLabels[activeTurnDetectionMode],
      detail: isChatMode
        ? "?????????????????? Chat ?????"
        : activeTurnDetectionMode === "push-to-talk"
          ? "????????????????"
          : "??? VAD ???????????",
    },
    {
      label: "???",
      value: microphoneStatusLabel,
      detail: isChatMode
        ? "Chat ?????????????? Worker ????"
        : isMicrophoneMuted
        ? "??????????"
        : "???????????????",
    },
    {
      label: "????",
      value: `${Math.round(FRAME_DIFF_SEND_THRESHOLD * 100)}%`,
      detail: "??????????????????",
    },
  ] as const;

  const captureFrame = useCallback(
    (source: "manual" | "auto"): CapturedFrame | null => {
      const videoElement = videoRef.current;
      const canvasElement = canvasRef.current;

      if (
        !hasMedia ||
        videoElement === null ||
        canvasElement === null ||
        videoElement.videoWidth === 0 ||
        videoElement.videoHeight === 0
      ) {
        if (source === "manual") {
          addTranscript("system", "???????????????");
        }

        return null;
      }

      const maxFrameWidth = 640;
      const scale = Math.min(1, maxFrameWidth / videoElement.videoWidth);
      canvasElement.width = Math.round(videoElement.videoWidth * scale);
      canvasElement.height = Math.round(videoElement.videoHeight * scale);

      const context = canvasElement.getContext("2d");

      if (context === null) {
        if (source === "manual") {
          addTranscript("system", "??????????????");
        }

        return null;
      }

      context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
      let signature: FrameSignature;

      try {
        signature = createFrameSignatureFromImageData(
          context.getImageData(0, 0, canvasElement.width, canvasElement.height),
        );
      } catch {
        if (source === "manual") {
          addTranscript(
            "system",
            "???????????????",
          );
        }

        return null;
      }

      const frameDataUrl = canvasElement.toDataURL("image/jpeg", 0.72);
      setLastFrameDataUrl(frameDataUrl);
      setSampledFrameCount((currentCount) => currentCount + 1);

      if (source === "manual") {
        addTranscript("system", "???????????");
      }

      return {
        frameDataUrl,
        signature,
      };
    },
    [addTranscript, hasMedia],
  );

  const recordUploadedFrame = useCallback((signature: FrameSignature): void => {
    lastUploadedFrameSignatureRef.current = signature;
    setSentFrameCount((currentCount) => currentCount + 1);
  }, []);

  const stopSession = useCallback((): void => {
    const shouldLogStop = hasActiveSession || hasRealtimeConnection;
    stopRealtimeSession();

    if (shouldLogStop) {
      addTranscript("system", "???????????????");
    }

    setAssistantPhase(mediaState.status === "granted" ? "ready" : "idle");
  }, [
    addTranscript,
    hasActiveSession,
    hasRealtimeConnection,
    mediaState.status,
    stopRealtimeSession,
  ]);

  const sendChatTurn = useCallback(
    async (input: {
      message: string;
      imageDataUrl?: string;
      signature?: FrameSignature;
    }): Promise<void> => {
      setAssistantPhase("thinking");

      const response = await sendChatCompletion({
        message: input.message,
        imageDataUrl: input.imageDataUrl,
        responseBudget,
        instructions:
          "????????????????????????? Chat Completions ????????????????????????",
      });

      if (response === null) {
        setAssistantPhase("error");
        addTranscript("system", "Chat Completions ?????????????");
        return;
      }

      if (input.signature !== undefined) {
        recordUploadedFrame(input.signature);
      }

      addTranscript("assistant", response.answer);
      if (isChatAnswerSpeechEnabled) {
        speakChatAnswer(response.answer);
      }
      setAssistantPhase(mediaState.status === "granted" ? "ready" : "idle");
    },
    [
      addTranscript,
      isChatAnswerSpeechEnabled,
      mediaState.status,
      recordUploadedFrame,
      responseBudget,
      sendChatCompletion,
      speakChatAnswer,
    ],
  );

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
  }, [stream]);

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
  }, [remoteStream]);

  useEffect(() => {
    if (mediaState.status === "granted") {
      setAssistantPhase((currentPhase) =>
        currentPhase === "idle" ? "ready" : currentPhase,
      );
      return;
    }

    if (mediaState.status !== "requesting") {
      setAssistantPhase((currentPhase) =>
        currentPhase === "idle" ? currentPhase : "idle",
      );
    }
  }, [mediaState.status]);

  useEffect(() => {
    if (!isAutoSampling || !hasActiveSession || !hasMedia || !hasRealtimeConnection) {
      return;
    }

    const timerId = window.setInterval(() => {
      const capturedFrame = captureFrame("auto");

      if (capturedFrame === null) {
        return;
      }

      if (
        !shouldSendFrame(
          lastUploadedFrameSignatureRef.current,
          capturedFrame.signature,
          FRAME_DIFF_SEND_THRESHOLD,
        )
      ) {
        setSkippedAutoFrameCount((currentCount) => currentCount + 1);
        return;
      }

      const sent = sendVisualContext({
        frameDataUrl: capturedFrame.frameDataUrl,
        prompt:
          "???????????????????????????????????????",
        requestResponse: false,
      });

      if (sent) {
        recordUploadedFrame(capturedFrame.signature);
      }
    }, samplingIntervalSeconds * 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [
    captureFrame,
    hasActiveSession,
    hasMedia,
    hasRealtimeConnection,
    isAutoSampling,
    recordUploadedFrame,
    sendVisualContext,
    samplingIntervalSeconds,
  ]);

  const handleRequestAccess = (): void => {
    void requestAccess();
  };

  const handleReleaseMedia = (): void => {
    stopSession();
    stopAccess();
    setIsAutoSampling(false);
    setLastFrameDataUrl(null);
    lastUploadedFrameSignatureRef.current = null;
    setSentFrameCount(0);
    setSkippedAutoFrameCount(0);
    setMicrophoneMuted(false);
    addTranscript("system", "?????????????");
  };

  const handleProviderModeChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const nextProviderMode = event.currentTarget.value;

    if (nextProviderMode !== "chat" && nextProviderMode !== "realtime") {
      return;
    }

    if (nextProviderMode === providerMode) {
      return;
    }

    if (nextProviderMode === "chat" && hasRealtimeConnection) {
      stopRealtimeSession();
      setAssistantPhase(mediaState.status === "granted" ? "ready" : "idle");
      addTranscript(
        "system",
        "???? Chat Completions ?????Realtime ??????",
      );
    }

    if (nextProviderMode === "realtime") {
      if (isChatSpeechListening) {
        stopChatSpeechInput();
      }

      cancelChatSpeech();
    }

    setProviderMode(nextProviderMode);
  };

  const handleStartSession = (): void => {
    if (isChatMode) {
      addTranscript(
        "system",
        "Chat Completions ???????? Realtime ????????????????",
      );
      return;
    }

    if (mediaState.status !== "granted") {
      setAssistantPhase("error");
      addTranscript("system", "????????????");
      return;
    }

    addTranscript("system", "????????? Realtime ???");
    lastUploadedFrameSignatureRef.current = null;
    setSentFrameCount(0);
    setSkippedAutoFrameCount(0);
    void startRealtimeSession({
      visualContextMode: isAutoSampling ? "interval" : "manual",
      turnDetectionMode,
      responseBudget,
      instructions:
        "???????????????????????????????????????????????????",
    });
  };

  const handleRealtimeTurn = (): void => {
    const prompt = "????????????????";

    if (isChatMode) {
      if (!hasMedia) {
        addTranscript("system", "???????????????");
        return;
      }

      const capturedFrame = captureFrame("manual");

      if (capturedFrame === null) {
        return;
      }

      addTranscript("user", prompt);
      void sendChatTurn({
        message: prompt,
        imageDataUrl: capturedFrame.frameDataUrl,
        signature: capturedFrame.signature,
      });
      return;
    }

    if (assistantPhase !== "listening" || !hasRealtimeConnection) {
      return;
    }

    const capturedFrame = captureFrame("manual");

    if (capturedFrame === null) {
      return;
    }

    addTranscript("user", prompt);

    const sent = sendVisualContext({
      frameDataUrl: capturedFrame.frameDataUrl,
      prompt,
      requestResponse: true,
    });

    if (sent) {
      recordUploadedFrame(capturedFrame.signature);
      addTranscript("system", "?? Realtime ???????????");
      return;
    }

    setAssistantPhase("error");
    addTranscript("system", "Realtime ???????????????");
  };

  const handleManualFrameCapture = (): void => {
    const capturedFrame = captureFrame("manual");

    if (capturedFrame !== null && hasRealtimeConnection) {
      const sent = sendVisualContext({
        frameDataUrl: capturedFrame.frameDataUrl,
        prompt:
          "??????????????????????????????",
        requestResponse: false,
      });

      if (sent) {
        recordUploadedFrame(capturedFrame.signature);
        addTranscript("system", "????????? Realtime ??????");
      }
    }
  };

  const handleAutoSamplingChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    setIsAutoSampling(event.currentTarget.checked);
  };

  const handleFramePruningChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    setIsFramePruningEnabled(event.currentTarget.checked);
  };

  const handleTurnDetectionModeChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const nextMode = event.currentTarget.value;

    if (nextMode === "server-vad" || nextMode === "push-to-talk") {
      setTurnDetectionMode(nextMode);
    }
  };

  const handleResponseBudgetChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const nextBudget = event.currentTarget.value;

    if (
      nextBudget === "brief" ||
      nextBudget === "standard" ||
      nextBudget === "detailed"
    ) {
      setResponseBudget(nextBudget);
    }
  };

  const handleResponseModeChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    setResponseMode(event.currentTarget.checked ? "text-only" : "audio-text");
  };

  const handleMicrophoneMutedChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    setMicrophoneMuted(event.currentTarget.checked);
  };

  const handleChatSpeechInputClick = (): void => {
    if (isChatSpeechListening) {
      stopChatSpeechInput();
      addTranscript("system", "??? Chat ?????");
      return;
    }

    startChatSpeechInput();
  };

  const handleChatAnswerSpeechChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const nextEnabled = event.currentTarget.checked;
    setIsChatAnswerSpeechEnabled(nextEnabled);

    if (!nextEnabled) {
      cancelChatSpeech();
    }
  };

  const handleCancelChatSpeech = (): void => {
    cancelChatSpeech();
    addTranscript("system", "?????????");
  };

  const handleTextDraftChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    setTextDraft(event.currentTarget.value);
  };

  const handleTextMessageSubmit = (
    event: React.FormEvent<HTMLFormElement>,
  ): void => {
    event.preventDefault();

    const message = textDraft.trim();

    if (message.length === 0) {
      return;
    }

    if (isChatMode) {
      addTranscript("user", message);
      setTextDraft("");
      void sendChatTurn({ message });
      return;
    }

    if (!hasRealtimeConnection) {
      addTranscript(
        "system",
        "???? Realtime ???????????",
      );
      return;
    }

    const sent = sendTextMessage(message);

    if (!sent) {
      addTranscript("system", "Realtime ??????????????");
      return;
    }

    addTranscript("user", message);
    setTextDraft("");
  };

  const handlePushToTalkPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    if (!canPushToTalk) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startPushToTalk();
  };

  const handlePushToTalkPointerEnd = (
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    stopPushToTalk();
  };

  const handlePushToTalkKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ): void => {
    if (
      event.repeat ||
      !canPushToTalk ||
      (event.key !== " " && event.key !== "Enter")
    ) {
      return;
    }

    event.preventDefault();
    startPushToTalk();
  };

  const handlePushToTalkKeyUp = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ): void => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    stopPushToTalk();
  };

  const handleSamplingIntervalChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    setSamplingIntervalSeconds(Number(event.currentTarget.value));
  };

  const canStartSession =
    isRealtimeMode &&
    hasMedia &&
    !hasActiveSession &&
    realtimeState.status !== "creating-session" &&
    realtimeState.status !== "connecting" &&
    !hasRealtimeConnection;
  const canChangeTurnMode =
    isRealtimeMode &&
    !hasActiveSession &&
    realtimeState.status !== "creating-session" &&
    realtimeState.status !== "connecting" &&
    !hasRealtimeConnection;
  const canChangeProviderMode =
    !isProviderConfigLoading &&
    !chatState.isSending &&
    !isChatSpeechListening &&
    realtimeState.status !== "creating-session" &&
    realtimeState.status !== "connecting";
  const canChangeResponseBudget = isChatMode
    ? !chatState.isSending
    : canChangeTurnMode;
  const canRealtimeTurn =
    isRealtimeMode && assistantPhase === "listening" && hasRealtimeConnection;
  const canVisualQuestion = isChatMode
    ? hasMedia && !chatState.isSending
    : canRealtimeTurn;
  const canSendTextMessage = isChatMode
    ? !chatState.isSending
    : hasRealtimeConnection;
  const canToggleChatSpeechInput =
    isChatMode &&
    hasMedia &&
    speechState.isRecognitionSupported &&
    (!chatState.isSending || isChatSpeechListening);
  const canPushToTalk =
    isRealtimeMode &&
    assistantPhase === "listening" &&
    hasRealtimeConnection &&
    isPushToTalkMode &&
    !isMicrophoneMuted;
  const canStopSession =
    (isRealtimeMode && hasActiveSession) ||
    hasRealtimeConnection ||
    realtimeState.status === "creating-session" ||
    realtimeState.status === "connecting";
  const visibleError =
    mediaState.errorMessage ??
    providerConfigError ??
    realtimeState.errorMessage ??
    chatState.errorMessage;
  const providerDetail = isChatMode
    ? chatState.isSending
      ? "?????? HTTP ?? Chat Completions"
      : "?? Realtime/WebRTC???????? Chat Completions"
    : hasRealtimeConnection
      ? "????????????"
      : realtimeState.peerConnectionState === null
        ? "?? Worker ??????????"
        : `?????${realtimeState.peerConnectionState}`;
  const startSessionLabel =
    realtimeState.status === "creating-session" ||
    realtimeState.status === "connecting"
      ? "???"
      : isChatMode
        ? "Chat ??"
        : "????";

  return (
    <main className="assistant-shell">
      <section className="session-column" aria-labelledby="assistant-title">
        <div className="product-header">
          <div className="brand-mark" aria-hidden="true">
            <Radio size={25} strokeWidth={2.2} />
          </div>
          <div>
            <p className="eyebrow">AI ????</p>
            <h1 id="assistant-title">??????</h1>
          </div>
        </div>

        <div className="state-panel" aria-label="????">
          <div className="state-ring" data-phase={assistantPhase}>
            <span>{phaseLabels[assistantPhase]}</span>
          </div>
          <div className="state-copy">
            <p>??</p>
            <strong>{mediaLabels[mediaState.status]}</strong>
            <span>{hasMedia ? "??????????" : "??????"}</span>
            <p>??</p>
            <strong>
              {isChatMode
                ? providerModeLabels[providerMode]
                : realtimeLabels[realtimeState.status]}
            </strong>
            <span>{providerDetail}</span>
          </div>
        </div>

        {visibleError ? (
          <p className="error-banner" role="alert">
            {visibleError}
          </p>
        ) : null}

        <div className="control-grid" aria-label="????">
          <button
            className="control-button primary"
            type="button"
            onClick={handleRequestAccess}
            disabled={mediaState.status === "requesting"}
          >
            <Camera size={18} aria-hidden="true" />
            <span>{hasMedia ? "????" : "????"}</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={handleStartSession}
            disabled={!canStartSession}
          >
            <Play size={18} aria-hidden="true" />
            <span>{startSessionLabel}</span>
          </button>

          <button
            className="control-button ptt"
            type="button"
            data-active={isPushToTalkActive ? "true" : "false"}
            onPointerDown={handlePushToTalkPointerDown}
            onPointerUp={handlePushToTalkPointerEnd}
            onPointerCancel={handlePushToTalkPointerEnd}
            onKeyDown={handlePushToTalkKeyDown}
            onKeyUp={handlePushToTalkKeyUp}
            disabled={!canPushToTalk}
            aria-pressed={isPushToTalkActive}
          >
            <Hand size={18} aria-hidden="true" />
            <span>{isPushToTalkActive ? "????" : "????"}</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={handleRealtimeTurn}
            disabled={!canVisualQuestion}
          >
            <Sparkles size={18} aria-hidden="true" />
            <span>??????</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={handleManualFrameCapture}
            disabled={!hasMedia}
          >
            <ImageIcon size={18} aria-hidden="true" />
            <span>????</span>
          </button>

          <button
            className="control-button danger"
            type="button"
            onClick={stopSession}
            disabled={!canStopSession}
          >
            <CircleStop size={18} aria-hidden="true" />
            <span>????</span>
          </button>
        </div>

        <button
          className="release-button"
          type="button"
          onClick={handleReleaseMedia}
          disabled={!hasMedia}
        >
          <RefreshCcw size={17} aria-hidden="true" />
          ?????????
        </button>

        <div className="cost-panel" aria-label="????">
          <div className="panel-heading">
            <Gauge size={18} aria-hidden="true" />
            <span>????</span>
          </div>
          <dl>
            {costControls.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>
                  <strong>{item.value}</strong>
                  <span>{item.detail}</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="provider-controls" aria-label="??????">
            <fieldset className="mode-segment" disabled={!canChangeProviderMode}>
              <legend>????</legend>
              <div>
                {providerModeOptions.map((option) => (
                  <label key={option.value}>
                    <input
                      type="radio"
                      name="provider-mode"
                      value={option.value}
                      checked={providerMode === option.value}
                      onChange={handleProviderModeChange}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="voice-controls" aria-label="??????">
            {isChatMode ? (
              <div className="chat-speech-controls" aria-label="Chat ??????">
                <button
                  className="inline-action-button"
                  type="button"
                  onClick={handleChatSpeechInputClick}
                  disabled={!canToggleChatSpeechInput}
                  aria-pressed={isChatSpeechListening}
                >
                  {isChatSpeechListening ? (
                    <MicOff size={16} aria-hidden="true" />
                  ) : (
                    <Mic size={16} aria-hidden="true" />
                  )}
                  <span>{isChatSpeechListening ? "????" : "????"}</span>
                </button>
                <span>{chatSpeechStatusLabel}</span>
              </div>
            ) : (
              <>
                <fieldset className="mode-segment" disabled={!canChangeTurnMode}>
                  <legend>????</legend>
                  <div>
                    {turnDetectionOptions.map((option) => (
                      <label key={option.value}>
                        <input
                          type="radio"
                          name="turn-detection-mode"
                          value={option.value}
                          checked={turnDetectionMode === option.value}
                          onChange={handleTurnDetectionModeChange}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={isMicrophoneMuted}
                    onChange={handleMicrophoneMutedChange}
                    disabled={!hasMedia}
                  />
                  <span>{isMicrophoneMuted ? "??????" : "?????"}</span>
                </label>
              </>
            )}
          </div>

          <div className="response-controls" aria-label="??????">
            <fieldset className="mode-segment" disabled={!canChangeResponseBudget}>
              <legend>????</legend>
              <div>
                {responseBudgetOptions.map((option) => (
                  <label key={option.value}>
                    <input
                      type="radio"
                      name="response-budget"
                      value={option.value}
                      checked={responseBudget === option.value}
                      onChange={handleResponseBudgetChange}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {isChatMode ? (
              <>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={isChatAnswerSpeechEnabled}
                    onChange={handleChatAnswerSpeechChange}
                    disabled={!speechState.isSynthesisSupported}
                  />
                  <span>
                    {isChatAnswerSpeechEnabled
                      ? "Chat ??????"
                      : "Chat ?????"}
                  </span>
                </label>

                <button
                  className="inline-action-button"
                  type="button"
                  onClick={handleCancelChatSpeech}
                  disabled={!speechState.isSpeaking}
                >
                  <Volume2 size={16} aria-hidden="true" />
                  <span>????</span>
                </button>
              </>
            ) : (
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={responseMode === "text-only"}
                  onChange={handleResponseModeChange}
                />
                <span>
                  {responseMode === "text-only"
                    ? "?????"
                    : "??+????"}
                </span>
              </label>
            )}
          </div>

          <div className="sampling-controls" aria-label="??????">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={isAutoSampling}
                onChange={handleAutoSamplingChange}
                disabled={!hasMedia}
              />
              <span>??????</span>
            </label>

            <label className="range-row">
              <span>??</span>
              <input
                type="range"
                min="5"
                max="20"
                step="1"
                value={samplingIntervalSeconds}
                onChange={handleSamplingIntervalChange}
                disabled={!hasMedia || !isAutoSampling}
              />
              <strong>{samplingIntervalSeconds} ?</strong>
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={isFramePruningEnabled}
                onChange={handleFramePruningChange}
                disabled={isChatMode}
              />
              <span>???????????</span>
            </label>
          </div>
        </div>

        <div className="usage-panel" aria-label="Realtime ???">
          <div className="usage-heading-row">
            <div className="panel-heading">
              <Activity size={18} aria-hidden="true" />
              <span>???</span>
            </div>
            <div className="usage-export-actions" aria-label="????">
              <a
                className="usage-export-button"
                href={usageExport.jsonDownloadUrl}
                download={usageExport.jsonFilename}
              >
                <Download size={14} aria-hidden="true" />
                <span>JSON</span>
              </a>
              <a
                className="usage-export-button"
                href={usageExport.csvDownloadUrl}
                download={usageExport.csvFilename}
              >
                <Download size={14} aria-hidden="true" />
                <span>CSV</span>
              </a>
            </div>
          </div>

          <dl className="usage-headline">
            <div>
              <dt>??</dt>
              <dd>{usageReport.turnCount}</dd>
            </div>
            <div>
              <dt>????</dt>
              <dd>{formatUsd(usageReport.estimatedCostUsd)}</dd>
            </div>
            <div>
              <dt>????</dt>
              <dd>
                {usageReport.lastTurn
                  ? formatTokens(usageReport.lastTurn.inputTokens)
                  : "-"}
              </dd>
            </div>
          </dl>

          <dl className="usage-breakdown">
            <div>
              <dt>????</dt>
              <dd>{formatTokens(usageReport.totals.inputAudioTokens)}</dd>
            </div>
            <div>
              <dt>????</dt>
              <dd>{formatTokens(usageReport.totals.inputImageTokens)}</dd>
            </div>
            <div>
              <dt>????</dt>
              <dd>{formatTokens(usageReport.totals.inputTextTokens)}</dd>
            </div>
            <div>
              <dt>????</dt>
              <dd>{formatTokens(usageReport.totals.cachedInputTokens)}</dd>
            </div>
            <div>
              <dt>????</dt>
              <dd>{formatTokens(usageReport.totals.outputAudioTokens)}</dd>
            </div>
            <div>
              <dt>????</dt>
              <dd>{formatTokens(usageReport.totals.outputTextTokens)}</dd>
            </div>
          </dl>

          <p className="usage-note">
            Token ??? Realtime API ???????????????????????
            ?????????????????????????????
          </p>
        </div>
      </section>

      <section className="vision-column" aria-labelledby="vision-title">
        <div className="camera-stage">
          <video
            ref={videoRef}
            className="camera-preview"
            autoPlay
            muted
            playsInline
            aria-label="???????"
          />
          <audio
            ref={audioRef}
            className="remote-audio"
            autoPlay
            aria-label="??????"
          />

          {!hasMedia ? (
            <div className="camera-empty">
              <Video size={34} aria-hidden="true" />
              <h2 id="vision-title">????</h2>
              <p>??????????????????</p>
            </div>
          ) : null}

          <div className="camera-hud" aria-label="??????">
            <span>
              <Camera size={15} aria-hidden="true" />
              {hasMedia ? "?????" : "?????"}
            </span>
            <span>
              {isMicrophoneMuted ? (
                <MicOff size={15} aria-hidden="true" />
              ) : (
                <Mic size={15} aria-hidden="true" />
              )}
              {microphoneStatusLabel}
            </span>
          </div>

          <div className="audio-meter" aria-hidden="true" data-active={assistantPhase}>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="visual-context-panel" aria-label="????????">
          <div className="panel-heading">
            <ImageIcon size={18} aria-hidden="true" />
            <span>?????</span>
          </div>

          <div className="frame-sample">
            {lastFrameDataUrl ? (
              <img src={lastFrameDataUrl} alt="??????????" />
            ) : (
              <div className="frame-placeholder">
                <ImageIcon size={22} aria-hidden="true" />
                <span>??????</span>
              </div>
            )}
          </div>

          <dl className="frame-stats">
            <div>
              <dt>???</dt>
              <dd>{sampledFrameCount}</dd>
            </div>
            <div>
              <dt>???</dt>
              <dd>{sentFrameCount}</dd>
            </div>
            <div>
              <dt>???</dt>
              <dd>{skippedAutoFrameCount}</dd>
            </div>
            <div>
              <dt>???</dt>
              <dd>{prunedFrameCount}</dd>
            </div>
            <div>
              <dt>??</dt>
              <dd>{isAutoSampling ? `${samplingIntervalSeconds} ?` : "??"}</dd>
            </div>
          </dl>
        </div>

        <div className="dialogue-board" aria-label="????">
          <div className="panel-heading">
            <Volume2 size={18} aria-hidden="true" />
            <span>???</span>
          </div>

          <ol className="transcript-list">
            {transcript.map((entry) => (
              <li className={`transcript-entry ${entry.speaker}`} key={entry.id}>
                <div>
                  <strong>{getSpeakerLabel(entry.speaker)}</strong>
                  <time dateTime={new Date(entry.createdAt).toISOString()}>
                    {formatEntryTime(entry.createdAt)}
                  </time>
                </div>
                <p>{entry.text}</p>
              </li>
            ))}
          </ol>

          <form
            className="text-composer"
            onSubmit={handleTextMessageSubmit}
            aria-label="??????"
          >
            <input
              type="text"
              value={textDraft}
              onChange={handleTextDraftChange}
              placeholder={
                isChatMode
                  ? "?????? Chat Completions ???"
                  : hasRealtimeConnection
                  ? "???????????"
                  : "??????????"
              }
              disabled={!canSendTextMessage}
              aria-label="?????????"
            />
            <button
              type="submit"
              disabled={!canSendTextMessage || textDraft.trim().length === 0}
              aria-label="??????"
            >
              <Send size={16} aria-hidden="true" />
              <span>{chatState.isSending ? "???" : "??"}</span>
            </button>
          </form>
        </div>

        <aside className="security-strip" aria-label="????">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>??????????????</span>
        </aside>

        <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true" />
      </section>
    </main>
  );
}