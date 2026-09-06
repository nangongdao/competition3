import { useCallback, useRef } from "react";

import {
  getRealtimeIdleDecision,
  REALTIME_IDLE_CHECK_INTERVAL_MS,
} from "@/modules/assistant/lib/realtime-protocol";
import type {
  AssistantPhase,
  TranscriptSpeaker,
} from "@/modules/assistant/types";

export type UseRealtimeLifespanOptions = {
  onTranscript: (speaker: TranscriptSpeaker, text: string) => void;
  onPhaseChange: (phase: AssistantPhase) => void;
  /** Returns whether push-to-talk is currently active (keeps the session alive). */
  getPushToTalkActive: () => boolean;
};

export type RealtimeLifespanResult = {
  /** Marks the session as active, resetting the idle warning window. */
  recordActivity: (timestamp?: number) => void;
  /** Schedules a hard disconnect after the configured session limit. */
  scheduleSessionLimit: (
    maxSessionSeconds: number,
    onIdleDisconnect: () => void,
  ) => void;
  /** Starts the idle monitor that warns then disconnects after inactivity. */
  startIdleMonitor: (onIdleDisconnect: () => void) => void;
  /** Cancels the session limit timer and the idle monitor interval. */
  clearAllTimers: () => void;
};

/**
 * Owns Realtime session lifetime concerns: idle monitoring and the session
 * time cap. Keeps the associated timer refs and activity bookkeeping out of
 * the session orchestration hook.
 */
export function useRealtimeLifespan({
  onTranscript,
  onPhaseChange,
  getPushToTalkActive,
}: UseRealtimeLifespanOptions): RealtimeLifespanResult {
  const sessionTimerIdRef = useRef<number | null>(null);
  const idleTimerIdRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef(Date.now());
  const hasIdleWarningRef = useRef(false);

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

  const clearAllTimers = useCallback((): void => {
    clearSessionTimer();
    clearIdleTimer();
  }, [clearIdleTimer, clearSessionTimer]);

  const recordActivity = useCallback((timestamp = Date.now()): void => {
    lastActivityAtRef.current = timestamp;
    hasIdleWarningRef.current = false;
  }, []);

  const scheduleSessionLimit = useCallback(
    (maxSessionSeconds: number, onIdleDisconnect: () => void): void => {
      clearSessionTimer();
      sessionTimerIdRef.current = window.setTimeout(() => {
        onTranscript("system", "会话已达到时间上限，Realtime 连接已关闭。");
        onPhaseChange("ready");
        onIdleDisconnect();
      }, maxSessionSeconds * 1000);
    },
    [clearSessionTimer, onPhaseChange, onTranscript],
  );

  const startIdleMonitor = useCallback(
    (onIdleDisconnect: () => void): void => {
      clearIdleTimer();
      recordActivity();
      idleTimerIdRef.current = window.setInterval(() => {
        const now = Date.now();

        if (getPushToTalkActive()) {
          recordActivity(now);
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
          onIdleDisconnect();
        }
      }, REALTIME_IDLE_CHECK_INTERVAL_MS);
    },
    [
      clearIdleTimer,
      getPushToTalkActive,
      onPhaseChange,
      onTranscript,
      recordActivity,
    ],
  );

  return {
    recordActivity,
    scheduleSessionLimit,
    startIdleMonitor,
    clearAllTimers,
  };
}
