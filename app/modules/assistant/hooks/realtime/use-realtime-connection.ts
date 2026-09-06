import { useCallback, useRef, useState } from "react";

export type RealtimeConnectionResult = {
  /** React-tracked remote media stream (for `<video>` srcObject). */
  remoteStream: MediaStream | null;
  getPeerConnection: () => RTCPeerConnection | null;
  getDataChannel: () => RTCDataChannel | null;
  getLocalAudioTrack: () => MediaStreamTrack | null;
  setPeerConnection: (connection: RTCPeerConnection | null) => void;
  setDataChannel: (channel: RTCDataChannel | null) => void;
  setLocalAudioTrack: (track: MediaStreamTrack | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  /**
   * Closes the data channel and peer connection and stops any received
   * remote tracks, then clears the connection refs. Idempotent.
   */
  teardownConnection: () => void;
};

/**
 * Owns the live WebRTC connection artifacts (peer connection, data channel,
 * local audio track, remote stream) for a Realtime session.
 *
 * Keeps the imperative DOM/WebRTC handles out of the session orchestration
 * hook so that connection teardown and lifecycle are single-responsibility and
 * easy to reason about. The remote stream is mirrored into React state so the
 * workspace can render the incoming media.
 */
export function useRealtimeConnection(): RealtimeConnectionResult {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStreamState] = useState<MediaStream | null>(
    null,
  );

  const getPeerConnection = useCallback(
    (): RTCPeerConnection | null => peerConnectionRef.current,
    [],
  );
  const getDataChannel = useCallback(
    (): RTCDataChannel | null => dataChannelRef.current,
    [],
  );
  const getLocalAudioTrack = useCallback(
    (): MediaStreamTrack | null => localAudioTrackRef.current,
    [],
  );

  const setPeerConnection = useCallback(
    (connection: RTCPeerConnection | null): void => {
      peerConnectionRef.current = connection;
    },
    [],
  );
  const setDataChannel = useCallback((channel: RTCDataChannel | null): void => {
    dataChannelRef.current = channel;
  }, []);
  const setLocalAudioTrack = useCallback(
    (track: MediaStreamTrack | null): void => {
      localAudioTrackRef.current = track;
    },
    [],
  );

  const setRemoteStream = useCallback((stream: MediaStream | null): void => {
    remoteStreamRef.current = stream;
    setRemoteStreamState(stream);
  }, []);

  const teardownConnection = useCallback((): void => {
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
    setRemoteStreamState(null);
  }, []);

  return {
    remoteStream,
    getPeerConnection,
    getDataChannel,
    getLocalAudioTrack,
    setPeerConnection,
    setDataChannel,
    setLocalAudioTrack,
    setRemoteStream,
    teardownConnection,
  };
}
