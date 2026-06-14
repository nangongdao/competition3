# Competition2 ASR Pattern

## Source

Local reference project: `E:\competiton2`.

## Findings

`competiton2` uses a backend-backed ASR path rather than relying on browser Web
Speech recognition. The browser captures audio and the backend calls an
OpenAI-compatible audio transcription endpoint.

The useful pattern for this project is:

1. Browser records a short utterance.
2. Browser posts audio as `multipart/form-data` to a backend endpoint.
3. Backend calls `/audio/transcriptions` with `model`, `file`,
   `response_format=json`, and optional `language`.
4. Backend returns normalized text.
5. Frontend sends that text through the normal question-answer path.

## Configuration Proposal

- `OPENAI_TRANSCRIPTION_MODEL`, default `whisper-1`.
- `OPENAI_TRANSCRIPTION_BASE_URL`, optional fallback to `OPENAI_BASE_URL`.
- `OPENAI_TRANSCRIPTIONS_PATH`, default `/audio/transcriptions`.
- `OPENAI_TRANSCRIPTIONS_URL`, optional full endpoint override.
- `OPENAI_TRANSCRIPTION_LANGUAGE`, optional default language such as `zh`.

## Risks

- Not every Chat Completions provider supports audio transcription.
- Worker uploads should validate file size and MIME type.
- `MediaRecorder` MIME support varies by browser.
