# Add Separate ASR API Key

## Goal

Allow the speech transcription endpoint to use a transcription-specific provider
API key while preserving the existing shared `OPENAI_API_KEY` fallback. This
lets users configure separate Chat Completions and ASR providers in Cloudflare
without exposing either key to the browser.

## Requirements

* Add `OPENAI_TRANSCRIPTION_API_KEY` as an optional Worker secret.
* `/api/speech/transcription` must use `OPENAI_TRANSCRIPTION_API_KEY` when it is
  configured.
* If `OPENAI_TRANSCRIPTION_API_KEY` is not configured, the endpoint must keep
  using `OPENAI_API_KEY` for backward compatibility.
* Missing both keys must continue to return the existing
  `missing_openai_api_key` configuration error.
* Keep the existing transcription URL resolution behavior:
  `OPENAI_TRANSCRIPTIONS_URL` wins when set; otherwise the Worker appends
  `OPENAI_TRANSCRIPTIONS_PATH` to `OPENAI_TRANSCRIPTION_BASE_URL`, falling back
  to `OPENAI_BASE_URL`, then `https://api.openai.com/v1`.
* Update docs so Cloudflare users know where to put the ASR key and how `/v1`
  plus `/audio/transcriptions` are combined.

## Acceptance Criteria

* [x] Unit tests prove transcription uses `OPENAI_TRANSCRIPTION_API_KEY` when
  present.
* [x] Unit tests prove transcription falls back to `OPENAI_API_KEY` when the
  transcription-specific key is absent.
* [x] Unit tests prove the base URL plus path behavior still produces
  `/v1/audio/transcriptions` for a provider base ending in `/v1`.
* [x] README documents the new Worker secret and the URL composition behavior.
* [x] Lint, typecheck, tests, and build pass.

## Definition of Done

* Tests added or updated for the new configuration behavior.
* Existing provider configuration remains backward compatible.
* No secrets are committed.
* Documentation and Trellis specs are updated if the environment contract
  changes.

## Technical Approach

Add the new optional binding to the Worker environment type, resolve the speech
route API key from `OPENAI_TRANSCRIPTION_API_KEY ?? OPENAI_API_KEY`, and update
the route tests plus documentation. No frontend setting is added because
permanent provider keys must stay server-side in Cloudflare Worker secrets.

## Decision (ADR-lite)

**Context**: The project currently uses one server-side `OPENAI_API_KEY` for
Chat, Realtime, and ASR. Users may need separate providers or keys for ASR.

**Decision**: Add a transcription-specific optional secret with fallback to the
shared key.

**Consequences**: Existing deployments keep working, while users with separate
ASR credentials can configure them independently. The error code remains
`missing_openai_api_key` for compatibility even when the missing credential is
the ASR-specific key.

## Out of Scope

* Adding browser-side API key settings.
* Adding a separate Realtime key.
* Changing the provider request schema beyond the credential selection.

## Technical Notes

* Main Worker route: `src/worker/routes/speech/router.ts`
* Worker binding type: `src/worker/types.ts`
* Tests: `src/worker/routes/speech/router.test.ts`
* Docs: `README.md`, `.trellis/spec/backend/api-patterns.md`
