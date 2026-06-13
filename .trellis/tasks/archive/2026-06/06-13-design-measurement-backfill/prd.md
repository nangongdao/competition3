# Design-doc measurement backfill

## Goal

Support the final cost-control measurement pass described in `docs/roadmap.md`
by making Realtime usage data exportable and by documenting a repeatable
measurement protocol. The local environment does not currently expose
`OPENAI_API_KEY`, so this task prepares the measurement workflow and leaves the
actual A/B data table ready to fill from a configured machine or deployment.

## What I Already Know

* The next planned roadmap item is `3.5 Design-doc measurement backfill`.
* The implemented usage meter already parses authoritative `response.done`
  usage into modality buckets and estimated USD cost.
* The roadmap also lists `Session usage export` as a candidate that may be
  absorbed into the measurement PR.
* This local shell has no `OPENAI_API_KEY`, so it cannot run real Realtime A/B
  sessions in this task.

## Requirements

* Add a usage export path for the existing session usage meter.
* Export enough data to support the planned A/B comparisons: per-turn usage,
  session totals, estimated cost, and a timestamp.
* Keep export local to the browser; do not introduce storage, backend endpoints,
  or new third-party dependencies.
* Add or update tests for pure export formatting logic.
* Update `docs/design.md` with a measurement protocol and a results table
  scaffold that clearly distinguishes pending measurements from measured data.
* Update `docs/roadmap.md` to reflect that export/protocol support has shipped
  while real measurement requires a configured OpenAI key.

## Acceptance Criteria

* [x] The usage meter has controls to download JSON and CSV reports.
* [x] JSON export includes metadata, totals, last turn, and per-turn rows.
* [x] CSV export includes one row per Realtime response turn and a totals row.
* [x] Unit tests cover export serialization and empty-session behavior.
* [x] Documentation describes how to run the A/B measurements and where to
      record results.
* [x] `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build`,
      and `corepack pnpm test` pass.

## Definition of Done

* Tests added or updated for any pure logic.
* Lint, typecheck, build, and test pass locally.
* Documentation updated if user-visible behavior or delivery process changes.
* Task changes are committed on a task branch and delivered through a focused
  PR stacked on the previous roadmap branch.

## Technical Approach

Add export helpers near `cost-model.ts` so usage serialization stays with usage
accounting. Wire two download buttons into `AssistantWorkspace` beside the
existing meter, using browser-local data URLs generated from the serialized
report. Keep the design modest and avoid backend work because measurement data
is already authoritative in the browser from Realtime `response.done` events.

## Decision (ADR-lite)

**Context**: The planned final measurement item requires real usage data, but
the current environment cannot start authenticated Realtime sessions.

**Decision**: Ship a local usage export feature and documentation scaffold now,
then leave the actual A/B values as pending until a machine with
`OPENAI_API_KEY` can run the sessions.

**Consequences**: The task remains useful and testable without a live model
key. The final evidence table still needs measured values before competition
submission.

## Out of Scope

* Running authenticated Realtime A/B sessions in this environment.
* Adding server-side persistence, analytics, or file upload.
* Introducing new dependencies.
* Changing the underlying cost model or optimization behavior.

## Technical Notes

* Relevant files: `app/modules/assistant/lib/cost-model.ts`,
  `app/modules/assistant/components/assistant-workspace.tsx`,
  `app/app.css`, `docs/design.md`, `docs/roadmap.md`.
* Follow `.trellis/spec/frontend/*` and `.trellis/spec/shared/*` before code
  changes.
* Use `corepack pnpm ...` commands per local workflow guidance.
