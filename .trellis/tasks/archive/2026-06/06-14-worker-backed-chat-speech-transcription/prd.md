# Worker-backed Chat Speech Transcription

## Goal

Make Chat mode support the practical voice flow the project needs: record user
speech in the browser, transcribe it through the Worker with an
OpenAI-compatible audio transcription endpoint, send the resulting text through
the existing Chat Completions path, and optionally read or review the text
answer.

## Requirements

- Add `POST /api/speech/transcription` for short browser-recorded audio files.
- Add transcription runtime variables for model, path, full URL, base URL, and
  language.
- Keep permanent API keys server-side in Worker secrets.
- Add Chat-mode recording controls that do not depend on browser Web Speech
  recognition.
- Default to auto-sending the transcript to the existing Chat completion flow.
- Provide a review mode that fills the composer before manual sending.
- Keep typed Chat, optional camera-frame questions, and Realtime mode working.
- Show localized errors for microphone permission, unsupported recording,
  transcription provider failures, and Chat completion failures.
- Update deployment docs so Cloudflare variables are explicit.

## Acceptance Criteria

- [ ] In Chat mode, the user can speak a short question and get a text answer
      without starting Realtime.
- [ ] Cloudflare can configure `OPENAI_TRANSCRIPTION_MODEL`,
      `OPENAI_TRANSCRIPTIONS_PATH`, `OPENAI_TRANSCRIPTIONS_URL`,
      `OPENAI_TRANSCRIPTION_BASE_URL`, and `OPENAI_TRANSCRIPTION_LANGUAGE`.
- [ ] Missing API key/model config, invalid transcription URLs, bad audio
      uploads, and provider errors return JSON errors.
- [ ] The frontend never surfaces raw `Unexpected token '<'` JSON parse errors
      for Worker/HTML fallback responses.
- [ ] Backend route tests and relevant frontend hook tests cover the new flow.
- [ ] README and design/demo docs describe setup and verification.
- [ ] Lint, typecheck, tests, build, and demo verification pass.

## Technical Approach

Use the existing Worker boundary and Chat route. The browser records a short
utterance with `MediaRecorder`, posts it to `/api/speech/transcription`, then
uses the normalized transcript as the user message for `/api/chat/completion`.
The Worker forwards multipart form data to the configured transcription
endpoint, defaulting to `/audio/transcriptions` and `whisper-1` unless runtime
variables override them.

## Decision

Implement a Worker-backed request/response ASR path as the primary Chat voice
input. Keep Realtime/WebRTC available for providers that support it, but do not
require Realtime for ordinary voice-to-text-to-chat usage.

## Out of Scope

- Streaming ASR over WebSocket.
- Local Whisper inference in Cloudflare Workers.
- Provider-backed text-to-speech generation in this task.
- Separate transcription API key.

## Technical Notes

- This task is based on the current `main`, where independent transcription
  variables are not yet present.
- `E:\competiton2` confirms the desired pattern: browser audio capture plus a
  backend `/audio/transcriptions` provider call, then text is sent to the answer
  model.
- Related specs: backend API patterns, frontend hooks, shared TypeScript, PR
  workflow.
