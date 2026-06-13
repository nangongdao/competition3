export type CloudflareBindings = {
  ASSETS: Fetcher;
  ENVIRONMENT?: string;
  OPENAI_API_KEY?: string;
  OPENAI_PROVIDER_MODE?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_CHAT_BASE_URL?: string;
  OPENAI_CHAT_COMPLETIONS_PATH?: string;
  OPENAI_CHAT_COMPLETIONS_URL?: string;
  OPENAI_CHAT_MODEL?: string;
  OPENAI_REALTIME_BASE_URL?: string;
  OPENAI_REALTIME_SESSION_PATH?: string;
  OPENAI_REALTIME_WEBRTC_PATH?: string;
  OPENAI_REALTIME_SESSION_URL?: string;
  OPENAI_REALTIME_WEBRTC_URL?: string;
  OPENAI_REALTIME_MODEL?: string;
  OPENAI_REALTIME_VOICE?: string;
};

export type AppEnv = {
  Bindings: CloudflareBindings;
};

export type HealthResponse = {
  success: true;
  service: "ai-visual-dialogue-assistant";
  environment: string;
  timestamp: number;
};