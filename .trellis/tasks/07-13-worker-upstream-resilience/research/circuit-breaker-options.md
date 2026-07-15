# Circuit Breaker Options for Worker Provider Calls

## Sources

- Cloudflare Workers best practices, retrieved 2026-07-13.
- Cloudflare Durable Objects best practices, retrieved 2026-07-13.
- Local Wrangler 4.99.0 configuration schema.
- Latest published `@cloudflare/workers-types`: `5.20260713.1`.

## Constraints

- Chat, Realtime session creation, and transcription are billable POST calls.
  Retrying them aggressively can duplicate work and cost.
- Worker isolates do not share reliable mutable module state. An in-memory
  circuit breaker is edge-local and disappears on isolate eviction.
- A true cross-request breaker needs a stateful binding. Durable Objects provide
  strongly consistent, persistent per-entity state and typed RPC.
- A single global Durable Object would be a bottleneck. The state should be
  sharded by provider origin and operation family.
- Durable Object state must be persisted before being treated as authoritative;
  in-memory fields may only be caches.

## Option A: Durable Object circuit breaker (recommended)

Create an `UpstreamCircuitBreaker` Durable Object and address instances by a
stable provider-operation key such as `origin:chat`, `origin:realtime`, and
`origin:transcription`.

The Worker asks the object whether a request may proceed, then records success
or a classified transient failure. The object persists consecutive failures,
state (`closed`, `open`, `half-open`), and `openUntil` in SQLite-backed storage.

Suggested policy:

- Open after 3 consecutive retry-exhausted transient failures.
- Stay open for 20 seconds.
- Permit one half-open probe after cooldown.
- Close and reset on probe success.
- Re-open with a longer 60-second cooldown on failed half-open probe.
- Do not count validation failures, provider 4xx other than 408/429, or client
  cancellation as breaker failures.

Pros:

- A real, persistent breaker across Worker isolates.
- Strong Cloudflare-native architecture that is demonstrable to judges.
- Deterministic state-machine tests and operational status metadata.

Cons:

- Adds a Durable Object binding, migration, RPC calls, and Workers-runtime test
  setup.
- Adds small coordination latency before/after provider calls.
- Must shard correctly to avoid a single global bottleneck.

## Option B: Edge-local in-memory breaker

Keep a module-level map of failure counters and cooldowns per provider endpoint.

Pros:

- Small code change with no binding or migration.
- Easy to unit-test.

Cons:

- Not shared across isolates or regions.
- State disappears on eviction and can disagree between requests.
- Conflicts with the production claim of a reliable Worker-wide circuit
  breaker; weaker competition story.

## Option C: No persistent breaker in this task

Implement timeout, inbound cancellation, bounded response reads, conservative
retry, safe errors, and structured logging now; defer breaker state.

Pros:

- Lowest deployment risk and quickest implementation.
- No additional Cloudflare product or test dependency.

Cons:

- Does not fully satisfy the requested熔断 behavior.
- Repeated provider outages still reach the upstream on every request.

## Retry Recommendation

- Maximum 2 total attempts by default (one retry).
- Retry only 408, 429, 500, 502, 503, and 504.
- Respect a short valid `Retry-After` value, otherwise use bounded jittered
  backoff.
- Do not retry client cancellation.
- Treat timeout/network failure conservatively. A retry can duplicate a
  billable POST, so send a stable idempotency key on both attempts and keep the
  retry count low. Third-party providers may ignore this header, which is why
  the policy remains one retry.

## Error Recommendation

- `upstream_timeout` -> 504.
- `upstream_rate_limited` -> 503 plus safe `Retry-After` when known.
- `upstream_circuit_open` -> 503 plus breaker retry delay.
- `upstream_unavailable` -> 503/502 according to whether the provider was
  reached and returned an invalid/failing response.
- Never return raw provider response bodies or endpoint URLs to the browser.
- Log request ID, operation, provider origin, status, attempt, duration, and
  breaker transition; never log keys, prompts, images, audio, or transcripts.
