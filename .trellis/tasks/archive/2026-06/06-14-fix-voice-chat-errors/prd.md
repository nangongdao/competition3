# Fix Voice Input and Chat Completions Runtime Errors

## Goal

Restore a usable Chat Completions demo path after Cloudflare deployment by clarifying mode-specific controls, improving browser speech failure behavior, and making the Worker-side Chat Completions request compatible with third-party OpenAI-style providers that reject the current payload.

## What I Already Know

* The user reports that Chat mode and the push-to-talk button appear disabled, browser speech input repeatedly logs `语音识别服务网络异常。`, and typed `1+1` requests fail with `Chat Completions provider request failed with status 400`.
* The current local `wrangler.toml` is user-modified and sets `OPENAI_PROVIDER_MODE = "chat"`, `OPENAI_BASE_URL = "https://windhub.cc/v1"`, `OPENAI_CHAT_COMPLETIONS_PATH = "/chat/completions"`, and `OPENAI_CHAT_MODEL = "doubao-seed-2-0-lite-260428"`.
* In Chat mode, the left-side start session and push-to-talk controls are intentionally Realtime-only, but the UI does not make that distinction obvious enough.
* Browser speech recognition uses the Web Speech API. Its `network` error is produced by the browser recognition service, not by this app's Worker or the Chat provider.
* The Worker currently sends Chat Completions payloads with `max_tokens` and sends image content whenever the frontend includes a captured frame. Some compatible providers/models reject one or both of those fields with HTTP 400.

## Requirements

* Keep Chat mode text submission usable without requiring a Realtime session.
* Make Realtime-only buttons clearly disabled in Chat mode instead of appearing broken.
* Preserve the existing Chat-mode browser speech adapter, but make network failure messaging actionable and avoid a retry loop feeling like an app crash.
* Improve Worker Chat Completions compatibility for third-party OpenAI-style providers while preserving OpenAI defaults.
* Surface upstream 400 details to the frontend when the provider returns a structured error.
* Do not commit the user's `wrangler.toml` production variable edit or any secret value.

## Acceptance Criteria

* [x] In Chat mode, users can send typed text and receive a Chat Completions answer when provider credentials/model are valid.
* [x] Chat mode communicates that push-to-talk is Realtime-only and that Chat voice input uses browser speech recognition.
* [x] Browser speech `network` errors display a localized explanation that this is the browser speech service and typed input remains available.
* [x] Worker Chat requests can omit vision content or use a provider-compatible token limit field through environment configuration.
* [x] Existing OpenAI-compatible tests still pass, with new tests covering the compatibility configuration.
* [x] `pnpm lint`, `pnpm typecheck`, and relevant tests pass.

## Technical Approach

* Inspect existing frontend state gates in `AssistantWorkspace` and adjust labels/help text rather than changing the Realtime state machine.
* Extend the Chat Worker route with narrow environment-driven compatibility options for token field and vision inclusion. Defaults should preserve the current OpenAI-compatible payload.
* Keep permanent provider secrets server-side only.
* Update focused tests for Chat payload construction and browser speech error mapping.

## Out of Scope

* Adding provider-specific speech-to-text or text-to-speech APIs.
* Making browser Web Speech recognition work in networks/browsers where the browser vendor service is blocked.
* Changing Cloudflare secrets or committing deployment credentials.
* Replacing Realtime push-to-talk with Chat-mode raw audio upload.

## Technical Notes

* Relevant frontend files: `app/modules/assistant/components/assistant-workspace.tsx`, `app/modules/assistant/hooks/use-browser-speech-adapter.ts`, `app/modules/assistant/hooks/use-chat-completion.ts`.
* Relevant backend files: `src/worker/routes/chat/router.ts`, `src/worker/routes/chat/types.ts`, `src/worker/types.ts`.
* Relevant specs: `.trellis/spec/frontend/hooks.md`, `.trellis/spec/frontend/quality.md`, `.trellis/spec/backend/environment.md`, `.trellis/spec/backend/error-logging.md`, `.trellis/spec/shared/code-quality.md`, `.trellis/spec/shared/typescript.md`, `.trellis/spec/shared/pr-workflow.md`.
