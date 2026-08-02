# Upstream Provider Resilience

## 1. Scope / Trigger

Use this contract whenever a Worker route performs a billable or
availability-sensitive request to an OpenAI-compatible provider. In this
project it applies to Chat Completions, Realtime session creation, and speech
transcription.

The goal is to bound latency and memory, avoid retry storms, prevent provider
error leakage, and coordinate failure state across Worker isolates.

## 2. Signatures

Shared executor:

```typescript
executeUpstreamRequest(input: {
  env: CloudflareBindings;
  operation: "chat" | "realtime" | "transcription";
  url: string;
  requestId: string;
  requestSignal: AbortSignal;
  policy: { timeoutMs: number; maxAttempts: number };
  buildRequestInit: (idempotencyKey: string) => RequestInit;
}): Promise<Response>;
```

Durable Object RPC:

```typescript
acquire(): CircuitPermit;
recordSuccess(generation: number): void;
recordFailure(generation: number): void;
recordNeutral(generation: number): void;
```

Wrangler binding and migration:

```toml
[[durable_objects.bindings]]
name = "UPSTREAM_CIRCUIT_BREAKER"
class_name = "UpstreamCircuitBreaker"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["UpstreamCircuitBreaker"]
```

After changing bindings, run `pnpm exec wrangler types` and include the
generated `worker-configuration.d.ts` in TypeScript compilation.

## 3. Contracts

### Request execution

* Use at most two attempts for billable POST operations.
* Retry only network failures, timeouts, and status `408`, `429`, `500`, `502`,
  `503`, or `504`.
* Reuse one cryptographically generated `Idempotency-Key` across attempts.
* Bound `Retry-After` and jittered delay to two seconds.
* Compose the inbound request signal with an endpoint-specific timeout.
* Cancel unused retryable response bodies before sleeping or returning.
* Read provider bodies with a byte limit; never call unbounded
  `response.text()` or `response.json()` on provider responses.

### Circuit breaker

* Shard by provider origin plus operation family; never use one global object.
* Persist `mode`, `consecutiveFailures`, `openUntil`, `generation`, and probe
  state in SQLite before treating a transition as authoritative.
* Open after three retry-exhausted transient failures.
* Use a 20-second initial cooldown, one half-open probe, and a 60-second
  cooldown after a failed probe.
* Ignore stale outcomes whose generation no longer matches current state.
* Client cancellation, provider validation errors, and non-retryable 4xx
  responses are neutral and do not increment the breaker.
* If the binding or RPC call is unavailable, fail open and emit a structured
  operational error; do not turn a control-plane fault into a total outage.

### Public errors and logs

Route responses use stable codes instead of provider bodies:

| Failure | HTTP | Code suffix |
| --- | ---: | --- |
| Client cancellation | 408 | `request_cancelled` |
| Timeout | 504 | `*_timeout` |
| Rate limit | 503 | `*_rate_limited` |
| Open circuit | 503 | `*_circuit_open` |
| Network/retry exhaustion | 502 | `*_unavailable` |

Structured logs may include request ID, operation, provider origin, attempt,
status, duration, retry delay, failure kind, and breaker transition. Never log
API keys, authorization headers, prompts, camera frames, audio, transcripts,
or provider response bodies.

## 4. Validation & Error Matrix

| Condition | Breaker outcome | Client behavior |
| --- | --- | --- |
| Inbound request aborted | Neutral | `408 request_cancelled` when a response can still be sent |
| Per-attempt timeout exhausted | Failure after final attempt | `504 *_timeout` |
| Provider `429` exhausted | Failure after final attempt | `503 *_rate_limited` plus bounded `Retry-After` |
| Provider retryable 5xx exhausted | Failure after final attempt | `502 *_unavailable` |
| Provider non-retryable 4xx | Neutral | Existing route-specific provider rejection code |
| Invalid provider success payload | Neutral | Existing `invalid_*_response` code |
| Circuit open or probe in flight | No provider request | `503 *_circuit_open` plus `Retry-After` |
| Breaker binding/RPC unavailable | No-op lease | Continue provider request and log the failure |

## 5. Good/Base/Bad Cases

* Good: a transient `503` is retried once with the same idempotency key, then a
  successful response records circuit success.
* Good: three retry-exhausted failures persist an open circuit; after cooldown,
  exactly one request becomes the half-open probe.
* Base: a route test omits the optional breaker binding; the provider call still
  executes and a structured `upstream_circuit_binding_missing` event is logged.
* Base: a provider returns an invalid success body; the route returns its stable
  invalid-response code without treating the provider as unavailable.
* Bad: return raw provider error text, URLs, or headers to the browser.
* Bad: keep breaker counters in module-level memory or use a single global DO.
* Bad: retry billable POST operations without a strict attempt budget.

## 6. Tests Required

* Unit-test retry classification, bounded `Retry-After`, timeout, cancellation,
  idempotency-key reuse, response-body limits, and final failure recording.
* Unit-test closed/open/half-open state transitions and stale-generation
  outcomes as pure logic.
* Route tests for all three operations must assert stable codes, status values,
  safe public messages, `Retry-After`, and unchanged success contracts.
* A Workers-runtime test using `@cloudflare/vitest-pool-workers` must invoke the
  real binding and RPC methods, inspect SQLite state, verify opening after three
  failures, enforce one half-open probe, and verify recovery after success.
* Required gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `pnpm exec wrangler deploy --dry-run`, and `pnpm exec wrangler types --check`.

## 7. Wrong vs Correct

Wrong:

```typescript
const response = await fetch(providerUrl, requestInit);
const providerError = await response.text();
return c.json({ success: false, error: providerError }, 502);
```

Correct:

```typescript
const response = await executeUpstreamRequest({
  env: c.env,
  operation: "chat",
  url: providerUrl,
  requestId: c.get("requestId"),
  requestSignal: c.req.raw.signal,
  policy: { timeoutMs: 30_000, maxAttempts: 2 },
  buildRequestInit: (idempotencyKey) => ({
    ...requestInit,
    headers: {
      ...requestInit.headers,
      "Idempotency-Key": idempotencyKey,
    },
  }),
});

if (!response.ok) {
  await response.body?.cancel();
  return c.json(
    { success: false, code: "chat_completion_failed" },
    502,
  );
}
```
