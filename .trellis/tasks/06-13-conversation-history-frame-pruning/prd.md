# Conversation History Frame Pruning

## Goal

Stop paying for consumed camera frames on every later turn. The Realtime API
re-bills the whole conversation history as input on each `response.create`;
sampled frames (~500-800 image tokens each at 640px) accumulate in history and
snowball. After the response that consumed a frame completes, delete the frame
item from the server-side conversation via `conversation.item.delete`, so each
frame is billed once instead of once per subsequent turn.

## Why this is the right cut

* Interval sampling at 8s over 10 minutes leaves ~75 frames ≈ 45k image tokens
  in history. Across 20 turns that history is re-billed every turn; pruning
  reduces image cost roughly 10x in that scenario.
* Pruning right after `response.done` deletes at the tail of the conversation,
  so the prompt-cache prefix for earlier history stays valid; only the
  just-generated response (a few hundred tokens) is cache-missed once.
* Conversational continuity survives: the assistant's own replies ("I see a
  red mug...") stay in history, so what it said about the scene persists even
  though the pixels are gone.
* The PR3 usage meter (last-turn input) is the verification instrument.

## Mechanism

1. Server confirms every created item with `conversation.item.created`; items
   whose content includes an `input_image` part are frame items — record id.
2. On `response.created`, pending frame ids become "in context" for the
   in-flight response (frames sampled mid-response stay pending for the next
   one).
3. On `response.done`, send `conversation.item.delete` for each consumed id,
   tagged with an `event_id` prefixed `evt_prune_` so delete failures (item
   already gone) can be silenced instead of surfacing as session errors.

## Requirements

* Pure module `app/modules/assistant/lib/frame-pruning.ts`:
  * `getCreatedImageItemId(event)` — detect created image items defensively.
  * `createFramePruneTracker()` — pending/in-flight/consumed id state machine.
  * `buildFramePruneEvent(itemId, sequence)` — tagged delete event.
  * `isFramePruneError(event)` — recognize prune-related server errors.
* Shared `isRecord` extracted to `lib/type-guards.ts` (used by cost-model,
  frame-pruning, and the hook — no triplicated guard).
* `useRealtimeSession` wires the tracker into `conversation.item.created`,
  `response.created`, `response.done`, and `error` handling; sends deletes
  when pruning is enabled; exposes `prunedFrameCount`; resets per session.
* Workspace: "Prune consumed frames" toggle (default ON) in sampling controls
  so the demo can show snowball vs pruned via the usage meter; "Pruned" stat
  in the visual context panel.

## Acceptance Criteria

* [ ] Frame items are tracked from `conversation.item.created` (image parts
      only; text/audio items never tracked).
* [ ] On `response.done` with pruning ON, one `conversation.item.delete` per
      consumed frame goes over the data channel with the `evt_prune_` tag.
* [ ] Frames created while a response is in flight are not deleted until the
      next response completes.
* [ ] Prune-related error events are ignored quietly; other errors still
      surface.
* [ ] Toggle OFF accumulates history (old behavior); toggling back ON affects
      newly consumed frames.
* [ ] `prunedFrameCount` resets when a new session starts.
* [ ] Unit tests cover the tracker state machine, event detection, delete
      event shape, and prune-error matching.
* [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` pass.

## Definition of Done

* Tests added for the new pure module.
* `docs/design.md` cost section: history pruning moved implemented, with the
  cache trade-off documented honestly.
* README feature list updated.
* Stacked PR targeting `feat/realtime-usage-cost-meter`.

## Out of Scope

* Pruning text/audio history (different trade-off: breaks what the model
  heard; candidate for a later summarization PR).
* Frame-difference sampling, push-to-talk, response budgets (later PRs).
