# Competition2 ASR Pattern

## Source

Local reference project: `E:\competiton2`.

Relevant files inspected:

- `backend/services/asr_service.py`
- `backend/core/config.py`
- `backend/test_asr_service.py`
- `frontend/src/audio/AudioCapture.ts`
- `README.md`

## Findings

`competiton2` does not rely on the browser Web Speech recognition service for its
primary ASR path. It captures audio in the browser, sends audio bytes to the
backend, and the backend uses an OpenAI-compatible audio transcription API.

The backend ASR defaults are:

- `ASR_ENGINE=openai`
- `ASR_OPENAI_MODEL=whisper-1`
- base URL inherited from the OpenAI-compatible provider config unless an
  ASR-specific base URL is set
- transcription endpoint semantics equivalent to `/audio/transcriptions`

The Python backend converts buffered Float32 audio into a mono 16 kHz WAV file
and posts it through the OpenAI SDK as multipart form data:

- `model`
- `file=("audio.wav", wav_bytes, "audio/wav")`
- `response_format="json"`
- optional `language`

The frontend audio capture is a continuous streaming design using AudioWorklet
with ScriptProcessor fallback. That is appropriate for a live interpreter, but
it is heavier than needed for this project because the current app already has a
request/response Chat Completions flow.

## Mapping To Competition3

The current Cloudflare Worker app should use a simpler request/response ASR
path:

1. Browser records a short utterance with `MediaRecorder`.
2. Browser posts the audio blob as `multipart/form-data` to a Worker endpoint,
   for example `POST /api/speech/transcription`.
3. Worker forwards the audio file to an OpenAI-compatible transcription
   endpoint.
4. Worker returns `{ success: true, text, model }`.
5. Frontend uses the returned text as the Chat message and reuses the existing
   `/api/chat/completion` route for the answer.

This keeps permanent API keys on the Worker, avoids browser-vendor speech
recognition network failures, and avoids requiring Realtime/WebRTC provider
support.

## Configuration Proposal

Add ASR-specific env vars so transcription can use the same or a different
provider from Chat Completions:

- `OPENAI_TRANSCRIPTION_MODEL`, default `whisper-1`
- `OPENAI_TRANSCRIPTION_BASE_URL`, optional fallback to `OPENAI_BASE_URL`
- `OPENAI_TRANSCRIPTIONS_PATH`, default `/audio/transcriptions`
- `OPENAI_TRANSCRIPTIONS_URL`, optional full URL override
- `OPENAI_TRANSCRIPTION_LANGUAGE`, optional default `zh`

Use `OPENAI_API_KEY` initially. A future task can add a separate
`OPENAI_TRANSCRIPTION_API_KEY` if needed.

## Risks

- Some third-party providers that support Chat Completions do not support audio
  transcriptions. The Worker must return actionable configuration errors.
- Workers can forward multipart audio, but should bound request size and
  accepted MIME types.
- `MediaRecorder` MIME support varies by browser. The frontend should choose the
  first supported type from a small list and send a friendly error when none is
  available.
- Continuous streaming ASR is out of scope for the MVP; use short utterances to
  keep latency and complexity reasonable.
