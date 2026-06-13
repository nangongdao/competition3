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
    text: "媒体工作区已就绪。",
    createdAt: Date.now(),
  },
  {
    id: "entry-1",
    speaker: "assistant",
    text: "Worker 配置 OPENAI_API_KEY 后即可启用 Realtime 语音对话。",
    createdAt: Date.now(),
  },
] as const;

const phaseLabels: Record<AssistantPhase, string> = {
  idle: "等待中",
  ready: "媒体已就绪",
  connecting: "连接中",
  listening: "聆听中",
  thinking: "思考中",
  responding: "回复中",
  error: "需要处理",
};

const mediaLabels: Record<MediaPermissionStatus, string> = {
  idle: "未授权",
  requesting: "请求中",
  granted: "已授权",
  denied: "已拒绝",
  unsupported: "不支持",
  error: "错误",
};

const realtimeLabels: Record<RealtimeConnectionStatus, string> = {
  idle: "未连接",
  "creating-session": "创建会话",
  connecting: "连接中",
  connected: "已连接",
  error: "错误",
};

const turnDetectionLabels: Record<RealtimeTurnDetectionMode, string> = {
  "server-vad": "服务器 VAD",
  "push-to-talk": "按住说话",
};

const turnDetectionOptions: readonly {
  value: RealtimeTurnDetectionMode;
  label: string;
}[] = [
  {
    value: "server-vad",
    label: "服务器 VAD",
  },
  {
    value: "push-to-talk",
    label: "按住说话",
  },
] as const;

const responseBudgetLabels: Record<RealtimeResponseBudget, string> = {
  brief: "简短",
  standard: "标准",
  detailed: "详细",
};

const responseBudgetOptions: readonly {
  value: RealtimeResponseBudget;
  label: string;
}[] = [
  {
    value: "brief",
    label: "简短",
  },
  {
    value: "standard",
    label: "标准",
  },
  {
    value: "detailed",
    label: "详细",
  },
] as const;

const responseModeLabels: Record<RealtimeResponseMode, string> = {
  "audio-text": "语音+文字",
  "text-only": "仅文字",
};

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
    return "你";
  }

  return "系统";
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
    ? "麦克风关闭"
    : isMicrophoneMuted
      ? "麦克风已静音"
      : isPushToTalkMode
        ? isPushToTalkActive
          ? "按住说话中"
          : "等待按住说话"
        : "麦克风已启用";
  const costControls: readonly CostControlSetting[] = [
    {
      label: "画面预算",
      value:
        realtimeState.costPolicy?.visualContextMode ??
        (isAutoSampling ? "定时采样" : "手动采样"),
      detail: "只采样关键画面，不连续上传原始视频。",
    },
    {
      label: "会话上限",
      value: realtimeState.costPolicy
        ? `${Math.round(realtimeState.costPolicy.maxSessionSeconds / 60)} 分钟`
        : "10 分钟",
      detail: "浏览器会自动关闭过长的 Realtime 会话。",
    },
    {
      label: "空闲关闭",
      value: `${Math.round(REALTIME_IDLE_DISCONNECT_MS / 1000)} 秒`,
      detail: `${Math.round(
        REALTIME_IDLE_WARNING_MS / 1000,
      )} 秒无语音、文字、画面或回复后提醒。`,
    },
    {
      label: "回复上限",
      value: realtimeState.costPolicy
        ? `${responseBudgetLabels[activeResponseBudget]} / ${formatTokens(
            realtimeState.costPolicy.maxResponseOutputTokens,
          )}`
        : responseBudgetLabels[activeResponseBudget],
      detail: "Worker 会限制单次回复的最大输出 token。",
    },
    {
      label: "回复模式",
      value: responseModeLabels[responseMode],
      detail:
        responseMode === "text-only"
          ? "回复不生成助手语音输出。"
          : "回复包含助手语音和转写文字。",
    },
    {
      label: "云端密钥",
      value: "服务端",
      detail: "长期模型密钥只保存在 Worker 中。",
    },
    {
      label: "语音轮次",
      value: turnDetectionLabels[activeTurnDetectionMode],
      detail:
        activeTurnDetectionMode === "push-to-talk"
          ? "只有按住说话控件会提交语音轮次。"
          : "服务器 VAD 可自动识别免手动语音。",
    },
    {
      label: "麦克风",
      value: microphoneStatusLabel,
      detail: isMicrophoneMuted
        ? "本地音频轨道已禁用。"
        : "本地音频轨道跟随当前语音模式。",
    },
    {
      label: "自动差分",
      value: `${Math.round(FRAME_DIFF_SEND_THRESHOLD * 100)}%`,
      detail: "定时上传会跳过低于该亮度变化的画面。",
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
          addTranscript("system", "当前还没有可采样的摄像头画面。");
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
          addTranscript("system", "浏览器无法创建画面采样画布。");
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
            "浏览器无法分析当前摄像头画面。",
          );
        }

        return null;
      }

      const frameDataUrl = canvasElement.toDataURL("image/jpeg", 0.72);
      setLastFrameDataUrl(frameDataUrl);
      setSampledFrameCount((currentCount) => currentCount + 1);

      if (source === "manual") {
        addTranscript("system", "已采样一帧视觉上下文。");
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
      addTranscript("system", "会话已停止，媒体权限仍然可用。");
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
          "后台视觉上下文刷新。请把这帧摄像头画面作为下一次回答的上下文，但暂时不要回复。",
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
    addTranscript("system", "摄像头和麦克风轨道已释放。");
  };

  const handleStartSession = (): void => {
    if (mediaState.status !== "granted") {
      setAssistantPhase("error");
      addTranscript("system", "请先授权摄像头和麦克风。");
      return;
    }

    addTranscript("system", "正在创建密钥安全的 Realtime 会话。");
    lastUploadedFrameSignatureRef.current = null;
    setSentFrameCount(0);
    setSkippedAutoFrameCount(0);
    void startRealtimeSession({
      visualContextMode: isAutoSampling ? "interval" : "manual",
      turnDetectionMode,
      responseBudget,
      instructions:
        "你是一个简洁的中文视觉对话助手。使用麦克风音频进行对话，仅在客户端发送采样摄像头画面时使用视觉上下文。",
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

    const prompt = "请描述当前画面中我应该注意什么。";
    addTranscript("user", prompt);

    const sent = sendVisualContext({
      frameDataUrl: capturedFrame.frameDataUrl,
      prompt,
      requestResponse: true,
    });

    if (sent) {
      recordUploadedFrame(capturedFrame.signature);
      addTranscript("system", "已向 Realtime 模型发送一帧采样画面。");
      return;
    }

    setAssistantPhase("error");
    addTranscript("system", "Realtime 数据通道还不能发送视觉上下文。");
  };

  const handleManualFrameCapture = (): void => {
    const capturedFrame = captureFrame("manual");

    if (capturedFrame !== null && hasRealtimeConnection) {
      const sent = sendVisualContext({
        frameDataUrl: capturedFrame.frameDataUrl,
        prompt:
          "请把这帧摄像头画面作为下一次回答的视觉上下文，暂时不要回复。",
        requestResponse: false,
      });

      if (sent) {
        recordUploadedFrame(capturedFrame.signature);
        addTranscript("system", "已将采样画面发送为 Realtime 视觉上下文。");
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
        "请先启动 Realtime 会话，再发送文字消息。",
      );
      return;
    }

    const sent = sendTextMessage(message);

    if (!sent) {
      addTranscript("system", "Realtime 数据通道还不能发送文字输入。");
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
      ? "需要 Worker 签发的临时客户端密钥"
      : `连接状态：${realtimeState.peerConnectionState}`;

  return (
    <main className="assistant-shell">
      <section className="session-column" aria-labelledby="assistant-title">
        <div className="product-header">
          <div className="brand-mark" aria-hidden="true">
            <Radio size={25} strokeWidth={2.2} />
          </div>
          <div>
            <p className="eyebrow">AI 视觉对话</p>
            <h1 id="assistant-title">视觉对话助手</h1>
          </div>
        </div>

        <div className="state-panel" aria-label="会话状态">
          <div className="state-ring" data-phase={assistantPhase}>
            <span>{phaseLabels[assistantPhase]}</span>
          </div>
          <div className="state-copy">
            <p>媒体</p>
            <strong>{mediaLabels[mediaState.status]}</strong>
            <span>{hasMedia ? "摄像头和麦克风已开启" : "等待设备授权"}</span>
            <p>Realtime</p>
            <strong>{realtimeLabels[realtimeState.status]}</strong>
            <span>
              {hasRealtimeConnection
                ? "语音传输和数据通道已就绪"
                : realtimeDetail}
            </span>
          </div>
        </div>

        {visibleError ? (
          <p className="error-banner" role="alert">
            {visibleError}
          </p>
        ) : null}

        <div className="control-grid" aria-label="会话控制">
          <button
            className="control-button primary"
            type="button"
            onClick={handleRequestAccess}
            disabled={mediaState.status === "requesting"}
          >
            <Camera size={18} aria-hidden="true" />
            <span>{hasMedia ? "刷新媒体" : "授权媒体"}</span>
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
                ? "连接中"
                : "开始会话"}
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
            <span>{isPushToTalkActive ? "正在说话" : "按住说话"}</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={handleRealtimeTurn}
            disabled={!canRealtimeTurn}
          >
            <Sparkles size={18} aria-hidden="true" />
            <span>发送画面提问</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={handleManualFrameCapture}
            disabled={!hasMedia}
          >
            <ImageIcon size={18} aria-hidden="true" />
            <span>采样画面</span>
          </button>

          <button
            className="control-button danger"
            type="button"
            onClick={stopSession}
            disabled={!canStopSession}
          >
            <CircleStop size={18} aria-hidden="true" />
            <span>停止会话</span>
          </button>
        </div>

        <button
          className="release-button"
          type="button"
          onClick={handleReleaseMedia}
          disabled={!hasMedia}
        >
          <RefreshCcw size={17} aria-hidden="true" />
          释放摄像头和麦克风
        </button>

        <div className="cost-panel" aria-label="成本控制">
          <div className="panel-heading">
            <Gauge size={18} aria-hidden="true" />
            <span>成本控制</span>
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

          <div className="voice-controls" aria-label="语音输入设置">
            <fieldset className="mode-segment" disabled={!canChangeTurnMode}>
              <legend>语音模式</legend>
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
              <span>{isMicrophoneMuted ? "麦克风已静音" : "麦克风开启"}</span>
            </label>
          </div>

          <div className="response-controls" aria-label="回复输出设置">
            <fieldset className="mode-segment" disabled={!canChangeResponseBudget}>
              <legend>回复预算</legend>
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
                  ? "仅文字回复"
                  : "语音+文字回复"}
              </span>
            </label>
          </div>

          <div className="sampling-controls" aria-label="画面采样设置">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={isAutoSampling}
                onChange={handleAutoSamplingChange}
                disabled={!hasMedia}
              />
              <span>低频自动采样</span>
            </label>

            <label className="range-row">
              <span>间隔</span>
              <input
                type="range"
                min="5"
                max="20"
                step="1"
                value={samplingIntervalSeconds}
                onChange={handleSamplingIntervalChange}
                disabled={!hasMedia || !isAutoSampling}
              />
              <strong>{samplingIntervalSeconds} 秒</strong>
            </label>

            <label className="toggle-row">
              <input
                type="checkbox"
                checked={isFramePruningEnabled}
                onChange={handleFramePruningChange}
              />
              <span>从历史中裁剪已消费画面</span>
            </label>
          </div>
        </div>

        <div className="usage-panel" aria-label="Realtime 用量计">
          <div className="usage-heading-row">
            <div className="panel-heading">
              <Activity size={18} aria-hidden="true" />
              <span>用量计</span>
            </div>
            <div className="usage-export-actions" aria-label="用量导出">
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
              <dt>轮次</dt>
              <dd>{usageReport.turnCount}</dd>
            </div>
            <div>
              <dt>预估成本</dt>
              <dd>{formatUsd(usageReport.estimatedCostUsd)}</dd>
            </div>
            <div>
              <dt>上轮输入</dt>
              <dd>
                {usageReport.lastTurn
                  ? formatTokens(usageReport.lastTurn.inputTokens)
                  : "-"}
              </dd>
            </div>
          </dl>

          <dl className="usage-breakdown">
            <div>
              <dt>音频输入</dt>
              <dd>{formatTokens(usageReport.totals.inputAudioTokens)}</dd>
            </div>
            <div>
              <dt>图像输入</dt>
              <dd>{formatTokens(usageReport.totals.inputImageTokens)}</dd>
            </div>
            <div>
              <dt>文字输入</dt>
              <dd>{formatTokens(usageReport.totals.inputTextTokens)}</dd>
            </div>
            <div>
              <dt>缓存输入</dt>
              <dd>{formatTokens(usageReport.totals.cachedInputTokens)}</dd>
            </div>
            <div>
              <dt>音频输出</dt>
              <dd>{formatTokens(usageReport.totals.outputAudioTokens)}</dd>
            </div>
            <div>
              <dt>文字输出</dt>
              <dd>{formatTokens(usageReport.totals.outputTextTokens)}</dd>
            </div>
          </dl>

          <p className="usage-note">
            Token 用量由 Realtime API 按回复上报。每一轮都会把对话历史重新计为输入，
            因此上轮输入持续增长代表上下文成本正在滚大。成本为估算值。
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
            aria-label="实时摄像头预览"
          />
          <audio
            ref={audioRef}
            className="remote-audio"
            autoPlay
            aria-label="助手语音回复"
          />

          {!hasMedia ? (
            <div className="camera-empty">
              <Video size={34} aria-hidden="true" />
              <h2 id="vision-title">等待视频</h2>
              <p>授权媒体权限后会显示实时摄像头预览。</p>
            </div>
          ) : null}

          <div className="camera-hud" aria-label="实时设备状态">
            <span>
              <Camera size={15} aria-hidden="true" />
              {hasMedia ? "摄像头开启" : "摄像头关闭"}
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

        <div className="visual-context-panel" aria-label="已采样视觉上下文">
          <div className="panel-heading">
            <ImageIcon size={18} aria-hidden="true" />
            <span>视觉上下文</span>
          </div>

          <div className="frame-sample">
            {lastFrameDataUrl ? (
              <img src={lastFrameDataUrl} alt="最近采样的摄像头画面" />
            ) : (
              <div className="frame-placeholder">
                <ImageIcon size={22} aria-hidden="true" />
                <span>暂无采样画面</span>
              </div>
            )}
          </div>

          <dl className="frame-stats">
            <div>
              <dt>已采样</dt>
              <dd>{sampledFrameCount}</dd>
            </div>
            <div>
              <dt>已发送</dt>
              <dd>{sentFrameCount}</dd>
            </div>
            <div>
              <dt>已跳过</dt>
              <dd>{skippedAutoFrameCount}</dd>
            </div>
            <div>
              <dt>已裁剪</dt>
              <dd>{prunedFrameCount}</dd>
            </div>
            <div>
              <dt>模式</dt>
              <dd>{isAutoSampling ? `${samplingIntervalSeconds} 秒` : "手动"}</dd>
            </div>
          </dl>
        </div>

        <div className="dialogue-board" aria-label="对话记录">
          <div className="panel-heading">
            <Volume2 size={18} aria-hidden="true" />
            <span>对话流</span>
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
            aria-label="发送文字消息"
          >
            <input
              type="text"
              value={textDraft}
              onChange={handleTextDraftChange}
              placeholder={
                hasRealtimeConnection
                  ? "输入要发送给助手的消息"
                  : "启动会话后可发送文字"
              }
              disabled={!hasRealtimeConnection}
              aria-label="发给助手的文字消息"
            />
            <button
              type="submit"
              disabled={!hasRealtimeConnection || textDraft.trim().length === 0}
              aria-label="发送文字消息"
            >
              <Send size={16} aria-hidden="true" />
              <span>发送</span>
            </button>
          </form>
        </div>

        <aside className="security-strip" aria-label="密钥保护">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>长期模型密钥不会进入浏览器。</span>
        </aside>

        <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true" />
      </section>
    </main>
  );
}
