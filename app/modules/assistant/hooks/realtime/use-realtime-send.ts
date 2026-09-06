import { useCallback } from "react";

import {
  resolvePushToTalkStart,
  resolvePushToTalkStop,
  resolveSendText,
  resolveSendVisualContext,
} from "@/modules/assistant/lib/realtime-send";
import type { RealtimeResponseMode } from "@/modules/assistant/lib/realtime-protocol";
import type {
  AssistantPhase,
  RealtimeConnectionStatus,
} from "@/modules/assistant/types";
import type { RealtimeTurnDetectionMode } from "../../../../../src/worker/routes/realtime/types";

export type SendVisualContextInput = {
  frameDataUrl: string;
  prompt: string;
  requestResponse: boolean;
};

export type UseRealtimeSendOptions = {
  getStatus: () => RealtimeConnectionStatus;
  getDataChannel: () => RTCDataChannel | null;
  getTurnDetectionMode: () => RealtimeTurnDetectionMode;
  getIsMicrophoneMuted: () => boolean;
  getIsPushToTalkActive: () => boolean;
  getResponseMode: () => RealtimeResponseMode;
  setPushToTalkActive: (active: boolean) => void;
  onRecordActivity: () => void;
  onPhaseChange: (phase: AssistantPhase) => void;
  onApplyMicrophoneTrackState: () => void;
};

export type RealtimeSendApi = {
  sendVisualContext: (input: SendVisualContextInput) => boolean;
  sendTextMessage: (text: string) => boolean;
  startPushToTalk: () => boolean;
  stopPushToTalk: () => boolean;
};

/**
 * Owns the Realtime outbound send chain.
 *
 * Wires the pure decision layer (`lib/realtime-send.ts`) into the live data
 * channel, PTT/voice refs, and phase callbacks, so the session orchestration
 * hook no longer hand-writes channel-ready checks, event building, or PTT
 * gating.
 */
export function useRealtimeSend({
  getStatus,
  getDataChannel,
  getTurnDetectionMode,
  getIsMicrophoneMuted,
  getIsPushToTalkActive,
  getResponseMode,
  setPushToTalkActive,
  onRecordActivity,
  onPhaseChange,
  onApplyMicrophoneTrackState,
}: UseRealtimeSendOptions): RealtimeSendApi {
  const sendVisualContext = useCallback(
    (input: SendVisualContextInput): boolean => {
      const dataChannel = getDataChannel();
      const result = resolveSendVisualContext({
        frameDataUrl: input.frameDataUrl,
        prompt: input.prompt,
        requestResponse: input.requestResponse,
        channelReady: dataChannel !== null && dataChannel.readyState === "open",
        responseMode: getResponseMode(),
      });

      if (result.kind !== "send") {
        return false;
      }

      if (dataChannel === null) {
        return false;
      }

      result.events.forEach((event) => {
        dataChannel.send(JSON.stringify(event));
      });
      onRecordActivity();

      if (result.responseRequested) {
        onPhaseChange("thinking");
      }

      return true;
    },
    [
      getDataChannel,
      getResponseMode,
      onPhaseChange,
      onRecordActivity,
    ],
  );

  const sendTextMessage = useCallback(
    (text: string): boolean => {
      const dataChannel = getDataChannel();
      const result = resolveSendText({
        text,
        channelReady: dataChannel !== null && dataChannel.readyState === "open",
        responseMode: getResponseMode(),
      });

      if (result.kind !== "send" || dataChannel === null) {
        return false;
      }

      result.events.forEach((event) => {
        dataChannel.send(JSON.stringify(event));
      });
      onRecordActivity();
      onPhaseChange("thinking");

      return true;
    },
    [getDataChannel, getResponseMode, onPhaseChange, onRecordActivity],
  );

  const startPushToTalk = useCallback((): boolean => {
    const decision = resolvePushToTalkStart({
      status: getStatus(),
      turnDetectionMode: getTurnDetectionMode(),
      isMicrophoneMuted: getIsMicrophoneMuted(),
      isPushToTalkActive: getIsPushToTalkActive(),
    });

    if (decision.kind !== "activate") {
      return decision.kind === "already-active";
    }

    setPushToTalkActive(true);
    onRecordActivity();
    onApplyMicrophoneTrackState();
    onPhaseChange("listening");
    return true;
  }, [
    getIsMicrophoneMuted,
    getIsPushToTalkActive,
    getStatus,
    getTurnDetectionMode,
    onApplyMicrophoneTrackState,
    onPhaseChange,
    onRecordActivity,
    setPushToTalkActive,
  ]);

  const stopPushToTalk = useCallback((): boolean => {
    const dataChannel = getDataChannel();
    const decision = resolvePushToTalkStop({
      turnDetectionMode: getTurnDetectionMode(),
      isPushToTalkActive: getIsPushToTalkActive(),
      isMicrophoneMuted: getIsMicrophoneMuted(),
      channelReady: dataChannel !== null && dataChannel.readyState === "open",
      responseMode: getResponseMode(),
    });

    if (decision.kind === "none") {
      return false;
    }

    setPushToTalkActive(false);
    onApplyMicrophoneTrackState();

    if (decision.kind === "deactivate-and-send" && dataChannel !== null) {
      decision.events.forEach((event) => {
        dataChannel.send(JSON.stringify(event));
      });
      onRecordActivity();
      onPhaseChange("thinking");
    }

    return true;
  }, [
    getDataChannel,
    getIsMicrophoneMuted,
    getIsPushToTalkActive,
    getResponseMode,
    getTurnDetectionMode,
    onApplyMicrophoneTrackState,
    onPhaseChange,
    onRecordActivity,
    setPushToTalkActive,
  ]);

  return {
    sendVisualContext,
    sendTextMessage,
    startPushToTalk,
    stopPushToTalk,
  };
}
