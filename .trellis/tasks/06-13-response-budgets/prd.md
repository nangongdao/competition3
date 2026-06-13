# Response Budgets

## Goal

Implement the roadmap 3.3 response-budget increment so the assistant can cap
expensive audio output, optionally request text-only model responses, and make
the active output policy visible in the cost-controls panel.

## Requirements

- Add a session request field `responseBudget` with presets `brief`,
  `standard`, and `detailed`.
- Map response budgets in the Worker session payload to
  `max_response_output_tokens` values:
  - `brief`: 300
  - `standard`: 800
  - `detailed`: 1600
- Add a concise-answer instruction when `responseBudget` is `brief`.
- Include the active response budget and token cap in the Worker cost policy
  returned to the browser.
- Add a workspace control for response budget selection before session start.
- Add a workspace checkbox for text-only responses. When enabled, every
  `response.create` event should use `modalities: ["text"]`; otherwise it
  should use `modalities: ["audio", "text"]`.
- Show the active response budget and response mode in the cost-controls panel.
- Preserve existing voice, push-to-talk, text-message, visual-context, frame
  pruning, and frame-difference behavior.
- Update project roadmap/design docs to mark response budgets implemented.

## Acceptance Criteria

- [ ] Invalid `responseBudget` values return `400 invalid_request`.
- [ ] Default sessions use `responseBudget: "standard"` and
  `max_response_output_tokens: 800`.
- [ ] Brief sessions send `max_response_output_tokens: 300` and include a
  brevity instruction in the upstream OpenAI session payload.
- [ ] Detailed sessions send `max_response_output_tokens: 1600`.
- [ ] Frontend session creation sends the selected `responseBudget`.
- [ ] Text-only mode changes client `response.create` payloads to
  `modalities: ["text"]`.
- [ ] Transcript rendering still handles text responses.
- [ ] Cost controls display both active response budget and active response
  mode.
- [ ] `corepack pnpm lint`, `corepack pnpm typecheck`,
  `corepack pnpm build`, and `corepack pnpm test` pass.

## Definition of Done

- Tests added or updated for Worker payload mapping and client response-event
  construction where practical.
- No new third-party dependencies.
- Documentation updated for shipped behavior.
- Work remains on a focused task branch and is ready for a stacked PR.

## Technical Approach

- Extend `src/worker/routes/realtime/types.ts` with a
  `realtimeResponseBudgetSchema` and expose a `RealtimeResponseBudget` type.
- Extend `RealtimeCostPolicy` with `responseBudget` and
  `maxResponseOutputTokens`.
- Extend the Worker session payload in
  `src/worker/routes/realtime/router.ts` with
  `max_response_output_tokens`, using small constants near the existing
  session defaults.
- Keep text-only response mode client-side by adding a response mode argument to
  the reusable `buildResponseCreateEvent` path in
  `app/modules/assistant/hooks/use-realtime-session.ts`.
- Add the response budget selector and text-only toggle to
  `app/modules/assistant/components/assistant-workspace.tsx`, following the
  existing turn-mode and cost-panel patterns.
- Update `docs/roadmap.md` and `docs/design.md` after implementation.

## Decision (ADR-lite)

**Context**: Audio output is the most expensive Realtime bucket. The roadmap
calls for session-level output caps plus an optional per-turn text-only mode.

**Decision**: Implement response budgets as server-enforced session presets and
text-only as a live client-side response mode.

**Consequences**: Budget selection is locked at session creation because it is
encoded into the Worker-created Realtime session. Text-only can be toggled
during a session because it only changes the next `response.create` event. This
keeps the implementation focused and avoids renegotiating media transport.

## Out of Scope

- Idle auto-disconnect from roadmap 3.4.
- Scripted A/B measurement backfill from roadmap 3.5.
- New deployment or Cloudflare account changes.
- New third-party dependencies.

## Technical Notes

- Roadmap source: `docs/roadmap.md` section 3.3.
- Design source: `docs/design.md` cost controls section.
- Backend files likely impacted:
  `src/worker/routes/realtime/types.ts`,
  `src/worker/routes/realtime/router.ts`,
  `src/worker/routes/realtime/router.test.ts`.
- Frontend files likely impacted:
  `app/modules/assistant/hooks/use-realtime-session.ts`,
  `app/modules/assistant/components/assistant-workspace.tsx`,
  `app/app.css`.
- Existing response creation is centralized in `buildResponseCreateEvent`,
  which is the safest place to make modalities configurable.
