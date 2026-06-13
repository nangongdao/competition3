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

import { useMediaCapture } from "@/modules/assistant/hooks/use-media-capture";
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

const initialTranscript: readonly TranscriptEntry[] = [
  {
    id: "entry-0",
    speaker: "system",
    text: "Media workspace is ready.",
    createdAt: Date.now(),
  },
  {
    id: "entry-1",
    speaker: "assistant",
    text: "Realtime voice is available when the Worker has OPENAI_API_KEY configured.",
    createdAt: Date.now(),
  },
] as const;

const phaseLabels: Record<AssistantPhase, string> = {
  idle: "Waiting",
  ready: "Media ready",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  responding: "Responding",
  error: "Action needed",
};

const mediaLabels: Record<MediaPermissionStatus, string> = {
  idle: "Not granted",
  requesting: "Requesting",
  granted: "Granted",
  denied: "Denied",
  unsupported: "Unsupported",
  error: "Error",
};

const realtimeLabels: Record<RealtimeConnectionStatus, string> = {
  idle: "Not connected",
  "creating-session": "Creating session",
  connecting: "Connecting",
  connected: "Connected",
  error: "Error",
};

const turnDetectionLabels: Record<RealtimeTurnDetectionMode, string> = {
  "server-vad": "Server VAD",
  "push-to-talk": "Push-to-talk",
};

const turnDetectionOptions: readonly {
  value: RealtimeTurnDetectionMode;
  label: string;
}[] = [
  {
    value: "server-vad",
    label: "Server VAD",
  },
  {
    value: "push-to-talk",
    label: "Push-to-talk",
  },
] as const;

const responseBudgetLabels: Record<RealtimeResponseBudget, string> = {
  brief: "Brief",
  standard: "Standard",
  detailed: "Detailed",
};

const responseBudgetOptions: readonly {
  value: RealtimeResponseBudget;
  label: string;
}[] = [
  {
    value: "brief",
    label: "Brief",
  },
  {
    value: "standard",
    label: "Standard",
  },
  {
    value: "detailed",
    label: "Detailed",
  },
] as const;

const responseModeLabels: Record<RealtimeResponseMode, string> = {
  "audio-text": "Audio + text",
  "text-only": "Text only",
};

function formatEntryTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
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
    return "You";
  }

  return "System";
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
    ? "Mic off"
    : isMicrophoneMuted
      ? "Mic muted"
      : isPushToTalkMode
        ? isPushToTalkActive
          ? "PTT live"
          : "PTT idle"
        : "Mic armed";
  const costControls: readonly CostControlSetting[] = [
    {
      label: "Frame budget",
      value:
        realtimeState.costPolicy?.visualContextMode ??
        (isAutoSampling ? "interval" : "manual"),
      detail: "Video frames are sampled, not streamed continuously.",
    },
    {
      label: "Session cap",
      value: realtimeState.costPolicy
        ? `${Math.round(realtimeState.costPolicy.maxSessionSeconds / 60)} min`
        : "10 min",
      detail: "The browser closes long Realtime sessions automatically.",
    },
    {
      label: "Idle close",
      value: `${Math.round(REALTIME_IDLE_DISCONNECT_MS / 1000)}s`,
      detail: `Warns after ${Math.round(
        REALTIME_IDLE_WARNING_MS / 1000,
      )}s without speech, text, frames, or responses.`,
    },
    {
      label: "Response cap",
      value: realtimeState.costPolicy
        ? `${responseBudgetLabels[activeResponseBudget]} / ${formatTokens(
            realtimeState.costPolicy.maxResponseOutputTokens,
          )}`
        : responseBudgetLabels[activeResponseBudget],
      detail: "The Worker caps max response output tokens.",
    },
    {
      label: "Response mode",
      value: responseModeLabels[responseMode],
      detail:
        responseMode === "text-only"
          ? "Responses skip assistant audio output."
          : "Responses include assistant audio and transcript text.",
    },
    {
      label: "Cloud key",
      value: "server",
      detail: "Permanent model keys stay in the Worker.",
    },
    {
      label: "Voice turn",
      value: turnDetectionLabels[activeTurnDetectionMode],
      detail:
        activeTurnDetectionMode === "push-to-talk"
          ? "Audio turns are committed only from the hold control."
          : "Server VAD can answer hands-free speech.",
    },
    {
      label: "Microphone",
      value: microphoneStatusLabel,
      detail: isMicrophoneMuted
        ? "The local audio track is disabled."
        : "The local audio track follows the active turn mode.",
    },
    {
      label: "Auto diff",
      value: `${Math.round(FRAME_DIFF_SEND_THRESHOLD * 100)}%`,
      detail: "Interval uploads skip frames below this luma change.",
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
          addTranscript("system", "No camera frame is available to sample yet.");
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
          addTranscript("system", "The browser could not create a frame canvas.");
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
            "The browser could not analyze the current camera frame.",
          );
        }

        return null;
      }

      const frameDataUrl = canvasElement.toDataURL("image/jpeg", 0.72);
      setLastFrameDataUrl(frameDataUrl);
      setSampledFrameCount((currentCount) => currentCount + 1);

      if (source === "manual") {
        addTranscript("system", "Sampled one visual context frame.");
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
      addTranscript("system", "Session stopped. Media permission remains available.");
    }

    setAssistantPhase(mediaState.status === "granted" ? "ready" : "idle");
  }, [
    addTranscript,
    hasActiveSession,
    hasRealtimeConnection,
    mediaState.status,
    stopRealtimeSession,
  ]);

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
          "Background visual context refresh. Use this sampled camera frame as context for the next answer, but do not respond yet.",
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
    addTranscript("system", "Camera and microphone tracks were released.");
  };

  const handleStartSession = (): void => {
    if (mediaState.status !== "granted") {
      setAssistantPhase("error");
      addTranscript("system", "Grant camera and microphone access first.");
      return;
    }

    addTranscript("system", "Creating a key-safe Realtime session.");
    lastUploadedFrameSignatureRef.current = null;
    setSentFrameCount(0);
    setSkippedAutoFrameCount(0);
    void startRealtimeSession({
      visualContextMode: isAutoSampling ? "interval" : "manual",
      turnDetectionMode,
      responseBudget,
      instructions:
        "You are a concise visual dialogue assistant. Use microphone audio for conversation and use sampled camera frames only when the client sends them.",
    });
  };

  const handleRealtimeTurn = (): void => {
    if (assistantPhase !== "listening" || !hasRealtimeConnection) {
      return;
    }

    const capturedFrame = captureFrame("manual");

    if (capturedFrame === null) {
      return;
    }

    const prompt = "Describe what I should pay attention to in the current scene.";
    addTranscript("user", prompt);

    const sent = sendVisualContext({
      frameDataUrl: capturedFrame.frameDataUrl,
      prompt,
      requestResponse: true,
    });

    if (sent) {
      recordUploadedFrame(capturedFrame.signature);
      addTranscript("system", "Sent one sampled frame to the Realtime model.");
      return;
    }

    setAssistantPhase("error");
    addTranscript("system", "Realtime data channel is not ready for visual context.");
  };

  const handleManualFrameCapture = (): void => {
    const capturedFrame = captureFrame("manual");

    if (capturedFrame !== null && hasRealtimeConnection) {
      const sent = sendVisualContext({
        frameDataUrl: capturedFrame.frameDataUrl,
        prompt:
          "Use this sampled camera frame as visual context for the next answer. Do not respond yet.",
        requestResponse: false,
      });

      if (sent) {
        recordUploadedFrame(capturedFrame.signature);
        addTranscript("system", "Sent sampled frame as Realtime visual context.");
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

    if (!hasRealtimeConnection) {
      addTranscript(
        "system",
        "Start a Realtime session before sending text messages.",
      );
      return;
    }

    const sent = sendTextMessage(message);

    if (!sent) {
      addTranscript("system", "Realtime data channel is not ready for text input.");
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
    hasMedia &&
    !hasActiveSession &&
    realtimeState.status !== "creating-session" &&
    realtimeState.status !== "connecting" &&
    !hasRealtimeConnection;
  const canChangeTurnMode =
    !hasActiveSession &&
    realtimeState.status !== "creating-session" &&
    realtimeState.status !== "connecting" &&
    !hasRealtimeConnection;
  const canChangeResponseBudget = canChangeTurnMode;
  const canRealtimeTurn = assistantPhase === "listening" && hasRealtimeConnection;
  const canPushToTalk =
    assistantPhase === "listening" &&
    hasRealtimeConnection &&
    isPushToTalkMode &&
    !isMicrophoneMuted;
  const canStopSession =
    hasActiveSession ||
    hasRealtimeConnection ||
    realtimeState.status === "creating-session" ||
    realtimeState.status === "connecting";
  const visibleError = mediaState.errorMessage ?? realtimeState.errorMessage;
  const realtimeDetail =
    realtimeState.peerConnectionState === null
      ? "Worker-issued client secret required"
      : `Peer ${realtimeState.peerConnectionState}`;

  return (
    <main className="assistant-shell">
      <section className="session-column" aria-labelledby="assistant-title">
        <div className="product-header">
          <div className="brand-mark" aria-hidden="true">
            <Radio size={25} strokeWidth={2.2} />
          </div>
          <div>
            <p className="eyebrow">AI visual dialogue</p>
            <h1 id="assistant-title">Visual Dialogue Assistant</h1>
          </div>
        </div>

        <div className="state-panel" aria-label="Session state">
          <div className="state-ring" data-phase={assistantPhase}>
            <span>{phaseLabels[assistantPhase]}</span>
          </div>
          <div className="state-copy">
            <p>Media</p>
            <strong>{mediaLabels[mediaState.status]}</strong>
            <span>{hasMedia ? "Camera + microphone live" : "Waiting for device access"}</span>
            <p>Realtime</p>
            <strong>{realtimeLabels[realtimeState.status]}</strong>
            <span>
              {hasRealtimeConnection
                ? "Voice transport and data channel ready"
                : realtimeDetail}
            </span>
          </div>
        </div>

        {visibleError ? (
          <p className="error-banner" role="alert">
            {visibleError}
          </p>
        ) : null}

        <div className="control-grid" aria-label="Session controls">
          <button
            className="control-button primary"
            type="button"
            onClick={handleRequestAccess}
            disabled={mediaState.status === "requesting"}
          >
            <Camera size={18} aria-hidden="true" />
            <span>{hasMedia ? "Refresh media" : "Allow media"}</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={handleStartSession}
            disabled={!canStartSession}
          >
            <Play size={18} aria-hidden="true" />
            <span>
              {realtimeState.status === "creating-session" ||
              realtimeState.status === "connecting"
                ? "Connecting"
                : "Start session"}
            </span>
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
            <span>{isPushToTalkActive ? "Speaking" : "Hold to talk"}</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={handleRealtimeTurn}
            disabled={!canRealtimeTurn}
          >
            <Sparkles size={18} aria-hidden="true" />
            <span>Ask with frame</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={handleManualFrameCapture}
            disabled={!hasMedia}
          >
            <ImageIcon size={18} aria-hidden="true" />
            <span>Sample frame</span>
          </button>

          <button
            className="control-button danger"
            type="button"
            onClick={stopSession}
            disabled={!canStopSession}
          >
            <CircleStop size={18} aria-hidden="true" />
            <span>Stop session</span>
          </button>
        </div>

        <button
          className="release-button"
          type="button"
          onClick={handleReleaseMedia}
          disabled={!hasMedia}
        >
          <RefreshCcw size={17} aria-hidden="true" />
          Release camera and microphone
        </button>

        <div className="cost-panel" aria-label="Cost controls">
          <div className="panel-heading">
            <Gauge size={18} aria-hidden="true" />
            <span>Cost controls</span>
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

          <div className="voice-controls" aria-label="Voice input settings">
            <fieldset className="mode-segment" disabled={!canChangeTurnMode}>
              <legend>Turn mode</legend>
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
              <span>{isMicrophoneMuted ? "Microphone muted" : "Microphone live"}</span>
            </label>
          </div>

          <div className="response-controls" aria-label="Response output settings">
            <fieldset className="mode-segment" disabled={!canChangeResponseBudget}>
              <legend>Response budget</legend>
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

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={responseMode === "text-only"}
                onChange={handleResponseModeChange}
              />
              <span>
                {responseMode === "text-only"
                  ? "Text-only responses"
                  : "Audio + text responses"}
              </span>
            </label>
          </div>

          <div className="sampling-controls" aria-label="Frame sampling settings">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={isAutoSampling}
                onChange={handleAutoSamplingChange}
                disabled={!hasMedia}
              />
              <span>Low-frequency auto sampling</span>
            </label>

            <label className="range-row">
              <span>Interval</span>
              <input
                type="range"
                min="5"
                max="20"
                step="1"
                value={samplingIntervalSeconds}
                onChange={handleSamplingIntervalChange}
                disabled={!hasMedia || !isAutoSampling}
              />
              <strong>{samplingIntervalSeconds}s</strong>
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={isFramePruningEnabled}
                onChange={handleFramePruningChange}
              />
              <span>Prune consumed frames from history</span>
            </label>
          </div>
        </div>

        <div className="usage-panel" aria-label="Realtime usage meter">
          <div className="usage-heading-row">
            <div className="panel-heading">
              <Activity size={18} aria-hidden="true" />
              <span>Usage meter</span>
            </div>
            <div className="usage-export-actions" aria-label="Usage export">
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
              <dt>Turns</dt>
              <dd>{usageReport.turnCount}</dd>
            </div>
            <div>
              <dt>Est. cost</dt>
              <dd>{formatUsd(usageReport.estimatedCostUsd)}</dd>
            </div>
            <div>
              <dt>Last turn input</dt>
              <dd>
                {usageReport.lastTurn
                  ? formatTokens(usageReport.lastTurn.inputTokens)
                  : "-"}
              </dd>
            </div>
          </dl>

          <dl className="usage-breakdown">
            <div>
              <dt>Audio in</dt>
              <dd>{formatTokens(usageReport.totals.inputAudioTokens)}</dd>
            </div>
            <div>
              <dt>Image in</dt>
              <dd>{formatTokens(usageReport.totals.inputImageTokens)}</dd>
            </div>
            <div>
              <dt>Text in</dt>
              <dd>{formatTokens(usageReport.totals.inputTextTokens)}</dd>
            </div>
            <div>
              <dt>Cached in</dt>
              <dd>{formatTokens(usageReport.totals.cachedInputTokens)}</dd>
            </div>
            <div>
              <dt>Audio out</dt>
              <dd>{formatTokens(usageReport.totals.outputAudioTokens)}</dd>
            </div>
            <div>
              <dt>Text out</dt>
              <dd>{formatTokens(usageReport.totals.outputTextTokens)}</dd>
            </div>
          </dl>

          <p className="usage-note">
            Token usage is reported by the Realtime API per response. Each turn
            re-bills the conversation history as input, so a growing last-turn
            input means context is snowballing. Cost is an estimate.
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
            aria-label="Live camera preview"
          />
          <audio
            ref={audioRef}
            className="remote-audio"
            autoPlay
            aria-label="Assistant audio response"
          />

          {!hasMedia ? (
            <div className="camera-empty">
              <Video size={34} aria-hidden="true" />
              <h2 id="vision-title">Waiting for video</h2>
              <p>Live camera preview appears after media permission is granted.</p>
            </div>
          ) : null}

          <div className="camera-hud" aria-label="Live device status">
            <span>
              <Camera size={15} aria-hidden="true" />
              {hasMedia ? "Camera live" : "Camera off"}
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

        <div className="visual-context-panel" aria-label="Sampled visual context">
          <div className="panel-heading">
            <ImageIcon size={18} aria-hidden="true" />
            <span>Visual context</span>
          </div>

          <div className="frame-sample">
            {lastFrameDataUrl ? (
              <img src={lastFrameDataUrl} alt="Last sampled camera frame" />
            ) : (
              <div className="frame-placeholder">
                <ImageIcon size={22} aria-hidden="true" />
                <span>No sampled frame</span>
              </div>
            )}
          </div>

          <dl className="frame-stats">
            <div>
              <dt>Sampled</dt>
              <dd>{sampledFrameCount}</dd>
            </div>
            <div>
              <dt>Sent</dt>
              <dd>{sentFrameCount}</dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd>{skippedAutoFrameCount}</dd>
            </div>
            <div>
              <dt>Pruned</dt>
              <dd>{prunedFrameCount}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{isAutoSampling ? `${samplingIntervalSeconds}s` : "manual"}</dd>
            </div>
          </dl>
        </div>

        <div className="dialogue-board" aria-label="Dialogue transcript">
          <div className="panel-heading">
            <Volume2 size={18} aria-hidden="true" />
            <span>Dialogue stream</span>
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
            aria-label="Send a text message"
          >
            <input
              type="text"
              value={textDraft}
              onChange={handleTextDraftChange}
              placeholder={
                hasRealtimeConnection
                  ? "Type a message to the assistant"
                  : "Start a session to send text"
              }
              disabled={!hasRealtimeConnection}
              aria-label="Text message to the assistant"
            />
            <button
              type="submit"
              disabled={!hasRealtimeConnection || textDraft.trim().length === 0}
              aria-label="Send text message"
            >
              <Send size={16} aria-hidden="true" />
              <span>Send</span>
            </button>
          </form>
        </div>

        <aside className="security-strip" aria-label="Key protection">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>Permanent model keys stay out of the browser.</span>
        </aside>

        <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true" />
      </section>
    </main>
  );
}
