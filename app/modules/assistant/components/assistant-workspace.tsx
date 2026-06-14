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
import { useWorkerSpeechTranscription } from "@/modules/assistant/hooks/use-worker-speech-transcription";
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
    text: "系统已就绪。",
    createdAt: Date.now(),
  },
  {
    id: "entry-1",
    speaker: "assistant",
    text: "Worker 会安全保管 OPENAI_API_KEY 和 OPENAI_CHAT_MODEL。你可以使用 Chat Completions，也可以切换到 Realtime 模式进行低延迟语音对话。",
    createdAt: Date.now(),
  },
] as const;

const phaseLabels: Record<AssistantPhase, string> = {
  idle: "空闲",
  ready: "已就绪",
  connecting: "连接中",
  listening: "聆听中",
  thinking: "思考中",
  responding: "回应中",
  error: "需处理",
};

const mediaLabels: Record<MediaPermissionStatus, string> = {
  idle: "未授权",
  requesting: "请求中",
  granted: "已授权",
  denied: "已拒绝",
  unsupported: "不支持",
  error: "异常",
};

const realtimeLabels: Record<RealtimeConnectionStatus, string> = {
  idle: "未连接",
  "creating-session": "创建会话",
  connecting: "连接中",
  connected: "已连接",
  error: "异常",
};

const turnDetectionLabels: Record<RealtimeTurnDetectionMode, string> = {
  "server-vad": "服务端 VAD",
  "push-to-talk": "按住说话",
};

const turnDetectionOptions: readonly {
  value: RealtimeTurnDetectionMode;
  label: string;
}[] = [
  {
    value: "server-vad",
    label: "服务端 VAD",
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

const visualContextModeLabels: Record<"manual" | "interval", string> = {
  manual: "手动发送",
  interval: "自动采样",
};

const responseModeLabels: Record<RealtimeResponseMode, string> = {
  "audio-text": "语音+文本",
  "text-only": "仅文本",
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
    label: "兼容模式",
  },
  {
    value: "realtime",
    label: "Realtime",
  },
] as const;

type ChatVoiceSendMode = "auto-send" | "review";

const chatVoiceSendModeOptions: readonly {
  value: ChatVoiceSendMode;
  label: string;
}[] = [
  {
    value: "auto-send",
    label: "自动发送",
  },
  {
    value: "review",
    label: "先填入",
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
  const [chatVoiceSendMode, setChatVoiceSendMode] =
    useState<ChatVoiceSendMode>("auto-send");
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
      addTranscript("system", "语音识别结果已填入输入框。");
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
    speak: speakChatAnswer,
    cancelSpeech: cancelChatSpeech,
  } = useBrowserSpeechAdapter({
    language: "zh-CN",
    onTranscript: handleChatSpeechTranscript,
    onStatusMessage: handleBrowserSpeechStatus,
  });
  const {
    transcriptionState,
    startRecording: startChatVoiceRecording,
    stopRecording: stopChatVoiceRecording,
    cancelRecording: cancelChatVoiceRecording,
  } = useWorkerSpeechTranscription({
    stream,
    language: "zh",
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
  const isChatVoiceRecording = transcriptionState.status === "recording";
  const isChatVoiceTranscribing = transcriptionState.status === "transcribing";
  const isChatVoiceBusy = isChatVoiceRecording || isChatVoiceTranscribing;
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
    ? "等待授权"
    : isChatMode
      ? isChatVoiceRecording
        ? "正在录音"
        : isChatVoiceTranscribing
          ? "正在转写"
          : transcriptionState.isRecordingSupported
            ? "可语音提问"
            : "不支持录音"
      : isMicrophoneMuted
        ? "麦克风已静音"
        : isPushToTalkMode
          ? isPushToTalkActive
            ? "正在说话"
            : "按住说话"
          : "麦克风已开启";
  const chatSpeechStatusLabel = !transcriptionState.isRecordingSupported
    ? "当前浏览器不支持本地录音，请改用键盘输入。"
    : !hasMedia
      ? "请先授权摄像头和麦克风，再使用语音提问。"
      : isChatVoiceRecording
        ? "正在录音，说完后点击停止并转写。"
        : isChatVoiceTranscribing
          ? "正在通过 Worker 转写语音。"
          : transcriptionState.status === "error"
            ? transcriptionState.errorMessage ?? "语音转写异常。"
            : chatVoiceSendMode === "auto-send"
              ? "录音会先转文字，再自动发送到 Chat。"
              : "录音会先转文字，并填入输入框供你确认。";
  const costControls: readonly CostControlSetting[] = [
    {
      label: "提供方式",
      value: providerModeLabels[providerMode],
      detail: isChatMode
        ? "通过 HTTP 调用 /v1/chat/completions，兼容常见 API 网关"
        : "WebRTC Realtime 直连，适合低延迟语音互动",
    },
    {
      label: "视觉上下文",
      value:
        isChatMode
          ? "按需截帧"
          : visualContextModeLabels[
              realtimeState.costPolicy?.visualContextMode ??
                (isAutoSampling ? "interval" : "manual")
            ],
      detail: isChatMode
        ? "每次提问时只发送一张当前画面"
        : "只发送抽样 JPEG，不连续上传原始视频",
    },
    {
      label: "会话时长",
      value: isChatMode
        ? "按请求结束"
        : realtimeState.costPolicy
        ? `${Math.round(realtimeState.costPolicy.maxSessionSeconds / 60)} 分钟`
        : "10 分钟",
      detail: isChatMode
        ? "Chat Completions 不保持 WebRTC 长连接"
        : "限制单次 Realtime 会话，避免空转成本",
    },
    {
      label: "空闲断开",
      value: `${Math.round(REALTIME_IDLE_DISCONNECT_MS / 1000)} 秒`,
      detail: `${Math.round(
        REALTIME_IDLE_WARNING_MS / 1000,
      )} 秒后提示，长时间无操作会自动断开`,
    },
    {
      label: "回答预算",
      value: realtimeState.costPolicy
        ? `${responseBudgetLabels[activeResponseBudget]} / ${formatTokens(
            realtimeState.costPolicy.maxResponseOutputTokens,
          )}`
        : responseBudgetLabels[activeResponseBudget],
      detail: "Worker 为模型输出设置最大 token 数",
    },
    {
      label: "输出模式",
      value: isChatMode
        ? isChatAnswerSpeechEnabled
          ? "文本+本机朗读"
          : "文本"
        : responseModeLabels[responseMode],
      detail: isChatMode
        ? "Chat 朗读由浏览器完成，不产生模型音频 token"
        : responseMode === "text-only"
          ? "仅请求文本输出，减少音频 token"
          : "同时请求语音和文本回复",
    },
    {
      label: "密钥位置",
      value: "服务器端",
      detail: "永久密钥只保存在 Worker 环境变量中",
    },
    {
      label: "轮次触发",
      value: isChatMode
        ? transcriptionState.isRecordingSupported
          ? "Worker 转写"
          : "键盘输入"
        : turnDetectionLabels[activeTurnDetectionMode],
      detail: isChatMode
        ? "浏览器录制短音频，Worker 转成文字后再发送 Chat 请求"
        : activeTurnDetectionMode === "push-to-talk"
          ? "按住按钮时采集麦克风，松开后提交"
          : "服务端 VAD 自动判断用户说话结束",
    },
    {
      label: "麦克风",
      value: microphoneStatusLabel,
      detail: isChatMode
        ? "仅在语音提问时上传一段短录音用于转写"
        : isMicrophoneMuted
          ? "当前不会发送麦克风音频"
          : "音频通过 Realtime 会话发送",
    },
    {
      label: "帧差阈值",
      value: `${Math.round(FRAME_DIFF_SEND_THRESHOLD * 100)}%`,
      detail: "自动采样会跳过变化很小的画面",
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
          addTranscript("system", "请先授权摄像头后再采样画面。");
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
          addTranscript("system", "当前浏览器无法读取画面。");
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
            "无法分析当前画面，请重试。",
          );
        }

        return null;
      }

      const frameDataUrl = canvasElement.toDataURL("image/jpeg", 0.72);
      setLastFrameDataUrl(frameDataUrl);
      setSampledFrameCount((currentCount) => currentCount + 1);

      if (source === "manual") {
        addTranscript("system", "已采样当前画面。");
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
      addTranscript("system", "Realtime 会话已停止。");
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
          "你是一个中文视觉对话助手。请结合用户文字和随附画面，用简洁自然的中文回答。",
      });

      if (response === null) {
        setAssistantPhase("error");
        addTranscript("system", "Chat Completions 请求失败，请检查配置或稍后重试。");
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
          "这是摄像头的最新画面，请作为后续对话的视觉上下文，不需要主动回应。",
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
    cancelChatVoiceRecording();
    stopSession();
    stopAccess();
    setIsAutoSampling(false);
    setLastFrameDataUrl(null);
    lastUploadedFrameSignatureRef.current = null;
    setSentFrameCount(0);
    setSkippedAutoFrameCount(0);
    setMicrophoneMuted(false);
    addTranscript("system", "已关闭摄像头和麦克风。");
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
        "已切换到 Chat Completions，Realtime 会话已停止。",
      );
    }

    if (nextProviderMode === "realtime") {
      cancelChatVoiceRecording();
      cancelChatSpeech();
    }

    setProviderMode(nextProviderMode);
  };

  const handleStartSession = (): void => {
    if (isChatMode) {
      addTranscript(
        "system",
        "Chat Completions 模式无需启动 Realtime，会在发送问题时按次请求。",
      );
      return;
    }

    if (mediaState.status !== "granted") {
      setAssistantPhase("error");
      addTranscript("system", "请先授权摄像头和麦克风。");
      return;
    }

    addTranscript("system", "正在创建 Realtime 会话。");
    lastUploadedFrameSignatureRef.current = null;
    setSentFrameCount(0);
    setSkippedAutoFrameCount(0);
    void startRealtimeSession({
      visualContextMode: isAutoSampling ? "interval" : "manual",
      turnDetectionMode,
      responseBudget,
      instructions:
        "你是一个中文视觉对话助手。请结合摄像头画面和用户语音或文字进行简洁、自然、准确的回应。",
    });
  };

  const handleRealtimeTurn = (): void => {
    const prompt = "请描述你现在看到的画面。";

    if (isChatMode) {
      if (!hasMedia) {
        addTranscript("system", "请先授权摄像头后再提问。");
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
      addTranscript("system", "已把画面发送给 Realtime 模型。");
      return;
    }

    setAssistantPhase("error");
    addTranscript("system", "Realtime 通道未就绪，画面发送失败。");
  };

  const handleManualFrameCapture = (): void => {
    const capturedFrame = captureFrame("manual");

    if (capturedFrame !== null && hasRealtimeConnection) {
      const sent = sendVisualContext({
        frameDataUrl: capturedFrame.frameDataUrl,
        prompt:
          "这是用户手动采样的摄像头画面，请作为后续回答的视觉上下文。",
        requestResponse: false,
      });

      if (sent) {
        recordUploadedFrame(capturedFrame.signature);
        addTranscript("system", "已把当前画面加入 Realtime 上下文。");
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
    if (isChatVoiceRecording) {
      void (async (): Promise<void> => {
        addTranscript("system", "已停止录音，正在转写语音。");
        const transcription = await stopChatVoiceRecording();

        if (transcription === null) {
          return;
        }

        const recognizedText = transcription.text.trim();

        if (recognizedText.length === 0) {
          addTranscript("system", "语音转写结果为空，请再试一次。");
          return;
        }

        if (chatVoiceSendMode === "review") {
          setTextDraft((currentDraft) => {
            const trimmedCurrentDraft = currentDraft.trim();

            if (trimmedCurrentDraft.length === 0) {
              return recognizedText;
            }

            return `${trimmedCurrentDraft} ${recognizedText}`;
          });
          addTranscript("system", "语音已转写并填入输入框。");
          return;
        }

        addTranscript("user", recognizedText);
        await sendChatTurn({ message: recognizedText });
      })();
      return;
    }

    startChatVoiceRecording();
  };

  const handleChatVoiceSendModeChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const nextMode = event.currentTarget.value;

    if (nextMode !== "auto-send" && nextMode !== "review") {
      return;
    }

    setChatVoiceSendMode(nextMode);
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
    addTranscript("system", "已停止朗读。");
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
        "请先启动 Realtime 会话再发送文本。",
      );
      return;
    }

    const sent = sendTextMessage(message);

    if (!sent) {
      addTranscript("system", "Realtime 通道未就绪，文本发送失败。");
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
  const canUseSessionButton =
    isChatMode
      ? !isProviderConfigLoading && !chatState.isSending && !isChatVoiceBusy
      : canStartSession;
  const canChangeTurnMode =
    isRealtimeMode &&
    !hasActiveSession &&
    realtimeState.status !== "creating-session" &&
    realtimeState.status !== "connecting" &&
    !hasRealtimeConnection;
  const canChangeProviderMode =
    !isProviderConfigLoading &&
    !chatState.isSending &&
    !isChatVoiceBusy &&
    realtimeState.status !== "creating-session" &&
    realtimeState.status !== "connecting";
  const canChangeResponseBudget = isChatMode
    ? !chatState.isSending && !isChatVoiceBusy
    : canChangeTurnMode;
  const canRealtimeTurn =
    isRealtimeMode && assistantPhase === "listening" && hasRealtimeConnection;
  const canVisualQuestion = isChatMode
    ? hasMedia && !chatState.isSending && !isChatVoiceBusy
    : canRealtimeTurn;
  const canSendTextMessage = isChatMode
    ? !chatState.isSending && !isChatVoiceBusy
    : hasRealtimeConnection;
  const canToggleChatSpeechInput =
    isChatMode &&
    transcriptionState.isRecordingSupported &&
    hasMedia &&
    !isChatVoiceTranscribing &&
    (!chatState.isSending || isChatVoiceRecording);
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
    transcriptionState.errorMessage ??
    chatState.errorMessage;
  const providerDetail = isChatMode
    ? isChatVoiceTranscribing
      ? "正在通过 Worker 转写语音"
      : chatState.isSending
        ? "正在通过 HTTP 请求 Chat Completions"
        : "使用 Chat Completions：无需 Realtime/WebRTC 会话"
    : hasRealtimeConnection
      ? "Realtime 连接已建立"
      : realtimeState.peerConnectionState === null
        ? "等待 Worker 创建会话"
        : `连接状态：${realtimeState.peerConnectionState}`;
  const startSessionLabel =
    realtimeState.status === "creating-session" ||
    realtimeState.status === "connecting"
      ? "连接中"
      : isChatMode
        ? "直接提问"
        : "启动会话";
  const pushToTalkLabel = isChatMode
    ? "Realtime 专用"
    : isPushToTalkActive
      ? "松开提交"
      : "按住说话";
  const pushToTalkTitle = isChatMode
    ? "按住说话只用于 Realtime 模式；Chat 模式请使用右侧语音输入或键盘输入。"
    : "按住时发送麦克风音频，松开后提交给 Realtime 模型。";

  return (
    <main className="assistant-shell">
      <section className="session-column" aria-labelledby="assistant-title">
        <div className="product-header">
          <div className="brand-mark" aria-hidden="true">
            <Radio size={25} strokeWidth={2.2} />
          </div>
          <div>
            <p className="eyebrow">AI 视觉对话</p>
            <h1 id="assistant-title">实时对话助手</h1>
          </div>
        </div>

        <div className="state-panel" aria-label="状态概览">
          <div className="state-ring" data-phase={assistantPhase}>
            <span>{phaseLabels[assistantPhase]}</span>
          </div>
          <div className="state-copy">
            <p>媒体</p>
            <strong>{mediaLabels[mediaState.status]}</strong>
            <span>{hasMedia ? "摄像头和麦克风已就绪" : "等待授权设备"}</span>
            <p>连接</p>
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

        <div className="control-grid" aria-label="主要控制">
          <button
            className="control-button primary"
            type="button"
            onClick={handleRequestAccess}
            disabled={mediaState.status === "requesting"}
          >
            <Camera size={18} aria-hidden="true" />
            <span>{hasMedia ? "重新授权" : "授权设备"}</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={handleStartSession}
            disabled={!canUseSessionButton}
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
            title={pushToTalkTitle}
            aria-pressed={isPushToTalkActive}
          >
            <Hand size={18} aria-hidden="true" />
            <span>{pushToTalkLabel}</span>
          </button>

          <button
            className="control-button"
            type="button"
            onClick={handleRealtimeTurn}
            disabled={!canVisualQuestion}
          >
            <Sparkles size={18} aria-hidden="true" />
            <span>用画面提问</span>
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
          关闭本地设备
        </button>

        <div className="cost-panel" aria-label="成本与模式">
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

          <div className="provider-controls" aria-label="提供商模式">
            <fieldset className="mode-segment" disabled={!canChangeProviderMode}>
              <legend>提供方式</legend>
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

          <div className="voice-controls" aria-label="语音设置">
            {isChatMode ? (
              <div className="chat-speech-controls" aria-label="Chat 语音输入">
                <button
                  className="inline-action-button"
                  type="button"
                  onClick={handleChatSpeechInputClick}
                  disabled={!canToggleChatSpeechInput}
                  aria-pressed={isChatVoiceRecording}
                >
                  {isChatVoiceRecording ? (
                    <MicOff size={16} aria-hidden="true" />
                  ) : (
                    <Mic size={16} aria-hidden="true" />
                  )}
                  <span>{isChatVoiceRecording ? "停止转写" : "语音提问"}</span>
                </button>
                <fieldset
                  className="mode-segment"
                  disabled={isChatVoiceBusy || chatState.isSending}
                >
                  <legend>发送模式</legend>
                  <div>
                    {chatVoiceSendModeOptions.map((option) => (
                      <label key={option.value}>
                        <input
                          type="radio"
                          name="chat-voice-send-mode"
                          value={option.value}
                          checked={chatVoiceSendMode === option.value}
                          onChange={handleChatVoiceSendModeChange}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <span>{chatSpeechStatusLabel}</span>
              </div>
            ) : (
              <>
                <fieldset className="mode-segment" disabled={!canChangeTurnMode}>
                  <legend>轮次模式</legend>
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
                  <span>{isMicrophoneMuted ? "取消静音" : "静音麦克风"}</span>
                </label>
              </>
            )}
          </div>

          <div className="response-controls" aria-label="回答设置">
            <fieldset className="mode-segment" disabled={!canChangeResponseBudget}>
              <legend>回答长度</legend>
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
                      ? "Chat 自动朗读"
                      : "Chat 不朗读"}
                  </span>
                </label>

                <button
                  className="inline-action-button"
                  type="button"
                  onClick={handleCancelChatSpeech}
                  disabled={!speechState.isSpeaking}
                >
                  <Volume2 size={16} aria-hidden="true" />
                  <span>停止朗读</span>
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
                    ? "仅文本回复"
                    : "语音+文本回复"}
                </span>
              </label>
            )}
          </div>

          <div className="sampling-controls" aria-label="视觉采样">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={isAutoSampling}
                onChange={handleAutoSamplingChange}
                disabled={!hasMedia}
              />
              <span>自动视觉采样</span>
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
                disabled={isChatMode}
              />
              <span>启用已消费帧裁剪</span>
            </label>
          </div>
        </div>

        <div className="usage-panel" aria-label="Realtime 用量">
          <div className="usage-heading-row">
            <div className="panel-heading">
              <Activity size={18} aria-hidden="true" />
              <span>用量</span>
            </div>
            <div className="usage-export-actions" aria-label="导出用量">
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
              <dt>最近输入</dt>
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
              <dt>文本输入</dt>
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
              <dt>文本输出</dt>
              <dd>{formatTokens(usageReport.totals.outputTextTokens)}</dd>
            </div>
          </dl>

          <p className="usage-note">
            Token 用量来自 Realtime API 返回的 usage 数据；费用只是前端估算，
            实际账单以服务商后台为准。
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
            aria-label="摄像头预览"
          />
          <audio
            ref={audioRef}
            className="remote-audio"
            autoPlay
            aria-label="AI 回复音频"
          />

          {!hasMedia ? (
            <div className="camera-empty">
              <Video size={34} aria-hidden="true" />
              <h2 id="vision-title">等待视觉输入</h2>
              <p>授权摄像头后，这里会显示实时画面。</p>
            </div>
          ) : null}

          <div className="camera-hud" aria-label="媒体状态">
            <span>
              <Camera size={15} aria-hidden="true" />
              {hasMedia ? "视频已开启" : "视频未开启"}
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

        <div className="visual-context-panel" aria-label="视觉上下文">
          <div className="panel-heading">
            <ImageIcon size={18} aria-hidden="true" />
            <span>最近画面</span>
          </div>

          <div className="frame-sample">
            {lastFrameDataUrl ? (
              <img src={lastFrameDataUrl} alt="最近采样画面" />
            ) : (
              <div className="frame-placeholder">
                <ImageIcon size={22} aria-hidden="true" />
                <span>暂无采样画面</span>
              </div>
            )}
          </div>

          <dl className="frame-stats">
            <div>
              <dt>采样</dt>
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
              <dt>间隔</dt>
              <dd>{isAutoSampling ? `${samplingIntervalSeconds} 秒` : "手动"}</dd>
            </div>
          </dl>
        </div>

        <div className="dialogue-board" aria-label="对话记录">
          <div className="panel-heading">
            <Volume2 size={18} aria-hidden="true" />
            <span>对话</span>
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
            aria-label="文本输入"
          >
            <input
              type="text"
              value={textDraft}
              onChange={handleTextDraftChange}
              placeholder={
                isChatMode
                  ? "输入问题，发送到 Chat Completions"
                  : hasRealtimeConnection
                  ? "输入文字发送给 Realtime"
                  : "启动会话后可输入文字"
              }
              disabled={!canSendTextMessage}
              aria-label="文本消息内容"
            />
            <button
              type="submit"
              disabled={!canSendTextMessage || textDraft.trim().length === 0}
              aria-label="发送文本消息"
            >
              <Send size={16} aria-hidden="true" />
              <span>{chatState.isSending ? "发送中" : "发送"}</span>
            </button>
          </form>
        </div>

        <aside className="security-strip" aria-label="安全说明">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>密钥只在 Worker 端使用，浏览器不会暴露永久 API Key。</span>
        </aside>

        <canvas ref={canvasRef} className="capture-canvas" aria-hidden="true" />
      </section>
    </main>
  );
}
