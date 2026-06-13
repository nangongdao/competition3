# Chat Mode Browser Speech Adapter

## Goal

Add a browser-side speech adapter for Chat Completions compatibility mode so the
demo can support microphone-style interaction and optional spoken answers even
when the selected third-party provider only exposes ordinary
`/chat/completions`.

## What I Already Know

* The user asked to continue development based on local development documents and their stated direction.
* The repository is a competition submission for an AI visual conversation assistant.
* Competition delivery requires focused task branches, continuous commits/PRs, non-empty PR descriptions, and documenting third-party libraries in `README.md`.
* Current branch: `feat/chat-completions-provider-mode`.
* Working tree was clean when this task started.
* `docs/design.md` lists all core Realtime, vision, cost, provider, and Chinese UI increments as implemented, with "Package final contest demo" still planned.
* The archived Chat Completions PRD explicitly left browser/provider STT and TTS out of scope.
* `README.md` states that Chat mode does not stream microphone audio or generate voice output unless a provider exposes separate STT/TTS APIs or the app adds a future browser speech adapter.
* The smallest doc-backed development increment is a frontend-only browser speech adapter for Chat mode.

## Requirements

* Add Chat-mode voice dictation that uses browser speech recognition when available.
* Recognition should populate/send the existing text message flow rather than creating a separate backend path.
* Add optional Chat answer reading through browser `speechSynthesis`.
* Keep Realtime mode behavior unchanged.
* Keep permanent provider API keys and provider URL configuration server-side only.
* Show clear Chinese UI labels/status/errors for unsupported browsers, active listening, recognition result, and speech playback.
* Avoid new third-party dependencies.
* Update README/design/roadmap notes if user-facing Chat-mode capability changes.
* Add focused tests for pure speech-adapter behavior where practical.

## Acceptance Criteria

* [x] In Chat mode, supported browsers expose a voice input control that can capture recognized speech into the existing message composer or send it through the existing Chat request path.
* [x] Unsupported browsers show a disabled or explanatory state instead of failing silently.
* [x] Chat assistant answers can be optionally read aloud through browser speech synthesis.
* [x] Realtime mode still uses the existing WebRTC microphone/audio behavior and is not affected by Chat speech controls.
* [x] No new backend secrets, provider endpoints, localStorage key handling, or third-party dependencies are introduced.
* [x] Lint/typecheck/test verification is run where available.
* [x] Any documentation updates required by the change are made.

## Definition of Done

* Tests added or updated where appropriate.
* Lint, typecheck, and relevant tests pass or known limitations are recorded.
* Docs/notes are updated if behavior changes.
* Rollout/rollback risk is considered if the change touches runtime behavior.

## Out of Scope

* Large architecture rewrites.
* Multiple unrelated feature additions in one PR.
* Direct push to `main`.
* Provider-specific STT or TTS APIs.
* Streaming Chat Completions responses.
* Persisting transcripts or speech preferences.
* Runtime language switching.

## Technical Approach

Use browser Web Speech APIs as a progressive enhancement in Chat mode:

* Add a small frontend speech adapter helper/hook around `SpeechRecognition` and `speechSynthesis`.
* Wire dictation into the existing `textDraft` and `sendChatTurn` flow.
* Add an optional "read Chat answers" toggle that speaks assistant responses after successful Chat requests.
* Keep the implementation guarded by feature detection and Chinese status text.
* Document browser support limitations honestly.

## Decision (ADR-lite)

**Context**: Chat Completions compatibility mode is the broadest third-party provider path, but it currently has text/vision only. Local docs explicitly name a future browser speech adapter as the lightweight way to add voice without requiring provider STT/TTS support.

**Decision**: Implement a frontend-only browser speech adapter for Chat mode. Reuse existing Chat requests and transcript UI; do not add provider-specific speech endpoints.

**Consequences**: The demo gains voice-style Chat interaction without new secrets or dependencies, but browser support and recognition quality depend on the user's browser/OS. Realtime mode remains the more capable low-latency streaming voice option.

## Technical Notes

* Task directory: `.trellis/tasks/06-13-continue-local-docs/`
* Research reference: `research/chat-mode-browser-speech-adapter.md`
* Source documents inspected:
  * `task.md`
  * `README.md`
  * `docs/design.md`
  * `docs/roadmap.md`
  * archived Chat Completions PRD
  * `.trellis/spec/frontend/index.md`
  * `.trellis/spec/frontend/hooks.md`
  * `.trellis/spec/frontend/components.md`
  * `.trellis/spec/shared/code-quality.md`
  * `.trellis/spec/shared/typescript.md`
* Likely implementation files:
  * `app/modules/assistant/components/assistant-workspace.tsx`
  * new frontend speech adapter hook/helper under `app/modules/assistant/`
  * `README.md`
  * `docs/design.md`
  * `docs/roadmap.md`