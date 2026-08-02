# Task Plan: Worker Upstream Resilience

## Goal

Deliver production-grade upstream request resilience for chat, realtime session creation, and speech transcription without changing successful API response contracts.

## Phases

- [x] Phase 1: Define requirements and architecture
- [x] Phase 2: Implement shared resilience primitives and Durable Object circuit breaker
- [x] Phase 3: Complete route/client integration and automated tests
- [x] Phase 4: Update documentation and project specifications
- [x] Phase 4.5: Add Workers-runtime Durable Object integration coverage
- [x] Phase 5: Run all quality gates and prepare focused commit plan

## Key Questions

1. Do timeout, cancellation, retry, and circuit-breaker transitions behave deterministically under concurrent requests?
2. Do all public error responses avoid leaking provider response bodies while preserving success contracts?
3. Are frontend error-code mappings and deployment configuration consistent with Worker behavior?

## Decisions Made

- Use a SQLite-backed Durable Object with typed RPC for cross-isolate circuit state.
- Retry at most once and reuse one idempotency key across attempts.
- Fail open if the optional circuit-breaker binding is unavailable.
- Keep the large workspace and Realtime Hook refactor outside this PR.

## Errors Encountered

- Initial lint found empty async no-op circuit lease methods; replace them with explicit resolved promises.
- Initial route regression tests found Realtime returning the bounded-reader wrapper instead of its parsed value; restore the original success contract by using `upstreamBody.value`.
- A targeted Vitest command was incompatible with the local pnpm command wrapper; use the repository's full `pnpm test` script for verification.

## Status

**Quality gates complete** - the implementation is ready for the focused commit
plan, push, and pull request after user confirmation.
