import { useCallback, useEffect, useRef, useState } from "react";

import {
  accumulateUsage,
  createEmptyUsageReport,
  estimateCostUsd,
  parseResponseUsage,
  type UsageReport,
} from "@/modules/assistant/lib/cost-model";
import type {
  AssistantPhase,
  RealtimeConnectionStatus,
  TranscriptSpeaker,
} from "@/modules/assistant/types";
import type {
  ApiErrorResponse,
  RealtimeCostPolicy,
  RealtimeSessionSuccessResponse,
} from "../../../../src/worker/routes/realtime/types";

const REALTIME_WEBRTC_URL = "https://api.openai.com/v1/realtime";
const DEFAULT_REALTIME_MODEL = "gpt-realtime";
const DATA_CHANNEL_LABEL = "oai-events";
const DATA_CHANNEL_OPEN_TIMEOUT_MS = 15_000;

type StartRealtimeSessionInput = {
  visualContextMode: RealtimeCostPolicy["visualContextMode"];
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
};

type UseRealtimeSessionResult = {
  realtimeState: RealtimeSessionState;
  remoteStream: MediaStream | null;
  usageReport: UsageReport;
  startSession: (input: StartRealtimeSessionInput) => Promise<boolean>;
  stopSession: () => void;
  sendVisualContext: (input: SendVisualContextInput) => boolean;
  sendTextMessage: (text: string) => boolean;
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
    modalities: ["audio", "text"];
  };
};

const initialRealtimeState: RealtimeSessionState = {
  status: "idle",
  costPolicy: null,
  peerConnectionState: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringField(
  value: Record<string, unknown>,
  fieldName: string,
): string | null {
  const fieldValue = value[fieldName];
  return typeof fieldValue === "string" ? fieldValue : null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Realtime session failed.";
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

  return "The Realtime service reported an error.";
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

function getSessionModel(session: unknown): string {
  if (!isRecord(session)) {
    return DEFAULT_REALTIME_MODEL;
  }

  return getStringField(session, "model") ?? DEFAULT_REALTIME_MODEL;
}

function isRealtimeCostPolicy(value: unknown): value is RealtimeCostPolicy {
  return (
    isRecord(value) &&
    (value.visualContextMode === "manual" ||
      value.visualContextMode === "interval") &&
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

async function readSessionError(response: Response): Promise<string> {
  try {
    const value = (await response.json()) as unknown;

    if (isApiErrorResponse(value)) {
      return value.error;
    }
  } catch {
    return `Realtime session request failed with status ${response.status}.`;
  }

  return `Realtime session request failed with status ${response.status}.`;
}

async function createRealtimeSession(
  input: StartRealtimeSessionInput,
): Promise<RealtimeSessionSuccessResponse> {
  const requestBody: StartRealtimeSessionInput = {
    visualContextMode: input.visualContextMode,
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
    throw new Error("Realtime session response did not match the expected contract.");
  }

  return value;
}

async function readSdpError(response: Response): Promise<string> {
  const message = await response.text();

  if (message.trim().length > 0) {
    return message;
  }

  return `Realtime WebRTC offer failed with status ${response.status}.`;
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
      reject(new Error("Realtime data channel did not open in time."));
    }, DATA_CHANNEL_OPEN_TIMEOUT_MS);

    const handleOpen = (): void => {
      cleanup();
      resolve();
    };

    const handleFailure = (): void => {
      cleanup();
      reject(new Error("Realtime data channel failed to open."));
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

export function useRealtimeSession({
  stream,
  onTranscript,
  onPhaseChange,
}: UseRealtimeSessionOptions): UseRealtimeSessionResult {
  const [realtimeState, setRealtimeState] =
    useState<RealtimeSessionState>(initialRealtimeState);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [usageReport, setUsageReport] = useState<UsageReport>(
    createEmptyUsageReport,
  );
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const sessionTimerIdRef = useRef<number | null>(null);
  const assistantTextBufferRef = useRef("");

  const clearSessionTimer = useCallback((): void => {
    if (sessionTimerIdRef.current !== null) {
      window.clearTimeout(sessionTimerIdRef.current);
      sessionTimerIdRef.current = null;
    }
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
      assistantTextBufferRef.current = "";

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
    [clearSessionTimer],
  );

  const recordTurnUsage = useCallback(
    (event: Record<string, unknown>): void => {
      const turnUsage = parseResponseUsage(event);

      if (turnUsage === null) {
        return;
      }

      setUsageReport((current) => {
        const totals = accumulateUsage(current.totals, turnUsage);

        return {
          turnCount: current.turnCount + 1,
          totals,
          lastTurn: turnUsage,
          estimatedCostUsd: estimateCostUsd(totals),
        };
      });
    },
    [],
  );

  const handleServerEvent = useCallback(
    (event: Record<string, unknown>): void => {
      const eventType = getStringField(event, "type");

      if (eventType === null) {
        return;
      }

      if (eventType === "error") {
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

      if (eventType === "input_audio_buffer.speech_started") {
        onPhaseChange("listening");
        return;
      }

      if (eventType === "response.created") {
        onPhaseChange("thinking");
        return;
      }

      if (
        eventType === "response.audio_transcript.delta" ||
        eventType === "response.output_text.delta" ||
        eventType === "response.text.delta"
      ) {
        assistantTextBufferRef.current += getStringField(event, "delta") ?? "";
        onPhaseChange("responding");
        return;
      }

      if (eventType === "response.audio_transcript.done") {
        flushAssistantText(getStringField(event, "transcript"));
        onPhaseChange("listening");
        return;
      }

      if (
        eventType === "response.output_text.done" ||
        eventType === "response.text.done"
      ) {
        flushAssistantText(getStringField(event, "text"));
        onPhaseChange("listening");
        return;
      }

      if (eventType === "conversation.item.input_audio_transcription.completed") {
        const transcript = getStringField(event, "transcript");

        if (transcript !== null && transcript.trim().length > 0) {
          onTranscript("user", transcript);
        }
        return;
      }

      if (eventType === "response.done") {
        recordTurnUsage(event);
        flushAssistantText(null);
        onPhaseChange("listening");
      }
    },
    [flushAssistantText, onPhaseChange, onTranscript, recordTurnUsage],
  );

  const scheduleSessionLimit = useCallback(
    (maxSessionSeconds: number): void => {
      clearSessionTimer();
      sessionTimerIdRef.current = window.setTimeout(() => {
        onTranscript("system", "Session time limit reached. Realtime connection closed.");
        onPhaseChange("ready");
        closeConnection("idle");
      }, maxSessionSeconds * 1000);
    },
    [clearSessionTimer, closeConnection, onPhaseChange, onTranscript],
  );

  const startSession = useCallback(
    async (input: StartRealtimeSessionInput): Promise<boolean> => {
      if (stream === null) {
        const message = "Grant camera and microphone access before starting Realtime.";
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
        const message = "No microphone audio track is available for Realtime.";
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
        const message = "This browser does not support WebRTC peer connections.";
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
      setUsageReport(createEmptyUsageReport());
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
          throw new Error("Realtime session did not include a client secret.");
        }

        const model = getSessionModel(sessionResponse.session);
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
              errorMessage: "Realtime peer connection failed.",
            }));
            onTranscript("system", "Realtime peer connection failed.");
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
          throw new Error("Browser did not create a local WebRTC offer.");
        }

        setRealtimeState({
          status: "connecting",
          costPolicy: sessionResponse.costPolicy,
          peerConnectionState: peerConnection.connectionState,
        });

        const sdpResponse = await fetch(
          `${REALTIME_WEBRTC_URL}?model=${encodeURIComponent(model)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${clientSecret}`,
              "Content-Type": "application/sdp",
            },
            body: peerConnection.localDescription.sdp,
          },
        );

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

        setRealtimeState({
          status: "connected",
          costPolicy: sessionResponse.costPolicy,
          peerConnectionState: peerConnection.connectionState,
        });
        onTranscript("system", "Realtime session connected.");
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
      closeConnection,
      handleServerEvent,
      onPhaseChange,
      onTranscript,
      scheduleSessionLimit,
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

      if (input.requestResponse) {
        const responseEvent: RealtimeResponseCreateEvent = {
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
          },
        };
        dataChannel.send(JSON.stringify(responseEvent));
        onPhaseChange("thinking");
      }

      return true;
    },
    [onPhaseChange],
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

      const responseEvent: RealtimeResponseCreateEvent = {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
        },
      };
      dataChannel.send(JSON.stringify(responseEvent));
      onPhaseChange("thinking");

      return true;
    },
    [onPhaseChange],
  );

  useEffect(() => {
    return () => {
      closeConnection("idle");
    };
  }, [closeConnection]);

  return {
    realtimeState,
    remoteStream,
    usageReport,
    startSession,
    stopSession,
    sendVisualContext,
    sendTextMessage,
  };
}
