# Add Worker-backed speech chat mode

## Goal

Make Chat mode support a reliable voice-to-text-to-answer loop without depending
on browser Web Speech recognition or Realtime/WebRTC provider support. The user
should be able to speak a short question, have the Worker transcribe the audio
through an OpenAI-compatible transcription endpoint, and receive a normal text
answer through the existing Chat Completions path.

## What I Already Know

- The current Chat mode can already send text and optional camera frames through
  `/api/chat/completion`.
- The current Chat voice input uses browser Web Speech recognition. That fails
  with browser/vendor network errors on the user's machine.
- Realtime push-to-talk requires a provider with Realtime/WebRTC support, which
  the current third-party Chat provider may not offer.
- `E:\competiton2` uses backend-backed ASR: browser audio capture plus an
  OpenAI-compatible `/audio/transcriptions` call with `whisper-1` or another
  transcription model.
- Cloudflare Worker is the right boundary for API keys and provider calls in
  this repo.

## Assumptions

- The user wants a practical demo flow more than true low-latency streaming
  voice.
- The current provider, or another provider the user can configure, supports an
  OpenAI-compatible transcription endpoint.
- Text answers are acceptable for the MVP; browser speech synthesis can remain
  optional.

## Requirements

- Add a Worker transcription endpoint that accepts a short browser-recorded
  audio file and calls an OpenAI-compatible transcription provider.
- Add frontend recording controls in Chat mode that do not depend on browser Web
  Speech recognition.
- After transcription succeeds, use a Chat voice send mode:
  - default mode: auto-send the recognized text through the existing Chat
    Completions flow;
  - optional mode: fill the text composer for user review before sending.
- Keep current keyboard input and image-question flows working.
- Show clear Chinese status/error messages when microphone permission,
  recording, transcription, or Chat completion fails.
- Document required Cloudflare environment variables for transcription.

## Acceptance Criteria

- [ ] In Chat mode, the user can record a short spoken question and get a text
      answer without starting Realtime.
- [ ] Chat voice input defaults to auto-send, with a visible option to switch
      to review-before-send.
- [ ] The Worker returns JSON for transcription success and failure; the
      frontend never tries to parse HTML as JSON.
- [ ] Missing API key, default transcription model behavior, invalid provider
      URL, bad audio upload, and provider failure are covered by route tests.
- [ ] Frontend tests cover recording support/failure state where practical.
- [ ] Lint, typecheck, tests, build, and demo verification pass.
- [ ] README and design docs explain the new transcription mode and deployment
      variables.

## Out Of Scope

- Continuous streaming ASR over WebSocket.
- Local Whisper inference inside the Cloudflare Worker.
- Provider-backed TTS audio generation.
- Replacing Realtime/WebRTC mode.
- Separate transcription API key unless needed during implementation.

## Research References

- `research/competition2-asr-pattern.md` - local reference project uses
  backend-backed OpenAI-compatible audio transcription instead of browser speech
  recognition.

## Technical Approach

Recommended MVP:

1. Frontend records short utterances with `MediaRecorder`.
2. Frontend posts the resulting audio blob to `POST /api/speech/transcription`.
3. Worker validates `multipart/form-data`, file size, MIME type, and provider
   configuration.
4. Worker forwards multipart form data to the configured transcription endpoint.
5. Worker parses `text` from the provider response and returns a normalized JSON
   response.
6. Frontend either sends the transcript to the existing Chat completion hook or
   inserts it into the composer based on the selected voice send mode.

## Feasible Approaches

### Approach A: Record short utterance and auto-send after transcription

The user clicks or holds a Chat voice button, recording stops, the Worker
transcribes, then the recognized text is immediately sent to Chat Completions.

Pros:

- Feels closest to a voice conversation.
- Minimal user steps.
- Avoids browser Web Speech recognition.

Cons:

- A bad transcription may send a wrong question unless the user retries.

### Approach B: Record short utterance and fill the text box

The Worker transcribes the audio and inserts the text into the composer. The
user reviews it and clicks Send.

Pros:

- Safer when transcription quality is uncertain.
- Easier to correct before spending Chat tokens.

Cons:

- Less conversational.
- One extra click.

### Approach C: Keep browser Web Speech as primary and add Worker ASR fallback

Try browser recognition first, then use Worker transcription on failure.

Pros:

- Can be fast when browser recognition works.

Cons:

- Preserves the unreliable path that triggered this task.
- More UI and state complexity.

## Open Questions

- None.

## Decision (ADR-lite)

Context: The user wants the interaction to feel like the original voice-dialogue
goal, but also asked whether a selectable mode would make sense.

Decision: Implement a simple Chat voice send mode selector. The default mode is
auto-send after Worker transcription. A secondary review-before-send mode fills
the existing text composer so the user can correct poor transcription before
spending Chat tokens.

Consequences: The default path remains conversational. The extra mode adds a
small amount of UI/state, but avoids making transcription errors irreversible.

## Definition Of Done

- Tests added or updated for backend route and relevant frontend behavior.
- Lint, typecheck, tests, build, and demo verification pass.
- Documentation updated for deployment variables and usage.
- Changes are committed on a task branch and opened as a focused PR targeting
  `main`.
