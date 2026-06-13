# Document Development Roadmap

## Goal

Persist the cost-control development roadmap (analysis, planned features,
implementation methods, verification approach) into a local project document
so future sessions and reviewers can follow the plan without re-deriving it.
No feature code in this task.

## Requirements

* New `docs/roadmap.md` covering:
  * The realtime cost model analysis that drives the plan (pricing buckets,
    history re-billing snowball, idle burn).
  * Shipped increments (PR1-PR4) with one-line status.
  * Planned increments with concrete implementation methods, file targets,
    verification plans, and PR mapping: frame-difference sampling,
    push-to-talk, response budgets, idle auto-disconnect, design-doc
    measurement backfill, and candidate extras (interface localization,
    deployment, text-history summarization).
* Link the roadmap from README and from `docs/design.md`.
* English docs per project convention.

## Acceptance Criteria

* [ ] `docs/roadmap.md` exists with cost-model rationale, shipped list, and
      per-increment method/verification detail.
* [ ] README and design.md reference the roadmap.
* [ ] No application code changes.
* [ ] Lint/typecheck/build/test remain green (docs-only change).

## Definition of Done

* PR targeting the current stack tip (`feat/history-frame-pruning`) with
  description per competition rules.
