# Interface Localization for Contest Demo

## Goal

Improve the contest demo experience by making the browser workspace default to Chinese UI copy while preserving the existing Realtime behavior, cost controls, and measurement workflow.

## What I Already Know

* The contest brief asks for an AI visual dialogue assistant that can use camera video context, microphone audio, and appropriate AI responses.
* The repository already implements the core browser workspace, camera/microphone permission flow, WebRTC Realtime session, visual frame sampling, usage meter, frame pruning, response budgets, push-to-talk, and idle auto-disconnect.
* `docs/roadmap.md` lists "Interface localization (Chinese)" as a candidate increment with high demo value and low cost-risk.
* Most visible UI copy is concentrated in `app/modules/assistant/components/assistant-workspace.tsx`.
* Some runtime transcript/error copy is in `app/modules/assistant/hooks/use-realtime-session.ts`.
* This task should not introduce new dependencies and should stay frontend-only unless inspection reveals a necessary type or documentation update.

## Assumptions

* Chinese should be the default visible language because the contest brief and expected demo audience are Chinese.
* Technical names that users recognize, such as JSON, CSV, Realtime, VAD, and WebRTC, can remain in English or mixed copy where clearer.
* This PR should avoid redesigning layout or changing runtime behavior.

## Requirements

* Default to the Chinese interface localization increment confirmed by the user.
* Translate primary visible workspace copy to concise Chinese:
  * page title and product header
  * session/media/realtime state labels
  * control buttons and form placeholders
  * cost-control labels/details
  * usage meter labels and explanatory note
  * visual context, frame stats, transcript, and key-safety copy
  * initial transcript and client-side system notices
* Preserve existing component structure, state transitions, Realtime payloads, and cost-control behavior.
* Keep download labels and file extensions (`JSON`, `CSV`) unchanged.
* Keep code type-safe with no new `any` or non-null assertions.
* Update `docs/roadmap.md` and/or `docs/design.md` only if the implemented scope changes the documented feature status.

## Acceptance Criteria

* [ ] Running the app shows Chinese copy by default across the main assistant workspace.
* [ ] Existing Realtime session controls still enable/disable under the same conditions.
* [ ] Usage export still uses JSON/CSV downloads and does not change report serialization.
* [ ] Existing tests pass.
* [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` pass or any environment blocker is documented.

## Definition of Done

* Tests added or updated if behavior-facing helpers change.
* Lint, typecheck, build, and tests are run.
* Documentation is updated if the roadmap/design status changes.
* No new third-party dependencies are introduced.
* Work remains on a task branch and is ready for a focused PR.

## Technical Approach

* Keep the change scoped to string copy first.
* Prefer a local copy map or small constants only if it reduces repetition without broad refactoring.
* Do not alter Realtime event shapes, cost policy types, usage report serialization, or media handling.
* After code changes, manually inspect the UI for overflow risk because Chinese labels have different lengths than the current English copy.

## Decision (ADR-lite)

**Context**: The roadmap lists Chinese interface localization as a high-demo-value candidate increment. The app already has core Realtime, vision, audio, and cost-control functionality, so the next PR can improve presentation without destabilizing protocol behavior.

**Decision**: Implement Chinese as the default visible interface language for the assistant workspace. Keep technical protocol names and export labels where they are clearer in English.

**Consequences**: The demo becomes more appropriate for the contest audience while avoiding the extra scope of runtime language switching. Future localization can extract the same copy into a formal i18n map if needed.

## Out of Scope

* Multi-language runtime switching.
* Browser locale detection.
* Redesigning layout, colors, or interaction flows.
* Translating source-code identifiers, public API field names, or exported report schema.
* Running live Realtime A/B measurement sessions with `OPENAI_API_KEY`.

## Technical Notes

* Relevant docs inspected:
  * `task.md`
  * `README.md`
  * `docs/design.md`
  * `docs/roadmap.md`
  * `.trellis/spec/frontend/index.md`
  * `.trellis/spec/backend/index.md`
  * `.trellis/spec/shared/index.md`
  * `.trellis/spec/big-question/index.md`
* Likely implementation files:
  * `app/modules/assistant/components/assistant-workspace.tsx`
  * `app/modules/assistant/hooks/use-realtime-session.ts`
* Candidate docs:
  * `docs/design.md`
  * `docs/roadmap.md`
