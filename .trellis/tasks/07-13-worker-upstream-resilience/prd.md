# Worker Upstream Request Resilience

## Goal

Improve the reliability and safety of all Worker-to-provider requests so the
demo fails quickly, retries conservatively, avoids cascading provider failures,
and returns stable client-facing error contracts without leaking upstream
details.

## What I already know

* Chat completion, Realtime session creation, and speech transcription each
  call an OpenAI-compatible provider directly with `fetch`.
* None of the three Worker provider calls currently has an explicit timeout or
  shared cancellation/retry policy.
* Chat and speech currently buffer and surface upstream error text.
* The repository requires one coherent change per task/PR and no new dependency
  unless documented.
* A reliable cross-isolate circuit breaker needs durable shared state; mutable
  module-level state is not a correct Worker-wide breaker.

## Assumptions (temporary)

* Use conservative retries because the upstream operations are POST requests
  and may be billable or non-idempotent.
* Preserve the existing public success response shapes.
* Keep the resilience implementation provider-compatible rather than relying
  on a provider-specific SDK.

## Open Questions

* None.

## Research References

* [`research/circuit-breaker-options.md`](research/circuit-breaker-options.md) -
  compares a persistent Durable Object breaker with edge-local and deferred
  alternatives; recommends a provider-operation-sharded Durable Object.

## Expansion Sweep

### Future evolution

* Preserve operation/provider policy objects so per-provider timeout and retry
  configuration or multi-provider failover can be added later.
* Expose breaker transition logs now; a read-only admin health endpoint can be
  added in a later operational task.

### Related scenarios

* Chat, Realtime session creation, and speech transcription must share the same
  failure taxonomy while keeping their existing route-specific response codes.
* Browser fetch cancellation should remain separate from provider timeout so
  user navigation does not count as provider failure.

### Failure and edge cases

* Avoid retry storms and duplicate billable POST work.
* Do not count client 4xx, invalid provider payloads, or user cancellation as
  circuit-breaker failures.
* Bound `Retry-After`, error-body reads, retry delay, and total request time.

## Requirements (evolving)

* Apply a shared upstream request policy to Chat, Realtime, and transcription.
* Abort upstream work when the inbound client request is cancelled.
* Enforce endpoint-appropriate timeouts.
* Retry only transient failures with a small bounded retry budget and jitter.
* Return stable, localized-safe error codes without upstream body leakage.
* Bound upstream error-body reads.
* Emit structured logs with request and attempt metadata, excluding secrets and
  request bodies.
* Add a persistent Durable Object circuit breaker, sharded by provider origin
  and operation family (`chat`, `realtime`, or `transcription`).
* Open the circuit after three consecutive retry-exhausted transient failures,
  use a 20-second initial cooldown, permit one half-open probe, and extend the
  cooldown to 60 seconds when that probe fails.
* Persist breaker state before treating transitions as authoritative.

## Acceptance Criteria (evolving)

* [ ] Timeout failures return a stable 504-style API error code.
* [ ] Client cancellation aborts the provider fetch.
* [ ] Retryable status codes use the configured bounded retry policy.
* [ ] Non-retryable 4xx responses are not retried.
* [ ] Open circuits fail fast without contacting the provider.
* [ ] Provider error bodies are not returned directly to clients.
* [ ] Existing success contracts continue to pass.
* [ ] Unit/integration tests cover timeout, cancellation, retry, breaker, and
      safe error mapping.
* [ ] Lint, typecheck, tests, build, and Wrangler dry-run pass.

## Definition of Done

* Tests added or updated for all three provider routes.
* Shared resilience code is separated from route orchestration.
* No permanent key, audio, image, prompt, or transcript content is logged.
* Environment/config changes are documented.
* Rollout and rollback behavior is documented.

## Technical Approach

Create a shared `src/worker/lib/upstream/` resilience layer responsible for
request IDs, timeout/cancellation composition, bounded retry with jitter,
bounded upstream error reads, error classification, safe API mapping, and
structured provider-call logs.

Create an `UpstreamCircuitBreaker` Durable Object using SQLite-backed storage
and typed RPC. Address each instance with a stable hashable name derived from
the provider origin plus operation family, avoiding a single global object.
Routes ask the breaker for permission before the provider call and record only
retry-exhausted transient failures. Client cancellation, validation failures,
and non-retryable provider 4xx responses do not affect the circuit.

Use at most two attempts. Retry only 408, 429, 500, 502, 503, and 504, with a
bounded `Retry-After` or jittered backoff. Reuse a cryptographically generated
idempotency key across attempts. Preserve existing success shapes and map new
failure classes to stable route error codes.

## Decision (ADR-lite)

**Context**: Reliable circuit state cannot live in mutable Worker module state
because isolates are distributed and evictable. The project also benefits from
demonstrating a Cloudflare-native stateful reliability primitive.

**Decision**: Use a provider-operation-sharded Durable Object with persisted
closed/open/half-open state, combined with a stateless shared upstream request
utility for timeout, cancellation, retry, safe errors, and logging.

**Consequences**: The Worker gains an additional binding, migration, and small
coordination latency. Deployment and testing become more involved, but the
breaker is real across isolates rather than best-effort local state.

## Out of Scope

* Authentication, per-user quotas, and billing.
* Refactoring the 2,132-line workspace component or 1,100-line Realtime hook.
* Provider failover across multiple base URLs.
* Changing frontend success flows.

## Technical Notes

* Relevant routes: `src/worker/routes/chat/router.ts`,
  `src/worker/routes/realtime/router.ts`, and
  `src/worker/routes/speech/router.ts`.
* Shared utilities should live under `src/worker/lib/` or an equivalent backend
  shared module per repository conventions.
* Current tests run in Node Vitest with mocked `fetch`; a Durable Object option
  may require Workers-runtime test coverage.
