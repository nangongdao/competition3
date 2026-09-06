import { useCallback, useEffect, useRef, useState } from "react";

import type { UsageBuckets, UsageReport } from "@/modules/assistant/lib/cost-model";
import type { UsageTotals } from "@/modules/assistant/lib/session-client";
import { isFramePruneError } from "@/modules/assistant/lib/frame-pruning";
import {
  DEFAULT_TURN_DETECTION_MODE,
  getServerEventErrorMessage,
  shouldEnableMicrophoneTrack,
  type RealtimeResponseMode,
} from "@/modules/assistant/lib/realtime-protocol";
import {
  isMeaningfulUserTranscript,
  resolveServerEventAction,
} from "@/modules/assistant/lib/realtime-server-events";
import type {
  AssistantPhase,
  RealtimeConnectionStatus,
  TranscriptSpeaker,
} from "@/modules/assistant/types";
import { useRealtimeConnection } from "./realtime/use-realtime-connection";
import { useRealtimeLifespan } from "./realtime/use-realtime-lifespan";
import { useRealtimeSend } from "./realtime/use-realtime-send";
import {
  useRealtimeSessionStart,
  type StartRealtimeSessionInput,
} from "./realtime/use-realtime-session-start";
import { useRealtimeUsageCollector } from "./realtime/use-realtime-usage-collector";
import type {
  RealtimeCostPolicy,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";

// 供外部引用（workspace 与既有测试）复用同一个来源。
export {
  REALTIME_IDLE_WARNING_MS,
  REALTIME_IDLE_DISCONNECT_MS,
  buildResponseCreateEvent,
  getRealtimeIdleDecision,
  type RealtimeResponseMode,
} from "@/modules/assistant/lib/realtime-protocol";

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
  /** Optional persistence hook: writes each authoritative usage into D1. */
  persistUsage?: (usage: UsageBuckets) => void;
};

type UseRealtimeSessionResult = {
  realtimeState: RealtimeSessionState;
  remoteStream: MediaStream | null;
  usageReport: UsageReport;
  prunedFrameCount: number;
  seedUsageFromPersistedTotals: (totals: UsageTotals) => void;
  resetUsage: () => void;
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

const initialRealtimeState: RealtimeSessionState = {
  status: "idle",
  costPolicy: null,
  peerConnectionState: null,
};

export function useRealtimeSession({
  stream,
  onTranscript,
  onPhaseChange,
  pruneConsumedFrames,
  responseMode,
  persistUsage,
}: UseRealtimeSessionOptions): UseRealtimeSessionResult {
  const [realtimeState, setRealtimeState] =
    useState<RealtimeSessionState>(initialRealtimeState);
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState(false);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const assistantTextBufferRef = useRef("");
  const turnDetectionModeRef = useRef<RealtimeTurnDetectionMode>(
    DEFAULT_TURN_DETECTION_MODE,
  );
  const isMicrophoneMutedRef = useRef(false);
  const isPushToTalkActiveRef = useRef(false);
  const responseModeRef = useRef<RealtimeResponseMode>(responseMode);
  responseModeRef.current = responseMode;

  const connection = useRealtimeConnection();
  const {
    remoteStream,
    getDataChannel,
    getLocalAudioTrack,
    setPeerConnection,
    setDataChannel,
    setLocalAudioTrack,
    setRemoteStream,
    teardownConnection,
  } = connection;

  const usageCollector = useRealtimeUsageCollector({
    pruneConsumedFrames,
    getDataChannel,
    persistUsage,
  });
  const {
    usageReport,
    prunedFrameCount,
    reset: resetUsage,
    seedFromPersistedTotals,
  } = usageCollector;

  const lifespan = useRealtimeLifespan({
    onTranscript,
    onPhaseChange,
    getPushToTalkActive: () => isPushToTalkActiveRef.current,
  });
  const {
    recordActivity: recordRealtimeActivity,
    scheduleSessionLimit,
    startIdleMonitor,
    clearAllTimers,
  } = lifespan;

  const applyMicrophoneTrackState = useCallback((): void => {
    const audioTrack = getLocalAudioTrack();

    if (audioTrack === null) {
      return;
    }

    audioTrack.enabled = shouldEnableMicrophoneTrack(
      turnDetectionModeRef.current,
      isMicrophoneMutedRef.current,
      isPushToTalkActiveRef.current,
    );
  }, [getLocalAudioTrack]);

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

  const setPushToTalkActive = useCallback((active: boolean): void => {
    isPushToTalkActiveRef.current = active;
    setIsPushToTalkActive(active);
  }, []);

  const sendApi = useRealtimeSend({
    getStatus: () => realtimeState.status,
    getDataChannel,
    getTurnDetectionMode: () => turnDetectionModeRef.current,
    getIsMicrophoneMuted: () => isMicrophoneMutedRef.current,
    getIsPushToTalkActive: () => isPushToTalkActiveRef.current,
    getResponseMode: () => responseModeRef.current,
    setPushToTalkActive,
    onRecordActivity: recordRealtimeActivity,
    onPhaseChange,
    onApplyMicrophoneTrackState: applyMicrophoneTrackState,
  });
  const {
    sendVisualContext,
    sendTextMessage,
    startPushToTalk,
    stopPushToTalk,
  } = sendApi;

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
      clearAllTimers();
      assistantTextBufferRef.current = "";
      isPushToTalkActiveRef.current = false;
      setIsPushToTalkActive(false);

      const localAudioTrack = getLocalAudioTrack();
      if (localAudioTrack !== null) {
        localAudioTrack.enabled = !isMicrophoneMutedRef.current;
      }
      setLocalAudioTrack(null);
      turnDetectionModeRef.current = DEFAULT_TURN_DETECTION_MODE;

      teardownConnection();

      setRealtimeState((current) => ({
        status: nextStatus,
        errorMessage: nextStatus === "error" ? current.errorMessage : undefined,
        costPolicy: nextStatus === "idle" ? null : current.costPolicy,
        peerConnectionState: null,
      }));
    },
    [
      clearAllTimers,
      getLocalAudioTrack,
      setLocalAudioTrack,
      teardownConnection,
    ],
  );

  const handleServerEvent = useCallback(
    (event: Record<string, unknown>): void => {
      const action = resolveServerEventAction(event);

      switch (action.kind) {
        case "none":
          return;

        case "error": {
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

        case "image-created": {
          usageCollector.recordImageCreated(event);
          return;
        }

        case "speech-started": {
          recordRealtimeActivity();
          onPhaseChange("listening");
          return;
        }

        case "response-created": {
          recordRealtimeActivity();
          usageCollector.beginResponse();
          onPhaseChange("thinking");
          return;
        }

        case "text-delta": {
          recordRealtimeActivity();
          assistantTextBufferRef.current += action.delta;
          onPhaseChange("responding");
          return;
        }

        case "transcript-done": {
          recordRealtimeActivity();
          flushAssistantText(action.text);
          onPhaseChange("listening");
          return;
        }

        case "text-done": {
          recordRealtimeActivity();
          flushAssistantText(action.text);
          onPhaseChange("listening");
          return;
        }

        case "user-transcript": {
          if (isMeaningfulUserTranscript(action.transcript)) {
            recordRealtimeActivity();
            onTranscript("user", action.transcript as string);
          }
          return;
        }

        case "response-done": {
          recordRealtimeActivity();
          usageCollector.recordResponseDone(event);
          usageCollector.pruneConsumedFrames();
          flushAssistantText(null);
          onPhaseChange("listening");
          return;
        }
      }
    },
    [
      flushAssistantText,
      onPhaseChange,
      onTranscript,
      recordRealtimeActivity,
      usageCollector,
    ],
  );

  const { startSession } = useRealtimeSessionStart({
    stream,
    onTranscript,
    onPhaseChange,
    onApplyMicrophoneTrackState: applyMicrophoneTrackState,
    onStateChange: setRealtimeState,
    onResetUsage: resetUsage,
    onCloseConnection: closeConnection,
    onServerEvent: handleServerEvent,
    setTurnDetectionMode: (mode) => {
      turnDetectionModeRef.current = mode;
    },
    setIsPushToTalkActive: (active) => {
      isPushToTalkActiveRef.current = active;
      setIsPushToTalkActive(active);
    },
    setLocalAudioTrack,
    setPeerConnection,
    setDataChannel,
    setRemoteStream,
    scheduleSessionLimit,
    startIdleMonitor,
  });

  const stopSession = useCallback((): void => {
    closeConnection("idle");
  }, [closeConnection]);

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
    seedUsageFromPersistedTotals: seedFromPersistedTotals,
    resetUsage,
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
