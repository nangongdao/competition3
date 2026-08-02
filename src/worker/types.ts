type WidenGeneratedBinding<T> = T extends string ? string : T;

type GeneratedWorkerBindings = {
  ASSETS: Cloudflare.Env["ASSETS"];
} & {
  [Key in Exclude<keyof Cloudflare.Env, "ASSETS">]?: WidenGeneratedBinding<
    Cloudflare.Env[Key]
  >;
};

export type CloudflareBindings = GeneratedWorkerBindings & {
  /** 上游 LLM/ASR 供应商 API 密钥（经 `wrangler secret` 注入）。 */
  OPENAI_API_KEY?: string;
  /** 兼容 OpenAI 的 chat completions 基址（provider 指纹，本地配置）。 */
  OPENAI_BASE_URL?: string;
  OPENAI_CHAT_BASE_URL?: string;
  OPENAI_CHAT_COMPLETIONS_URL?: string;
  OPENAI_CHAT_COMPLETIONS_PATH?: string;
  OPENAI_CHAT_MODEL?: string;
  OPENAI_CHAT_TOKEN_LIMIT_PARAMETER?: string;
  OPENAI_CHAT_VISION_INPUT?: string;
  OPENAI_TRANSCRIPTION_API_KEY?: string;
  OPENAI_TRANSCRIPTION_BASE_URL?: string;
  OPENAI_TRANSCRIPTIONS_PATH?: string;
  OPENAI_TRANSCRIPTION_LANGUAGE?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  OPENAI_TRANSCRIPTIONS_URL?: string;
  OPENAI_REALTIME_BASE_URL?: string;
  OPENAI_REALTIME_SESSION_PATH?: string;
  OPENAI_REALTIME_WEBRTC_PATH?: string;
  OPENAI_REALTIME_SESSION_URL?: string;
  OPENAI_REALTIME_WEBRTC_URL?: string;
  OPENAI_REALTIME_MODEL?: string;
  OPENAI_REALTIME_VOICE?: string;
  /** 前端调用 AI 端点所需的客户端令牌（经 `wrangler secret` 注入）。 */
  CLIENT_ACCESS_TOKEN?: string;
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
