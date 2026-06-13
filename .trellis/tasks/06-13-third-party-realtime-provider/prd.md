# Third-Party Realtime Provider Configuration

## Goal

Allow the project to connect to third-party API providers that implement an OpenAI-compatible Realtime WebRTC surface, while keeping API keys server-side and giving the user explicit startup commands, parameter meanings, and provider/model requirements.

## What I Already Know

* The current Worker creates Realtime sessions with `OPENAI_API_KEY`.
* The current Worker hardcodes `https://api.openai.com/v1/realtime/sessions`.
* The current browser hook hardcodes `https://api.openai.com/v1/realtime` for the WebRTC SDP exchange.
* The user wants third-party API站接入, clear startup commands, parameter definitions, and model requirements.
* The user offered either a startup script or a post-start settings UI. For security, API keys should stay in Worker environment variables instead of browser UI/localStorage.

## Requirements

* Add server-side configuration for an OpenAI-compatible Realtime provider base URL.
* Return the configured WebRTC SDP endpoint from the Worker session response so the browser no longer hardcodes the OpenAI endpoint.
* Preserve current OpenAI defaults when no third-party provider variables are set.
* Document all environment parameters and their meanings in README.
* Add a local startup helper script that creates `.dev.vars` from explicit user input and starts the Worker.
* Document third-party provider/model requirements clearly.
* Avoid exposing permanent API keys in frontend code, browser storage, or URL parameters.

## Acceptance Criteria

* [ ] Existing OpenAI configuration still works with default values.
* [ ] A third-party Realtime-compatible base URL can be configured through `.dev.vars`.
* [ ] Browser WebRTC SDP exchange uses the Worker-provided URL.
* [ ] README includes exact startup commands and parameter descriptions.
* [ ] README includes provider/model compatibility requirements.
* [ ] A Windows startup script exists for local setup.
* [ ] Lint, typecheck, tests, and build pass.

## Definition of Done

* Tests added or updated for provider URL mapping.
* Lint / typecheck / tests / build pass.
* Docs updated for startup and third-party provider setup.
* No new third-party dependencies unless unavoidable.

## Technical Approach

Use Worker environment variables as the provider configuration boundary:

* Keep `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, and `OPENAI_REALTIME_VOICE`.
* Add `OPENAI_REALTIME_BASE_URL` for the Realtime API root, defaulting to `https://api.openai.com/v1/realtime`.
* Worker creates sessions at `${OPENAI_REALTIME_BASE_URL}/sessions`.
* Worker returns `webrtcUrl` for the browser SDP POST, including the selected model query parameter.
* Browser posts SDP to `sessionResponse.webrtcUrl` instead of a hardcoded OpenAI URL.

## Decision (ADR-lite)

**Context**: Third-party API providers may use OpenAI-compatible API keys and endpoints, but the permanent key must not be entered into a browser settings page.

**Decision**: Implement server-side provider configuration plus a startup script, not a frontend API-key settings form.

**Consequences**: This supports local and deployment configuration safely. Providers that only implement Chat Completions/Responses, or do not support Realtime WebRTC sessions, still cannot be used directly.

## Out of Scope

* Chat Completions or Responses fallback for non-Realtime providers.
* Browser-side API key entry or localStorage key persistence.
* Runtime switching between multiple providers inside one browser session.
* Verifying any specific third-party provider's live compatibility without credentials.

## Technical Notes

* Relevant Worker files: `src/worker/routes/realtime/router.ts`, `src/worker/routes/realtime/types.ts`, `src/worker/types.ts`.
* Relevant frontend file: `app/modules/assistant/hooks/use-realtime-session.ts`.
* Docs to update: `README.md`, possibly `docs/design.md` / `docs/roadmap.md`.
