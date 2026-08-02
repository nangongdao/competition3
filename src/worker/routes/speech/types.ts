import { z } from "zod";

export const speechTranscriptionLanguageSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .optional();

export type SpeechTranscriptionLanguage = z.infer<
  typeof speechTranscriptionLanguageSchema
>;

export type SpeechTranscriptionSuccessResponse = {
  success: true;
  text: string;
  model: string;
};

export type SpeechApiErrorCode =
  | "missing_openai_api_key"
  | "invalid_transcription_provider_config"
  | "invalid_audio_upload"
  | "transcription_failed"
  | "invalid_transcription_response"
  | "request_cancelled"
  | "transcription_circuit_open"
  | "transcription_rate_limited"
  | "transcription_timeout"
  | "transcription_unavailable";

export type SpeechApiErrorResponse = {
  success: false;
  error: string;
  code: SpeechApiErrorCode;
};
