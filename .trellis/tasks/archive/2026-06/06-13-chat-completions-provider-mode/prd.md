# Add Chat Completions Provider Mode

## Goal

Add a non-Realtime compatibility mode so the project can connect to common
third-party OpenAI-compatible API providers that expose `/v1/chat/completions`
but do not support OpenAI Realtime WebRTC.

## What I Already Know

* The current app supports browser media capture and OpenAI Realtime through a
  Worker-issued short-lived session.
* The user cannot find third-party providers that support the Realtime WebRTC
  protocol and wants a mode that works with most third-party API sites.
* Existing Realtime support must remain available because it is still the best
  fit for low-latency microphone audio.
* Permanent provider API keys must stay server-side in Worker runtime bindings.

## Requirements

* Add a `chat` provider mode alongside the existing `realtime` mode.
* Add a Worker route that accepts user text plus an optional sampled camera
  frame and calls a configured OpenAI-compatible `/chat/completions` endpoint.
* Support configurable provider URL, endpoint path/full URL, and chat model via
  Worker environment variables.
* Add a safe provider configuration endpoint that exposes only non-secret UI
  defaults, especially the default provider mode.
* Add frontend behavior for Chat Completions mode:
  * no WebRTC session creation is required;
  * typed messages can be sent through the chat endpoint;
  * visual questions can include a current camera frame;
  * the UI remains able to switch back to Realtime mode.
* Keep `OPENAI_API_KEY` out of browser code, `VITE_*` variables, localStorage,
  and URL parameters.
* Update startup documentation and scripts so third-party Chat Completions mode
  is easy to run on Windows.

## Acceptance Criteria

* [x] `POST /api/chat/completion` returns a text answer for a mocked successful
      OpenAI-compatible Chat Completions response.
* [x] The chat route returns clear 503 errors for missing API key, missing chat
      model, or invalid provider URL configuration.
* [x] The chat route returns 400 for invalid request bodies and 502 for upstream
      provider failures.
* [x] The frontend can operate in Chat Completions mode without starting a
      Realtime/WebRTC session.
* [x] Existing Realtime mode and tests continue to pass.
* [x] README documents exact startup commands, all new parameters, and model
      requirements for third-party Chat Completions providers.
* [x] Lint, typecheck, tests, and build pass.

## Definition of Done

* Tests added or updated for new backend contracts and critical frontend hook
  behavior.
* Lint, typecheck, test, and build pass with `corepack pnpm`.
* Documentation reflects the new default third-party-compatible path.
* No new third-party dependency is introduced unless documented.

## Technical Approach

Add a new backend API module under `src/worker/routes/chat/` with Zod schemas
and route tests. The Worker constructs a Chat Completions request using the
provider API root and model from runtime bindings. The browser sends only text
and optional image data URLs to the Worker.

Add a small provider config route under `src/worker/routes/provider/` so the
frontend can default to `OPENAI_PROVIDER_MODE` without exposing secrets.

Add frontend hooks for provider config and chat completion. Update the assistant
workspace to switch between Chat Completions mode and Realtime mode. Chat mode
uses the existing camera frame capture path and transcript UI, while Realtime
mode keeps the existing WebRTC behavior.

## Decision (ADR-lite)

**Context**: Most third-party "OpenAI-compatible" providers implement
`/v1/chat/completions`, while Realtime WebRTC is much less widely supported.

**Decision**: Implement Chat Completions as a separate provider mode rather than
trying to emulate Realtime over ordinary HTTP.

**Consequences**: Chat mode has broad provider compatibility but does not offer
native low-latency microphone streaming or remote assistant audio. Realtime mode
remains available for providers that support it.

## Out of Scope

* Browser or provider STT transcription for microphone input in Chat mode.
* TTS/audio playback for Chat mode.
* Streaming Chat Completions responses.
* Persisting provider API keys or base URLs through a browser settings page.
* Server-side conversation memory storage.

## Technical Notes

* Relevant backend specs: `.trellis/spec/backend/api-module.md`,
  `.trellis/spec/backend/api-patterns.md`,
  `.trellis/spec/backend/type-safety.md`,
  `.trellis/spec/backend/environment.md`,
  `.trellis/spec/backend/security.md`.
* Relevant frontend specs: `.trellis/spec/frontend/hooks.md`,
  `.trellis/spec/frontend/type-safety.md`,
  `.trellis/spec/frontend/components.md`,
  `.trellis/spec/frontend/quality.md`.
* Relevant shared specs: `.trellis/spec/shared/code-quality.md`,
  `.trellis/spec/shared/typescript.md`,
  `.trellis/spec/shared/pr-workflow.md`.