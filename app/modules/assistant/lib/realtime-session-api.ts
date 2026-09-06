import { withClientAccessToken } from "@/modules/assistant/lib/api-client";
import {
  DATA_CHANNEL_LABEL,
  getLocalizedApiErrorMessage,
  isRealtimeSessionSuccessResponse,
  parseServerEvent,
} from "@/modules/assistant/lib/realtime-protocol";
import { isRecord } from "@/modules/assistant/lib/type-guards";
import type {
  ApiErrorResponse,
  RealtimeCostPolicy,
  RealtimeResponseBudget,
  RealtimeSessionSuccessResponse,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";

export const DATA_CHANNEL_OPEN_TIMEOUT_MS = 15_000;

export type StartRealtimeSessionInput = {
  visualContextMode: RealtimeCostPolicy["visualContextMode"];
  turnDetectionMode: RealtimeTurnDetectionMode;
  responseBudget: RealtimeResponseBudget;
  instructions?: string;
};

/**
 * Guards a worker error response shape.
 *
 * @param value - parsed JSON payload from a non-OK response.
 * @returns true when the payload matches the worker {@link ApiErrorResponse}.
 */
export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    isRecord(value) &&
    value.success === false &&
    typeof value.error === "string" &&
    typeof value.code === "string"
  );
}

/**
 * Reads a localized error message from a Realtime session HTTP failure.
 *
 * @param response - non-OK response returned by the session endpoint.
 * @returns a user-facing, localized message.
 */
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

/**
 * Creates a Realtime session by calling the worker session endpoint.
 *
 * @param input - session negotiation parameters.
 * @returns the worker's success response containing the WebRTC URL & cost policy.
 */
export async function createRealtimeSession(
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

  const response = await fetch(
    "/api/realtime/session",
    withClientAccessToken({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }),
  );

  if (!response.ok) {
    throw new Error(await readSessionError(response));
  }

  const value = (await response.json()) as unknown;

  if (!isRealtimeSessionSuccessResponse(value)) {
    throw new Error("Realtime 会话响应不符合预期契约。");
  }

  return value;
}

/**
 * Reads a message from a failed SDP exchange response.
 *
 * @param response - non-OK response returned by the WebRTC URL.
 * @returns the server-provided message, or a generic fallback.
 */
export async function readSdpError(response: Response): Promise<string> {
  const message = await response.text();

  if (message.trim().length > 0) {
    return message;
  }

  return `Realtime WebRTC offer 失败，状态码 ${response.status}。`;
}

/**
 * Resolves once the given data channel reaches the `open` state, or rejects
 * after a timeout / channel failure.
 *
 * @param dataChannel - the RTC data channel to await.
 * @returns a promise that resolves on open and rejects on timeout or failure.
 */
export function waitForDataChannelOpen(
  dataChannel: RTCDataChannel,
): Promise<void> {
  if (dataChannel.readyState === "open") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
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
      clearTimeout(timeoutId);
      dataChannel.removeEventListener("open", handleOpen);
      dataChannel.removeEventListener("error", handleFailure);
      dataChannel.removeEventListener("close", handleFailure);
    };

    dataChannel.addEventListener("open", handleOpen);
    dataChannel.addEventListener("error", handleFailure);
    dataChannel.addEventListener("close", handleFailure);
  });
}

export type RealtimePeerCallbacks = {
  /** Called whenever the peer connection state changes. */
  onStateChange: (state: RTCPeerConnectionState) => void;
  /** Called when the peer connection transitions to the failed state. */
  onFailed: () => void;
  /** Called when a remote track is received (first stream or later tracks). */
  onTrack: (stream: MediaStream) => void;
  /** Called for every parsed server event received over the data channel. */
  onDataMessage: (event: Record<string, unknown>) => void;
};

export type EstablishedPeerConnection = {
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel;
};

/**
 * Establishes a WebRTC peer connection plus the OAI events data channel.
 *
 * Creates the `RTCPeerConnection`, attaches a fallback remote stream, registers
 * the state / track / data-channel listeners, adds the local audio track,
 * creates an offer, exchanges SDP with the worker's WebRTC URL, and awaits the
 * data channel opening.
 *
 * @param localStream - the local camera/mic stream (its first audio track is sent).
 * @param session - the session negotiation result (WebRTC URL & client secret).
 * @param callbacks - event listeners wired back into the caller.
 * @returns the live peer connection and its data channel.
 */
export async function establishRealtimePeerConnection(
  localStream: MediaStream,
  session: Pick<RealtimeSessionSuccessResponse, "webrtcUrl"> & {
    clientSecret: string;
  },
  callbacks: RealtimePeerCallbacks,
): Promise<EstablishedPeerConnection> {
  const peerConnection = new RTCPeerConnection();
  const fallbackRemoteStream = new MediaStream();

  peerConnection.addEventListener("connectionstatechange", () => {
    callbacks.onStateChange(peerConnection.connectionState);

    if (peerConnection.connectionState === "failed") {
      callbacks.onFailed();
    }
  });

  peerConnection.addEventListener("track", (event) => {
    const receivedStream = event.streams[0];

    if (receivedStream !== undefined) {
      callbacks.onTrack(receivedStream);
      return;
    }

    fallbackRemoteStream.addTrack(event.track);
    callbacks.onTrack(fallbackRemoteStream);
  });

  const dataChannel = peerConnection.createDataChannel(DATA_CHANNEL_LABEL);

  dataChannel.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      return;
    }

    const serverEvent = parseServerEvent(event.data);

    if (serverEvent !== null) {
      callbacks.onDataMessage(serverEvent);
    }
  });

  const audioTrack = localStream.getAudioTracks()[0];

  if (audioTrack !== undefined) {
    peerConnection.addTrack(audioTrack, localStream);
  }

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  if (peerConnection.localDescription === null) {
    throw new Error("浏览器没有创建本地 WebRTC offer。");
  }

  const sdpResponse = await fetch(session.webrtcUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.clientSecret}`,
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

  return { peerConnection, dataChannel };
}
