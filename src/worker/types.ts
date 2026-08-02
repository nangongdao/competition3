type WidenGeneratedBinding<T> = T extends string ? string : T;

type GeneratedWorkerBindings = {
  ASSETS: Cloudflare.Env["ASSETS"];
} & {
  [Key in Exclude<keyof Cloudflare.Env, "ASSETS">]?: WidenGeneratedBinding<
    Cloudflare.Env[Key]
  >;
};

export type CloudflareBindings = GeneratedWorkerBindings & {
  OPENAI_API_KEY?: string;
  OPENAI_CHAT_BASE_URL?: string;
  OPENAI_CHAT_COMPLETIONS_URL?: string;
  OPENAI_TRANSCRIPTION_API_KEY?: string;
  OPENAI_TRANSCRIPTIONS_URL?: string;
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
  Variables: {
    requestId: string;
  };
};

export type HealthResponse = {
  success: true;
  service: "ai-visual-dialogue-assistant";
  environment: string;
  timestamp: number;
};
