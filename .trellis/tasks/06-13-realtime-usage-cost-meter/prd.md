# Realtime Usage Cost Meter

## Goal

Add a real cost measurement layer to the assistant: parse the `usage` field
that the OpenAI Realtime API returns in every `response.done` event, break it
down by modality buckets (text / audio / image, input / cached / output),
accumulate per-session totals, and render a usage meter with an estimated USD
cost. This is the measurement foundation that later cost optimizations
(conversation history pruning, frame dedup, push-to-talk, response budgets)
will be verified against.

## Why (not surface work)

Realtime billing re-charges the entire conversation history as input tokens on
every `response.create`. Without per-turn usage telemetry the snowball effect
is invisible and no optimization can be proven. OpenAI sends authoritative
usage data in `response.done`; the app currently discards it.

## What I Already Know

* `handleServerEvent` in `app/modules/assistant/hooks/use-realtime-session.ts`
  already receives `response.done` over the data channel and uses it only to
  flush transcript text.
* `response.done` carries `response.usage` with `input_tokens`,
  `output_tokens`, `input_token_details` (`text_tokens`, `audio_tokens`,
  `image_tokens`, `cached_tokens`, `cached_tokens_details`) and
  `output_token_details` (`text_tokens`, `audio_tokens`).
* Vitest is configured with default include globs, so a pure module under
  `app/modules/assistant/lib/` can be unit tested without DOM.

## Requirements

* New pure module `app/modules/assistant/lib/cost-model.ts`:
  * Types for bucketed usage totals.
  * `parseResponseUsage(event)` — defensive parse of a `response.done` server
    event (missing fields → 0).
  * `accumulateUsage(totals, turn)` — immutable accumulation.
  * `estimateCostUsd(totals)` — estimate from a single pricing-table constant
    (documented as an estimate, prices in one place).
* `useRealtimeSession` parses usage on `response.done`, tracks cumulative
  totals, turn count, and last-turn usage; resets when a new session starts.
* Workspace renders a usage panel: turn count, last-turn input tokens (shows
  the history snowball), cumulative bucket table, estimated cost.
* Unit tests for the cost-model pure functions.

## Acceptance Criteria

* [ ] `cost-model.ts` exports typed pure functions with no React imports.
* [ ] `parseResponseUsage` handles full, partial, and malformed usage objects.
* [ ] Usage totals accumulate across multiple `response.done` events and reset
      on new session start.
* [ ] UI shows: turns, last-turn input (total + cached), cumulative audio/text/
      image input, audio/text output, estimated USD cost.
* [ ] Pricing constants live in one table with a source comment and estimate
      disclaimer.
* [ ] Unit tests cover parse/accumulate/estimate including edge cases.
* [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` pass.

## Definition of Done

* Tests added for the new pure module.
* Docs updated: README feature list, design.md cost-control section.
* PR targeting `main` (stacked on `feat/text-input-dialogue`) with
  feature/implementation/verification description.

## Technical Approach

* Parse inside the existing `handleServerEvent` `response.done` branch; store
  via `useState` in the hook; expose `usageReport` from the hook result.
* Pricing table for `gpt-realtime` (USD per 1M tokens): text in 4.00, cached
  text in 0.40, audio in 32.00, cached audio in 0.40, image in 5.00, text out
  16.00, audio out 64.00. Marked as estimate; single constant.
* Last-turn input is rendered prominently because it exposes the history
  re-billing snowball that PR4 (history pruning) will reduce.

## Out of Scope

* Conversation history pruning (next PR).
* Frame dedup, push-to-talk, response budgets (later PRs).
* Server-side usage persistence.
