export type MediaPermissionStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unsupported"
  | "error";

export type MediaPermissionState = {
  status: MediaPermissionStatus;
  errorMessage?: string;
};

export type AssistantPhase =
  | "idle"
  | "ready"
  | "connecting"
  | "listening"
  | "thinking"
  | "responding"
  | "error";

export type RealtimeConnectionStatus =
  | "idle"
  | "creating-session"
  | "connecting"
  | "connected"
  | "error";

export type TranscriptSpeaker = "system" | "user" | "assistant";

export type TranscriptEntry = {
  id: string;
  speaker: TranscriptSpeaker;
  text: string;
  createdAt: number;
};

export type CostControlSetting = {
  label: string;
  value: string;
  detail: string;
};
