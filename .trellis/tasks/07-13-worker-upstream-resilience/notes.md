# Notes: Worker Upstream Resilience

## Current Implementation

- Shared request execution lives under `src/worker/lib/upstream/`.
- Circuit state is persisted by `UpstreamCircuitBreaker` using Durable Object SQLite storage.
- Chat, realtime, and transcription routes use the shared executor and return stable safe error codes.
- The circuit-breaker binding remains optional so local/unit route tests can fail open without a runtime namespace.

## Verification Completed

- `pnpm peers check`, lint, and typecheck pass.
- 113 Node/Vitest tests and 2 Workers-runtime Durable Object tests pass.
- Production build and Wrangler deploy dry-run pass.
- `wrangler types --check` confirms generated bindings are current.
- `wrangler check startup` completes successfully and the temporary CPU profile
  was removed after review.
- Reusable upstream reliability contracts are captured in
  `.trellis/spec/backend/upstream-resilience.md`.

## Delivery Status

- Focused commits are pushed on `feat/worker-upstream-resilience`.
- Pull request #25 targets `main` and is cleanly mergeable:
  https://github.com/nangongdao/competition3/pull/25
- Local production/SiliconFlow defaults remain intentionally uncommitted.
