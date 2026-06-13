# Frame Difference Sampling

## Goal

Reduce avoidable Realtime image-input cost by skipping automatic camera frame
uploads when the scene has not materially changed, while keeping manual frame
capture deterministic for the user.

## Requirements

* Add a pure frame-difference module under `app/modules/assistant/lib/` that
  can compare downscaled grayscale frame signatures.
* Compute a normalized mean absolute luma delta in the range `0..1`.
* Use frame difference only for automatic interval sampling. Manual
  `Sample frame` and `Ask with frame` actions must always capture/send the
  current frame when the media and Realtime channel allow it.
* Keep the last uploaded automatic-frame signature and skip interval uploads
  when the difference is below the threshold.
* Start with a threshold around `0.04`, matching `docs/roadmap.md`.
* Show visible sent/skipped counters near existing visual context frame stats
  so the cost-control effect is inspectable during a demo.
* Preserve existing frame pruning, usage meter, text composer, WebRTC session,
  and media-permission behavior.

## Acceptance Criteria

* [ ] Identical frame signatures produce a `0` difference ratio.
* [ ] Small synthetic noise below the configured threshold is treated as
      skippable.
* [ ] A synthetic scene change above the threshold is treated as send-worthy.
* [ ] Automatic interval sampling sends the first available frame, then skips
      low-difference frames while incrementing the skipped counter.
* [ ] Manual visual actions bypass the difference gate.
* [ ] The visual context panel reports sent and skipped frame counts.
* [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` pass.

## Definition of Done

* Unit tests cover the pure frame-difference logic.
* UI counters are stable across desktop and mobile layouts.
* No new third-party dependency is introduced.
* README/design/roadmap are updated only if behavior documentation needs to
  change for the contest deliverable.

## Technical Approach

* Add `frame-diff.ts` with small, testable helpers:
  * `FRAME_DIFF_THRESHOLD = 0.04`
  * `frameDifferenceRatio(previous, next)`
  * `shouldSendFrame(previous, next, threshold)`
  * a browser-facing helper for extracting a grayscale signature from a canvas
    context or `ImageData` without involving network/model calls.
* In `AssistantWorkspace`, draw candidate frames to the existing capture
  canvas. For automatic sampling, derive a grayscale signature before JPEG
  serialization and compare against the last sent signature. If below the
  threshold, update the skipped counter and do not call `sendVisualContext`.
* Only update the last sent signature after a frame is actually accepted for
  upload. Manual captures update the preview and sampled count but bypass the
  skip gate.
* Show `Sent` and `Skipped` stats in the existing `frame-stats` grid.

## Decision (ADR-lite)

**Context**: The roadmap names frame-difference sampling as the next planned
increment and defines the cost lever: stop paying image tokens for static
scenes.

**Decision**: Implement client-side grayscale luma comparison with a fixed
threshold first, rather than adding a model-side classifier or a new image
processing dependency.

**Consequences**: Browser CPU does the cheap prefiltering and the first PR
stays dependency-free. The threshold is heuristic and can be tuned later from
usage-meter evidence.

## Out of Scope

* Push-to-talk and microphone mute controls.
* Response budget presets or text-only response mode.
* Idle auto-disconnect.
* Scripted A/B measurement backfill for `docs/design.md`.
* Server or Worker API changes.

## Technical Notes

* Contest requirements live in `task.md`: keep small PRs/commits, maintain a
  runnable app, and disclose dependencies/original work.
* Roadmap source: `docs/roadmap.md` section 3.1.
* Current capture/send logic is in
  `app/modules/assistant/components/assistant-workspace.tsx`.
* Realtime frame send validation and response creation live in
  `app/modules/assistant/hooks/use-realtime-session.ts`.
* Existing pure logic test style is shown by
  `app/modules/assistant/lib/cost-model.test.ts` and
  `app/modules/assistant/lib/frame-pruning.test.ts`.
