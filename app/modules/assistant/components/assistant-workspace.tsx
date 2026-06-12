import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CircleStop,
  Gauge,
  Image as ImageIcon,
  Mic,
  Play,
  Radio,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Video,
  Volume2,
} from "lucide-react";

import { useMediaCapture } from "@/modules/assistant/hooks/use-media-capture";
import { useRealtimeSession } from "@/modules/assistant/hooks/use-realtime-session";
import type {
  AssistantPhase,
  CostControlSetting,
  MediaPermissionStatus,
  RealtimeConnectionStatus,
  TranscriptEntry,
  TranscriptSpeaker,
} from "@/modules/assistant/types";

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

export function AssistantWorkspace(): React.JSX.Element {
  const { mediaState, requestAccess, stopAccess, stream } = useMediaCapture();
  const [assistantPhase, setAssistantPhase] = useState<AssistantPhase>("idle");
  const [transcript, setTranscript] = useState<readonly TranscriptEntry[]>(
    initialTranscript,
  );
  const [lastFrameDataUrl, setLastFrameDataUrl] = useState<string | null>(null);
  const [sampledFrameCount, setSampledFrameCount] = useState(0);
  const [isAutoSampling, setIsAutoSampling] = useState(false);
  const [samplingIntervalSeconds, setSamplingIntervalSeconds] = useState(8);
  const nextEntryIdRef = useRef(initialTranscript.length);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    startSession: startRealtimeSession,
    stopSession: stopRealtimeSession,
    sendVisualContext,
  } = useRealtimeSession({
    stream,
    onTranscript: addTranscript,
    onPhaseChange: handleRealtimePhaseChange,
  });

  const hasRealtimeConnection = realtimeState.status === "connected";
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
      label: "Cloud key",
      value: "server",
      detail: "Permanent model keys stay in the Worker.",
    },
  ] as const;

  const captureFrame = useCallback(
    (source: "manual" | "auto"): string | null => {
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
      const frameDataUrl = canvasElement.toDataURL("image/jpeg", 0.72);
      setLastFrameDataUrl(frameDataUrl);
      setSampledFrameCount((currentCount) => currentCount + 1);

      if (source === "manual") {
        addTranscript("system", "Sampled one visual context frame.");
      }

      return frameDataUrl;
    },
    [addTranscript, hasMedia],
  );

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
    if (!isAutoSampling || !hasActiveSession || !hasMedia) {
      return;
    }

    const timerId = window.setInterval(() => {
      const frameDataUrl = captureFrame("auto");

      if (frameDataUrl !== null && hasRealtimeConnection) {
        sendVisualContext({
          frameDataUrl,
          prompt:
            "Background visual context refresh. Use this sampled camera frame as context for the next answer, but do not respond yet.",
          requestResponse: false,
        });
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
    addTranscript("system", "Camera and microphone tracks were released.");
  };

  const handleStartSession = (): void => {
    if (mediaState.status !== "granted") {
      setAssistantPhase("error");
      addTranscript("system", "Grant camera and microphone access first.");
      return;
    }

    addTranscript("system", "Creating a key-safe Realtime session.");
    void startRealtimeSession({
      visualContextMode: isAutoSampling ? "interval" : "manual",
      instructions:
        "You are a concise visual dialogue assistant. Use microphone audio for conversation and use sampled camera frames only when the client sends them.",
    });
  };

  const handleRealtimeTurn = (): void => {
    if (assistantPhase !== "listening" || !hasRealtimeConnection) {
      return;
    }

    const frameDataUrl = captureFrame("manual");

    if (frameDataUrl === null) {
      return;
    }

    const prompt = "Describe what I should pay attention to in the current scene.";
    addTranscript("user", prompt);

    const sent = sendVisualContext({
      frameDataUrl,
      prompt,
      requestResponse: true,
    });

    if (sent) {
      addTranscript("system", "Sent one sampled frame to the Realtime model.");
      return;
    }

    setAssistantPhase("error");
    addTranscript("system", "Realtime data channel is not ready for visual context.");
  };

  const handleManualFrameCapture = (): void => {
    const frameDataUrl = captureFrame("manual");

    if (frameDataUrl !== null && hasRealtimeConnection) {
      const sent = sendVisualContext({
        frameDataUrl,
        prompt:
          "Use this sampled camera frame as visual context for the next answer. Do not respond yet.",
        requestResponse: false,
      });

      if (sent) {
        addTranscript("system", "Sent sampled frame as Realtime visual context.");
      }
    }
  };

  const handleAutoSamplingChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    setIsAutoSampling(event.currentTarget.checked);
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
  const canRealtimeTurn = assistantPhase === "listening" && hasRealtimeConnection;
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
          </div>
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
              <Mic size={15} aria-hidden="true" />
              {hasMedia ? "Mic armed" : "Mic off"}
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
              <dt>Frames</dt>
              <dd>{sampledFrameCount}</dd>
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
