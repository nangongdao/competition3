# Idle Auto-Disconnect

## Goal

Close forgotten-open Realtime sessions earlier than the existing 10-minute hard
cap by tracking meaningful activity and disconnecting after sustained idle time.
This reduces avoidable server VAD turns and idle billing without interrupting
active conversations.

## What I Already Know

* `docs/roadmap.md` lists Idle auto-disconnect as planned increment 3.4.
* The roadmap specifies meaningful activity as speech started, text sent, frame
  sent, and response done.
* The expected policy is a warning at about 90 seconds idle and automatic close
  at about 120 seconds idle.
* The existing 10-minute hard cap lives in `useRealtimeSession` and should
  remain as an outer bound.
* Transcript system messages are the existing visible channel for automatic
  session notices.

## Requirements

* Track the last meaningful Realtime activity timestamp inside
  `useRealtimeSession`.
* Treat at least these events as meaningful activity:
  speech started, user text sent, visual frame sent, push-to-talk release that
  commits audio, and response done.
* Check idle state on an interval and emit one transcript warning when the
  warning threshold is reached.
* Close the Realtime connection automatically when the idle disconnect threshold
  is reached.
* Keep the existing max session duration timer in place.
* Keep the implementation client-side only; no new backend schema or
  third-party dependency is needed.

## Acceptance Criteria

* [ ] Idle warning appears once after the warning threshold when no meaningful
      activity occurs.
* [ ] Idle disconnect closes the data channel/peer connection and returns the
      UI to the ready/idle state.
* [ ] Any meaningful activity resets the warning and disconnect timers.
* [ ] Active conversations do not disconnect while activity continues within
      the threshold window.
* [ ] The 10-minute hard cap still closes sessions independently.
* [ ] Unit tests cover idle decision behavior with synthetic timestamps.

## Definition of Done

* Tests added or updated for pure idle-time decision logic.
* `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build`, and
  `corepack pnpm test` pass.
* `docs/roadmap.md` and `docs/design.md` reflect the implemented status.
* PR description includes feature, implementation, verification, dependency
  disclosure, and provenance.

## Technical Approach

Add idle timeout constants next to the existing Realtime session constants and
extract pure decision helpers so time-threshold behavior can be unit-tested
without a browser connection. `useRealtimeSession` will store the last activity
timestamp and warning state in refs, start a 30-second interval once the data
channel is connected, and clear it on all close paths. Activity recorders will
run from existing server-event and client-send paths.

## Decision (ADR-lite)

**Context**: Idle billing is caused by abandoned sessions, while active
conversations should continue until the existing hard cap.

**Decision**: Implement an activity-based client timer rather than a visible
fixed countdown. Warning and close notices go to the transcript because that is
already where session lifecycle messages appear.

**Consequences**: This is simple and low-risk, but browser background tab timer
throttling can delay the exact close time. The next interval tick still closes
the session once the elapsed idle duration exceeds the threshold.

## Out of Scope

* Backend-configurable idle thresholds.
* A visible countdown or countdown progress UI.
* Persisted analytics or usage export.
* Changes to Realtime session creation payloads.

## Technical Notes

* Relevant docs: `docs/roadmap.md`, `docs/design.md`,
  `.trellis/spec/frontend/hooks.md`, `.trellis/spec/frontend/type-safety.md`,
  `.trellis/spec/frontend/quality.md`, `.trellis/spec/shared/code-quality.md`,
  `.trellis/spec/shared/typescript.md`,
  `.trellis/spec/shared/pr-workflow.md`.
* Likely implementation file:
  `app/modules/assistant/hooks/use-realtime-session.ts`.
* UI status copy may need a small update in
  `app/modules/assistant/components/assistant-workspace.tsx`.
* Existing tests in `app/modules/assistant/hooks/use-realtime-session.test.ts`
  are the natural place for pure helper tests.
