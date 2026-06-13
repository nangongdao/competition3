import { useCallback, useEffect, useRef, useState } from "react";

import {
  appendUsageTurn,
  createEmptyUsageReport,
  parseResponseUsage,
  type UsageReport,
} from "@/modules/assistant/lib/cost-model";
import {
  beginResponse,
  buildFramePruneEvent,
  completeResponse,
  createFramePruneTracker,
  getCreatedImageItemId,
  isFramePruneError,
  trackCreatedFrame,
  type FramePruneTracker,
} from "@/modules/assistant/lib/frame-pruning";
import {
  getStringField,
  isRecord,
} from "@/modules/assistant/lib/type-guards";
import type {
  AssistantPhase,
  RealtimeConnectionStatus,
  TranscriptSpeaker,
} from "@/modules/assistant/types";
import type {
  ApiErrorResponse,
  RealtimeCostPolicy,
  RealtimeResponseBudget,
  RealtimeSessionSuccessResponse,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";

const DEFAULT_TURN_DETECTION_MODE: RealtimeTurnDetectionMode = "server-vad";
const DATA_CHANNEL_LABEL = "oai-events";
const DATA_CHANNEL_OPEN_TIMEOUT_MS = 15_000;
export const REALTIME_IDLE_WARNING_MS = 90_000;
export const REALTIME_IDLE_DISCONNECT_MS = 120_000;
export const REALTIME_IDLE_CHECK_INTERVAL_MS = 30_000;

export type RealtimeResponseMode = "audio-text" | "text-only";
export type RealtimeIdleDecision = "none" | "warn" | "disconnect";

type RealtimeIdleDecisionInput = {
  now: number;
  lastActivityAt: number;
  hasWarned: boolean;
  warningMs?: number;
  disconnectMs?: number;
};

type StartRealtimeSessionInput = {
  visualContextMode: RealtimeCostPolicy["visualContextMode"];
  turnDetectionMode: RealtimeTurnDetectionMode;
  responseBudget: RealtimeResponseBudget;
  instructions?: string;
};

type SendVisualContextInput = {
  frameDataUrl: string;
  prompt: string;
  requestResponse: boolean;
};

type RealtimeSessionState = {
  status: RealtimeConnectionStatus;
  errorMessage?: string;
  costPolicy: RealtimeCostPolicy | null;
  peerConnectionState: RTCPeerConnectionState | null;
};

type UseRealtimeSessionOptions = {
  stream: MediaStream | null;
  onTranscript: (speaker: TranscriptSpeaker, text: string) => void;
  onPhaseChange: (phase: AssistantPhase) => void;
  /** When true, consumed image frames are deleted from server history. */
  pruneConsumedFrames: boolean;
  /** Controls the modalities requested by each response.create event. */
  responseMode: RealtimeResponseMode;
};

type UseRealtimeSessionResult = {
  realtimeState: RealtimeSessionState;
  remoteStream: MediaStream | null;
  usageReport: UsageReport;
  prunedFrameCount: number;
  startSession: (input: StartRealtimeSessionInput) => Promise<boolean>;
  stopSession: () => void;
  sendVisualContext: (input: SendVisualContextInput) => boolean;
  sendTextMessage: (text: string) => boolean;
  isMicrophoneMuted: boolean;
  isPushToTalkActive: boolean;
  setMicrophoneMuted: (isMuted: boolean) => void;
  startPushToTalk: () => boolean;
  stopPushToTalk: () => boolean;
};

type RealtimeContentPart =
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "input_image";
      image_url: string;
    };

type RealtimeConversationItemCreateEvent = {
  type: "conversation.item.create";
  item: {
    type: "message";
    role: "user";
    content: RealtimeContentPart[];
  };
};

type RealtimeResponseCreateEvent = {
  type: "response.create";
  response: {
    modalities: ["audio", "text"] | ["text"];
  };
};

type RealtimeInputAudioBufferCommitEvent = {
  type: "input_audio_buffer.commit";
};

const initialRealtimeState: RealtimeSessionState = {
  status: "idle",
  costPolicy: null,
  peerConnectionState: null,
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Realtime 会话失败。";
}

function getServerEventErrorMessage(event: Record<string, unknown>): string {
  const directMessage = getStringField(event, "message");

  if (directMessage !== null) {
    return directMessage;
  }

  const errorValue = event.error;

  if (isRecord(errorValue)) {
    const nestedMessage = getStringField(errorValue, "message");

    if (nestedMessage !== null) {
      return nestedMessage;
    }
  }

  return "Realtime 服务返回了错误。";
}

function getSessionClientSecret(session: unknown): string | null {
  if (!isRecord(session)) {
    return null;
  }

  const clientSecret = session.client_secret;

  if (typeof clientSecret === "string") {
    return clientSecret;
  }

  if (isRecord(clientSecret)) {
    const value = getStringField(clientSecret, "value");

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function isRealtimeCostPolicy(value: unknown): value is RealtimeCostPolicy {
  return (
    isRecord(value) &&
    (value.visualContextMode === "manual" ||
      value.visualContextMode === "interval") &&
    (value.turnDetectionMode === "server-vad" ||
      value.turnDetectionMode === "push-to-talk") &&
    (value.responseBudget === "brief" ||
      value.responseBudget === "standard" ||
      value.responseBudget === "detailed") &&
    typeof value.maxResponseOutputTokens === "number" &&
    typeof value.maxSessionSeconds === "number" &&
    value.frameUpload === "manual-or-interval"
  );
}

function isRealtimeSessionSuccessResponse(
  value: unknown,
): value is RealtimeSessionSuccessResponse {
  return (
    isRecord(value) &&
    value.success === true &&
    "session" in value &&
    typeof value.webrtcUrl === "string" &&
    value.webrtcUrl.trim().length > 0 &&
    isRealtimeCostPolicy(value.costPolicy)
  );
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    isRecord(value) &&
    value.success === false &&
    typeof value.error === "string" &&
    typeof value.code === "string"
  );
}

function getLocalizedApiErrorMessage(errorResponse: ApiErrorResponse): string {
  if (errorResponse.code === "missing_openai_api_key") {
    return "Worker 尚未配置 OPENAI_API_KEY，无法启动 Realtime 会话。";
  }

  if (errorResponse.code === "invalid_request") {
    return "Realtime 会话请求参数无效。";
  }

  if (errorResponse.code === "openai_session_failed") {
    return `OpenAI 会话创建失败：${errorResponse.error}`;
  }

  return errorResponse.error;
}

async function readSessionError(response: Response): Promise<string> {
  try {
    const value = (await response.json()) as unknown;

    if (isApiErrorResponse(value)) {
      return getLocalizedApiErrorMessage(value);
    }
  } catch {
    return `Realtime 会话请求失败，状态码 ${response.status}。`;
  }

  return `Realtime 会话请求失败，状态码 ${response.status}。`;
}

async function createRealtimeSession(
  input: StartRealtimeSessionInput,
): Promise<RealtimeSessionSuccessResponse> {
  const requestBody: StartRealtimeSessionInput = {
    visualContextMode: input.visualContextMode,
    turnDetectionMode: input.turnDetectionMode,
    responseBudget: input.responseBudget,
  };

  if (input.instructions !== undefined) {
    requestBody.instructions = input.instructions;
  }

  const response = await fetch("/api/realtime/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(await readSessionError(response));
  }

  const value = (await response.json()) as unknown;

  if (!isRealtimeSessionSuccessResponse(value)) {
    throw new Error("Realtime 会话响应不符合预期契约。");
  }

  return value;
}

async function readSdpError(response: Response): Promise<string> {
  const message = await response.text();

  if (message.trim().length > 0) {
    return message;
  }

  return `Realtime WebRTC offer 失败，状态码 ${response.status}。`;
}

function parseServerEvent(data: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(data) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function waitForDataChannelOpen(dataChannel: RTCDataChannel): Promise<void> {
  if (dataChannel.readyState === "open") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Realtime 数据通道未在限定时间内打开。"));
    }, DATA_CHANNEL_OPEN_TIMEOUT_MS);

    const handleOpen = (): void => {
      cleanup();
      resolve();
    };

    const handleFailure = (): void => {
      cleanup();
      reject(new Error("Realtime 数据通道打开失败。"));
    };

    const cleanup = (): void => {
      window.clearTimeout(timeoutId);
      dataChannel.removeEventListener("open", handleOpen);
      dataChannel.removeEventListener("error", handleFailure);
      dataChannel.removeEventListener("close", handleFailure);
    };

    dataChannel.addEventListener("open", handleOpen);
    dataChannel.addEventListener("error", handleFailure);
    dataChannel.addEventListener("close", handleFailure);
  });
}

function shouldEnableMicrophoneTrack(
  turnDetectionMode: RealtimeTurnDetectionMode,
  isMicrophoneMuted: boolean,
  isPushToTalkActive: boolean,
): boolean {
  if (isMicrophoneMuted) {
    return false;
  }

  return turnDetectionMode === "server-vad" || isPushToTalkActive;
}

export function getRealtimeIdleDecision({
  now,
  lastActivityAt,
  hasWarned,
  warningMs = REALTIME_IDLE_WARNING_MS,
  disconnectMs = REALTIME_IDLE_DISCONNECT_MS,
}: RealtimeIdleDecisionInput): RealtimeIdleDecision {
  const idleForMs = Math.max(0, now - lastActivityAt);

  if (idleForMs >= disconnectMs) {
    return "disconnect";
  }

  if (idleForMs >= warningMs && !hasWarned) {
    return "warn";
  }

  return "none";
}

function buildConversationEvent(
  input: SendVisualContextInput,
): RealtimeConversationItemCreateEvent {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: input.prompt,
        },
        {
          type: "input_image",
          image_url: input.frameDataUrl,
        },
      ],
    },
  };
}

function buildTextConversationEvent(
  text: string,
): RealtimeConversationItemCreateEvent {
  return {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text,
        },
      ],
    },
  };
}

export function buildResponseCreateEvent(
  responseMode: RealtimeResponseMode,
): RealtimeResponseCreateEvent {
  return {
    type: "response.create",
    response: {
      modalities: responseMode === "text-only" ? ["text"] : ["audio", "text"],
    },
  };
}

function buildAudioBufferCommitEvent(): RealtimeInputAudioBufferCommitEvent {
  return {
    type: "input_audio_buffer.commit",
  };
}

export function useRealtimeSession({
  stream,
  onTranscript,
  onPhaseChange,
  pruneConsumedFrames,
  responseMode,
}: UseRealtimeSessionOptions): UseRealtimeSessionResult {
  const [realtimeState, setRealtimeState] =
    useState<RealtimeSessionState>(initialRealtimeState);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [usageReport, setUsageReport] = useState<UsageReport>(
    createEmptyUsageReport,
  );
  const [prunedFrameCount, setPrunedFrameCount] = useState(0);
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState(false);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const sessionTimerIdRef = useRef<number | null>(null);
  const idleTimerIdRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef(Date.now());
  const hasIdleWarningRef = useRef(false);
  const assistantTextBufferRef = useRef("");
  const turnDetectionModeRef = useRef<RealtimeTurnDetectionMode>(
    DEFAULT_TURN_DETECTION_MODE,
  );
  const isMicrophoneMutedRef = useRef(false);
  const isPushToTalkActiveRef = useRef(false);
  const pruneTrackerRef = useRef<FramePruneTracker>(createFramePruneTracker());
  const pruneSequenceRef = useRef(0);
  const pruneConsumedFramesRef = useRef(pruneConsumedFrames);
  const responseModeRef = useRef<RealtimeResponseMode>(responseMode);
  pruneConsumedFramesRef.current = pruneConsumedFrames;
  responseModeRef.current = responseMode;

  const applyMicrophoneTrackState = useCallback((): void => {
    const audioTrack = localAudioTrackRef.current;

    if (audioTrack === null) {
      return;
    }

    audioTrack.enabled = shouldEnableMicrophoneTrack(
      turnDetectionModeRef.current,
      isMicrophoneMutedRef.current,
      isPushToTalkActiveRef.current,
    );
  }, []);

  const setMicrophoneMuted = useCallback(
    (nextMuted: boolean): void => {
      isMicrophoneMutedRef.current = nextMuted;
      setIsMicrophoneMuted(nextMuted);

      if (nextMuted && isPushToTalkActiveRef.current) {
        isPushToTalkActiveRef.current = false;
        setIsPushToTalkActive(false);
      }

      applyMicrophoneTrackState();
    },
    [applyMicrophoneTrackState],
  );

  const clearSessionTimer = useCallback((): void => {
    if (sessionTimerIdRef.current !== null) {
      window.clearTimeout(sessionTimerIdRef.current);
      sessionTimerIdRef.current = null;
    }
  }, []);

  const clearIdleTimer = useCallback((): void => {
    if (idleTimerIdRef.current !== null) {
      window.clearInterval(idleTimerIdRef.current);
      idleTimerIdRef.current = null;
    }
  }, []);

  const recordRealtimeActivity = useCallback((timestamp = Date.now()): void => {
    lastActivityAtRef.current = timestamp;
    hasIdleWarningRef.current = false;
  }, []);

  const flushAssistantText = useCallback(
    (fallbackText: string | null): void => {
      const text = fallbackText ?? assistantTextBufferRef.current.trim();
      assistantTextBufferRef.current = "";

      if (text.length > 0) {
        onTranscript("assistant", text);
      }
    },
    [onTranscript],
  );

  const closeConnection = useCallback(
    (nextStatus: RealtimeConnectionStatus): void => {
      clearSessionTimer();
      clearIdleTimer();
      assistantTextBufferRef.current = "";
      isPushToTalkActiveRef.current = false;
      setIsPushToTalkActive(false);

      const localAudioTrack = localAudioTrackRef.current;
      if (localAudioTrack !== null) {
        localAudioTrack.enabled = !isMicrophoneMutedRef.current;
      }
      localAudioTrackRef.current = null;
      turnDetectionModeRef.current = DEFAULT_TURN_DETECTION_MODE;

      const dataChannel = dataChannelRef.current;
      if (dataChannel !== null && dataChannel.readyState !== "closed") {
        dataChannel.close();
      }
      dataChannelRef.current = null;

      const peerConnection = peerConnectionRef.current;
      if (peerConnection !== null) {
        peerConnection.close();
      }
      peerConnectionRef.current = null;

      remoteStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
      remoteStreamRef.current = null;
      setRemoteStream(null);

      setRealtimeState((current) => ({
        status: nextStatus,
        errorMessage: nextStatus === "error" ? current.errorMessage : undefined,
        costPolicy: nextStatus === "idle" ? null : current.costPolicy,
        peerConnectionState: null,
      }));
    },
    [clearIdleTimer, clearSessionTimer],
  );

  const recordTurnUsage = useCallback(
    (event: Record<string, unknown>): void => {
      const turnUsage = parseResponseUsage(event);

      if (turnUsage === null) {
        return;
      }

      setUsageReport((current) => {
        return appendUsageTurn(current, turnUsage, Date.now());
      });
    },
    [],
  );

  const pruneConsumedFrameItems = useCallback((): void => {
    const { tracker, consumedItemIds } = completeResponse(
      pruneTrackerRef.current,
    );
    pruneTrackerRef.current = tracker;

    if (consumedItemIds.length === 0 || !pruneConsumedFramesRef.current) {
      return;
    }

    const dataChannel = dataChannelRef.current;

    if (dataChannel === null || dataChannel.readyState !== "open") {
      return;
    }

    consumedItemIds.forEach((itemId) => {
      pruneSequenceRef.current += 1;
      dataChannel.send(
        JSON.stringify(buildFramePruneEvent(itemId, pruneSequenceRef.current)),
      );
    });
    setPrunedFrameCount((current) => current + consumedItemIds.length);
  }, []);

  const handleServerEvent = useCallback(
    (event: Record<string, unknown>): void => {
      const eventType = getStringField(event, "type");

      if (eventType === null) {
        return;
      }

      if (eventType === "error") {
        if (isFramePruneError(event)) {
          // Our own conversation.item.delete raced an already-removed
          // item; harmless for the session, so keep the conversation
          // healthy instead of surfacing an error state.
          return;
        }

        const message = getServerEventErrorMessage(event);
        setRealtimeState((current) => ({
          ...current,
          status: "error",
          errorMessage: message,
        }));
        onTranscript("system", message);
        onPhaseChange("error");
        return;
      }

      if (eventType === "conversation.item.created") {
        const imageItemId = getCreatedImageItemId(event);

        if (imageItemId !== null) {
          pruneTrackerRef.current = trackCreatedFrame(
            pruneTrackerRef.current,
            imageItemId,
          );
        }
        return;
      }

      if (eventType === "input_audio_buffer.speech_started") {
        recordRealtimeActivity();
        onPhaseChange("listening");
        return;
      }

      if (eventType === "response.created") {
        recordRealtimeActivity();
        pruneTrackerRef.current = beginResponse(pruneTrackerRef.current);
        onPhaseChange("thinking");
        return;
      }

      if (
        eventType === "response.audio_transcript.delta" ||
        eventType === "response.output_text.delta" ||
        eventType === "response.text.delta"
      ) {
        recordRealtimeActivity();
        assistantTextBufferRef.current += getStringField(event, "delta") ?? "";
        onPhaseChange("responding");
        return;
      }

      if (eventType === "response.audio_transcript.done") {
        recordRealtimeActivity();
        flushAssistantText(getStringField(event, "transcript"));
        onPhaseChange("listening");
        return;
      }

      if (
        eventType === "response.output_text.done" ||
        eventType === "response.text.done"
      ) {
        recordRealtimeActivity();
        flushAssistantText(getStringField(event, "text"));
        onPhaseChange("listening");
        return;
      }

      if (eventType === "conversation.item.input_audio_transcription.completed") {
        const transcript = getStringField(event, "transcript");

        if (transcript !== null && transcript.trim().length > 0) {
          recordRealtimeActivity();
          onTranscript("user", transcript);
        }
        return;
      }

      if (eventType === "response.done") {
        recordRealtimeActivity();
        recordTurnUsage(event);
        pruneConsumedFrameItems();
        flushAssistantText(null);
        onPhaseChange("listening");
      }
    },
    [
      flushAssistantText,
      onPhaseChange,
      onTranscript,
      pruneConsumedFrameItems,
      recordRealtimeActivity,
      recordTurnUsage,
    ],
  );

  const scheduleSessionLimit = useCallback(
    (maxSessionSeconds: number): void => {
      clearSessionTimer();
      sessionTimerIdRef.current = window.setTimeout(() => {
        onTranscript("system", "会话已达到时间上限，Realtime 连接已关闭。");
        onPhaseChange("ready");
        closeConnection("idle");
      }, maxSessionSeconds * 1000);
    },
    [clearSessionTimer, closeConnection, onPhaseChange, onTranscript],
  );

  const startIdleMonitor = useCallback((): void => {
    clearIdleTimer();
    recordRealtimeActivity();
    idleTimerIdRef.current = window.setInterval(() => {
      const now = Date.now();

      if (isPushToTalkActiveRef.current) {
        recordRealtimeActivity(now);
        return;
      }

      const decision = getRealtimeIdleDecision({
        now,
        lastActivityAt: lastActivityAtRef.current,
        hasWarned: hasIdleWarningRef.current,
      });

      if (decision === "warn") {
        hasIdleWarningRef.current = true;
        onTranscript(
          "system",
          "90 秒内没有 Realtime 活动。空闲满 120 秒后会自动关闭会话。",
        );
        return;
      }

      if (decision === "disconnect") {
        onTranscript(
          "system",
          "Realtime 会话已在空闲 120 秒后自动关闭。",
        );
        onPhaseChange("ready");
        closeConnection("idle");
      }
    }, REALTIME_IDLE_CHECK_INTERVAL_MS);
  }, [
    clearIdleTimer,
    closeConnection,
    onPhaseChange,
    onTranscript,
    recordRealtimeActivity,
  ]);

  const startSession = useCallback(
    async (input: StartRealtimeSessionInput): Promise<boolean> => {
      if (stream === null) {
        const message = "启动 Realtime 前请先授权摄像头和麦克风。";
        setRealtimeState({
          status: "error",
          errorMessage: message,
          costPolicy: null,
          peerConnectionState: null,
        });
        onTranscript("system", message);
        onPhaseChange("error");
        return false;
      }

      const audioTrack = stream.getAudioTracks()[0];

      if (audioTrack === undefined) {
        const message = "当前没有可用于 Realtime 的麦克风音频轨道。";
        setRealtimeState({
          status: "error",
          errorMessage: message,
          costPolicy: null,
          peerConnectionState: null,
        });
        onTranscript("system", message);
        onPhaseChange("error");
        return false;
      }

      if (typeof RTCPeerConnection === "undefined") {
        const message = "当前浏览器不支持 WebRTC 点对点连接。";
        setRealtimeState({
          status: "error",
          errorMessage: message,
          costPolicy: null,
          peerConnectionState: null,
        });
        onTranscript("system", message);
        onPhaseChange("error");
        return false;
      }

      closeConnection("idle");
      turnDetectionModeRef.current = input.turnDetectionMode;
      isPushToTalkActiveRef.current = false;
      setIsPushToTalkActive(false);
      localAudioTrackRef.current = audioTrack;
      applyMicrophoneTrackState();
      setUsageReport(createEmptyUsageReport());
      setPrunedFrameCount(0);
      pruneTrackerRef.current = createFramePruneTracker();
      pruneSequenceRef.current = 0;
      setRealtimeState({
        status: "creating-session",
        costPolicy: null,
        peerConnectionState: null,
      });
      onPhaseChange("connecting");

      try {
        const sessionResponse = await createRealtimeSession(input);
        const clientSecret = getSessionClientSecret(sessionResponse.session);

        if (clientSecret === null) {
          throw new Error("Realtime 会话没有返回临时客户端密钥。");
        }

        const peerConnection = new RTCPeerConnection();
        const fallbackRemoteStream = new MediaStream();
        peerConnectionRef.current = peerConnection;
        remoteStreamRef.current = fallbackRemoteStream;
        setRemoteStream(fallbackRemoteStream);

        peerConnection.addEventListener("connectionstatechange", () => {
          setRealtimeState((current) => ({
            ...current,
            peerConnectionState: peerConnection.connectionState,
          }));

          if (peerConnection.connectionState === "failed") {
            setRealtimeState((current) => ({
              ...current,
              status: "error",
              errorMessage: "Realtime 点对点连接失败。",
            }));
            onTranscript("system", "Realtime 点对点连接失败。");
            onPhaseChange("error");
          }
        });

        peerConnection.addEventListener("track", (event) => {
          const receivedStream = event.streams[0];

          if (receivedStream !== undefined) {
            remoteStreamRef.current = receivedStream;
            setRemoteStream(receivedStream);
            return;
          }

          fallbackRemoteStream.addTrack(event.track);
          setRemoteStream(fallbackRemoteStream);
        });

        const dataChannel = peerConnection.createDataChannel(DATA_CHANNEL_LABEL);
        dataChannelRef.current = dataChannel;

        dataChannel.addEventListener("message", (event) => {
          if (typeof event.data !== "string") {
            return;
          }

          const serverEvent = parseServerEvent(event.data);

          if (serverEvent !== null) {
            handleServerEvent(serverEvent);
          }
        });

        peerConnection.addTrack(audioTrack, stream);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        if (peerConnection.localDescription === null) {
          throw new Error("浏览器没有创建本地 WebRTC offer。");
        }

        setRealtimeState({
          status: "connecting",
          costPolicy: sessionResponse.costPolicy,
          peerConnectionState: peerConnection.connectionState,
        });

        const sdpResponse = await fetch(sessionResponse.webrtcUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: peerConnection.localDescription.sdp,
        });

        if (!sdpResponse.ok) {
          throw new Error(await readSdpError(sdpResponse));
        }

        const answerSdp = await sdpResponse.text();
        await peerConnection.setRemoteDescription({
          type: "answer",
          sdp: answerSdp,
        });
        await waitForDataChannelOpen(dataChannel);
        scheduleSessionLimit(sessionResponse.costPolicy.maxSessionSeconds);
        startIdleMonitor();

        setRealtimeState({
          status: "connected",
          costPolicy: sessionResponse.costPolicy,
          peerConnectionState: peerConnection.connectionState,
        });
        onTranscript("system", "Realtime 会话已连接。");
        onPhaseChange("listening");
        return true;
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        closeConnection("idle");
        setRealtimeState({
          status: "error",
          errorMessage: message,
          costPolicy: null,
          peerConnectionState: null,
        });
        onTranscript("system", message);
        onPhaseChange("error");
        return false;
      }
    },
    [
      applyMicrophoneTrackState,
      closeConnection,
      handleServerEvent,
      onPhaseChange,
      onTranscript,
      scheduleSessionLimit,
      startIdleMonitor,
      stream,
    ],
  );

  const stopSession = useCallback((): void => {
    closeConnection("idle");
  }, [closeConnection]);

  const sendVisualContext = useCallback(
    (input: SendVisualContextInput): boolean => {
      const dataChannel = dataChannelRef.current;

      if (dataChannel === null || dataChannel.readyState !== "open") {
        return false;
      }

      if (!input.frameDataUrl.startsWith("data:image/")) {
        return false;
      }

      const conversationEvent = buildConversationEvent(input);
      dataChannel.send(JSON.stringify(conversationEvent));
      recordRealtimeActivity();

      if (input.requestResponse) {
        dataChannel.send(
          JSON.stringify(buildResponseCreateEvent(responseModeRef.current)),
        );
        onPhaseChange("thinking");
      }

      return true;
    },
    [onPhaseChange, recordRealtimeActivity],
  );

  const sendTextMessage = useCallback(
    (text: string): boolean => {
      const dataChannel = dataChannelRef.current;

      if (dataChannel === null || dataChannel.readyState !== "open") {
        return false;
      }

      const trimmedText = text.trim();

      if (trimmedText.length === 0) {
        return false;
      }

      dataChannel.send(JSON.stringify(buildTextConversationEvent(trimmedText)));
      dataChannel.send(
        JSON.stringify(buildResponseCreateEvent(responseModeRef.current)),
      );
      recordRealtimeActivity();
      onPhaseChange("thinking");

      return true;
    },
    [onPhaseChange, recordRealtimeActivity],
  );

  const startPushToTalk = useCallback((): boolean => {
    if (
      realtimeState.status !== "connected" ||
      turnDetectionModeRef.current !== "push-to-talk" ||
      isMicrophoneMutedRef.current
    ) {
      return false;
    }

    if (isPushToTalkActiveRef.current) {
      return true;
    }

    isPushToTalkActiveRef.current = true;
    setIsPushToTalkActive(true);
    recordRealtimeActivity();
    applyMicrophoneTrackState();
    onPhaseChange("listening");
    return true;
  }, [
    applyMicrophoneTrackState,
    onPhaseChange,
    realtimeState.status,
    recordRealtimeActivity,
  ]);

  const stopPushToTalk = useCallback((): boolean => {
    if (
      turnDetectionModeRef.current !== "push-to-talk" ||
      !isPushToTalkActiveRef.current
    ) {
      return false;
    }

    isPushToTalkActiveRef.current = false;
    setIsPushToTalkActive(false);
    applyMicrophoneTrackState();

    const dataChannel = dataChannelRef.current;

    if (
      isMicrophoneMutedRef.current ||
      dataChannel === null ||
      dataChannel.readyState !== "open"
    ) {
      return false;
    }

    dataChannel.send(JSON.stringify(buildAudioBufferCommitEvent()));
    dataChannel.send(
      JSON.stringify(buildResponseCreateEvent(responseModeRef.current)),
    );
    recordRealtimeActivity();
    onPhaseChange("thinking");

    return true;
  }, [applyMicrophoneTrackState, onPhaseChange, recordRealtimeActivity]);

  useEffect(() => {
    return () => {
      closeConnection("idle");
    };
  }, [closeConnection]);

  return {
    realtimeState,
    remoteStream,
    usageReport,
    prunedFrameCount,
    startSession,
    stopSession,
    sendVisualContext,
    sendTextMessage,
    isMicrophoneMuted,
    isPushToTalkActive,
    setMicrophoneMuted,
    startPushToTalk,
    stopPushToTalk,
  };
}
