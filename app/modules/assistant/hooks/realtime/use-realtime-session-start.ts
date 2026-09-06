import { useCallback } from "react";

import {
  createRealtimeSession,
  establishRealtimePeerConnection,
  type StartRealtimeSessionInput,
} from "@/modules/assistant/lib/realtime-session-api";

export type { StartRealtimeSessionInput };
import {
  getRealtimeErrorMessage,
  getSessionClientSecret,
} from "@/modules/assistant/lib/realtime-protocol";
import type {
  AssistantPhase,
  RealtimeConnectionStatus,
  TranscriptSpeaker,
} from "@/modules/assistant/types";
import type {
  RealtimeCostPolicy,
  RealtimeTurnDetectionMode,
} from "../../../../../src/worker/routes/realtime/types";

export type RealtimeSessionStateUpdate = {
  status: RealtimeConnectionStatus;
  errorMessage?: string;
  costPolicy: RealtimeCostPolicy | null;
  peerConnectionState: RTCPeerConnectionState | null;
};

export type RealtimeSessionStateUpdater =
  | RealtimeSessionStateUpdate
  | ((current: RealtimeSessionStateUpdate) => RealtimeSessionStateUpdate);

export type UseRealtimeSessionStartOptions = {
  /** Live media stream containing the microphone track. */
  stream: MediaStream | null;
  onTranscript: (speaker: TranscriptSpeaker, text: string) => void;
  onPhaseChange: (phase: AssistantPhase) => void;
  /** Applies the current mute/PTT state to the live microphone track. */
  onApplyMicrophoneTrackState: () => void;
  /** Commits a state transition on the realtime session. */
  onStateChange: (update: RealtimeSessionStateUpdater) => void;
  /** Clears usage accounting for the incoming session. */
  onResetUsage: () => void;
  /** Closes an existing connection before starting fresh. */
  onCloseConnection: (nextStatus: RealtimeConnectionStatus) => void;
  /** Pushes a decoded server event into the event dispatch flow. */
  onServerEvent: (event: Record<string, unknown>) => void;
  /** Writes the negotiated turn-detection mode for the session. */
  setTurnDetectionMode: (mode: RealtimeTurnDetectionMode) => void;
  setIsPushToTalkActive: (active: boolean) => void;
  setLocalAudioTrack: (track: MediaStreamTrack | null) => void;
  setPeerConnection: (connection: RTCPeerConnection | null) => void;
  setDataChannel: (channel: RTCDataChannel | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  /** Starts the hard session-limit timer. */
  scheduleSessionLimit: (
    maxSessionSeconds: number,
    onIdleDisconnect: () => void,
  ) => void;
  /** Starts the idle warning/disconnect monitor. */
  startIdleMonitor: (onIdleDisconnect: () => void) => void;
};

export type RealtimeSessionStartResult = {
  startSession: (input: StartRealtimeSessionInput) => Promise<boolean>;
};

/**
 * Validates the prerequisites for starting a Realtime session and returns a
 * user-facing error message when they are not met, or `null` when all checks
 * pass. Pure so the failure paths can be unit-tested in isolation.
 */
export function resolveStartPrerequisite(
  hasStream: boolean,
  hasAudioTrack: boolean,
  supportsWebRtc: boolean,
): string | null {
  if (!hasStream) {
    return "启动 Realtime 前请先授权摄像头和麦克风。";
  }

  if (!hasAudioTrack) {
    return "当前没有可用于 Realtime 的麦克风音频轨道。";
  }

  if (!supportsWebRtc) {
    return "当前浏览器不支持 WebRTC 点对点连接。";
  }

  return null;
}

function fail(
  message: string,
  onTranscript: UseRealtimeSessionStartOptions["onTranscript"],
  onPhaseChange: UseRealtimeSessionStartOptions["onPhaseChange"],
  onStateChange: UseRealtimeSessionStartOptions["onStateChange"],
): false {
  onStateChange({
    status: "error",
    errorMessage: message,
    costPolicy: null,
    peerConnectionState: null,
  });
  onTranscript("system", message);
  onPhaseChange("error");
  return false;
}

/**
 * Owns the "start a Realtime session" orchestration: validate prerequisites,
 * create the ephemeral session, establish the WebRTC peer connection, wire the
 * connection callbacks, and arm the lifespan monitors.
 *
 * Extracted from the session orchestration hook so the start path can be
 * reasoned about and unit-tested in isolation.
 */
export function useRealtimeSessionStart({
  stream,
  onTranscript,
  onPhaseChange,
  onApplyMicrophoneTrackState,
  onStateChange,
  onResetUsage,
  onCloseConnection,
  onServerEvent,
  setTurnDetectionMode,
  setIsPushToTalkActive,
  setLocalAudioTrack,
  setPeerConnection,
  setDataChannel,
  setRemoteStream,
  scheduleSessionLimit,
  startIdleMonitor,
}: UseRealtimeSessionStartOptions): RealtimeSessionStartResult {
  const startSession = useCallback(
    async (input: StartRealtimeSessionInput): Promise<boolean> => {
      if (stream === null) {
        return fail(
          "启动 Realtime 前请先授权摄像头和麦克风。",
          onTranscript,
          onPhaseChange,
          onStateChange,
        );
      }

      const prerequisiteError = resolveStartPrerequisite(
        true,
        stream.getAudioTracks()[0] !== undefined,
        typeof RTCPeerConnection !== "undefined",
      );

      if (prerequisiteError !== null) {
        return fail(
          prerequisiteError,
          onTranscript,
          onPhaseChange,
          onStateChange,
        );
      }

      const audioTrack = stream.getAudioTracks()[0];

      onCloseConnection("idle");
      setTurnDetectionMode(input.turnDetectionMode);
      setIsPushToTalkActive(false);
      setLocalAudioTrack(audioTrack);
      onApplyMicrophoneTrackState();
      onResetUsage();
      onStateChange({
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

        const { peerConnection, dataChannel } =
          await establishRealtimePeerConnection(
            stream,
            { webrtcUrl: sessionResponse.webrtcUrl, clientSecret },
            {
              onStateChange: (state) => {
                onStateChange((current) => ({
                  ...current,
                  peerConnectionState: state,
                }));
              },
              onFailed: () => {
                onStateChange((current) => ({
                  ...current,
                  status: "error",
                  errorMessage: "Realtime 点对点连接失败。",
                }));
                onTranscript("system", "Realtime 点对点连接失败。");
                onPhaseChange("error");
              },
              onTrack: (receivedStream) => {
                setRemoteStream(receivedStream);
              },
              onDataMessage: (serverEvent) => {
                onServerEvent(serverEvent);
              },
            },
          );
        setPeerConnection(peerConnection);
        setDataChannel(dataChannel);

        onStateChange({
          status: "connecting",
          costPolicy: sessionResponse.costPolicy,
          peerConnectionState: peerConnection.connectionState,
        });

        scheduleSessionLimit(
          sessionResponse.costPolicy.maxSessionSeconds,
          () => {
            onCloseConnection("idle");
          },
        );
        startIdleMonitor(() => {
          onCloseConnection("idle");
        });

        onStateChange({
          status: "connected",
          costPolicy: sessionResponse.costPolicy,
          peerConnectionState: peerConnection.connectionState,
        });
        onTranscript("system", "Realtime 会话已连接。");
        onPhaseChange("listening");
        return true;
      } catch (error: unknown) {
        const message = getRealtimeErrorMessage(error);
        onCloseConnection("idle");
        onStateChange({
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
      onApplyMicrophoneTrackState,
      onCloseConnection,
      onPhaseChange,
      onResetUsage,
      onServerEvent,
      onStateChange,
      onTranscript,
      scheduleSessionLimit,
      setDataChannel,
      setLocalAudioTrack,
      setPeerConnection,
      setRemoteStream,
      setIsPushToTalkActive,
      setTurnDetectionMode,
      startIdleMonitor,
      stream,
    ],
  );

  return { startSession };
}
