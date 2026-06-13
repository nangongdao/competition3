# Finalize Overall Delivery Readiness

## Goal

Bring the project to an overall deliverable state before doing cost-measurement
or optimization follow-up work. The focus is the main product/demo chain:
open PR stack health, runnable local demo paths, handoff documentation, and
clear remaining external blockers.

## What I Already Know

* The user wants overall completion first, with cost optimization and live cost
  measurement deferred until after the core delivery is closed.
* The repository is on `docs/final-demo-packaging` with a clean tracked worktree
  before this task was created.
* Open GitHub PRs form a strict stacked chain from #2 through #16. The first PR
  targets `main`; each later PR targets the previous feature/doc branch.
* `docs/design.md` marks the main user stories as implemented and lists the
  remaining live/hardware gaps separately.
* `docs/demo-verification.md` and `scripts/verify-demo.ps1` define the packaged
  local verification path.
* `docs/design.md` still contains pending live cost-control measurement rows;
  these are explicitly out of scope for this task.

## Requirements

* Audit the overall delivery state without starting cost A/B measurement work.
* Verify the local no-key/static readiness path using the packaged demo script.
* Check the open PR stack status and identify blockers to making `main`
  represent the current completed product.
* If verification allows, merge the existing open PR stack into `main` in
  base-first order.
* Keep any documentation or bookkeeping updates focused on delivery readiness.
* Preserve the competition workflow: no direct task work pushed to `main`, one
  coherent PR/change unit, and non-empty PR descriptions when new PRs are
  created.

## Acceptance Criteria

* [x] The PR stack from #2 through #16 has a clear base-first merge or handoff
  plan, and approved PRs are merged when GitHub permits it.
* [x] Local quality/demo readiness is verified with `scripts/verify-demo.ps1`
  or any failure is recorded with a concrete cause.
* [x] Remaining non-cost external blockers are listed explicitly, including
  provider credentials, browser hardware checks, and Cloudflare deployment
  ownership.
* [x] No cost-control live A/B runs or measurement-table backfill are performed
  in this task.
* [x] If repository files are changed, changes are committed on a task branch
  and delivered through a focused PR.

## Definition of Done

* Relevant docs/specs are checked against the actual repository state.
* Lint, typecheck, tests, and build are run when code or delivery scripts are
  changed; otherwise the demo readiness script is sufficient for audit-only
  verification.
* Any remote PR action is performed only after explicit user approval.
* Trellis task state is updated and archived after the work is complete.

## Out of Scope

* Live cost-control measurement table backfill.
* New cost optimization features.
* Provider-specific tuning beyond documenting whether credentials/config are
  present.
* Cloudflare deployment unless the user explicitly authorizes account-specific
  deployment work.

## Technical Notes

* PR workflow rules: `.trellis/spec/shared/pr-workflow.md`.
* Demo readiness script contract: `.trellis/spec/shared/pr-workflow.md`.
* Delivery docs: `README.md`, `docs/design.md`, `docs/roadmap.md`,
  `docs/demo-verification.md`.
* Quality scripts: `corepack pnpm lint`, `corepack pnpm typecheck`,
  `corepack pnpm test`, `corepack pnpm build`.
* Readiness wrapper: `.\scripts\verify-demo.ps1`.

## Open Questions

* None.

## Decision (ADR-lite)

**Context**: The project needs overall completion before cost measurement work.
The current implementation is already split across a stacked PR chain, so
making `main` represent the product requires remote PR merges in order.

**Decision**: After local readiness verification, execute remote PR merges
base-first from #2 through #16 when GitHub permits it. If a PR cannot be merged,
stop at that blocker and report the exact PR/status instead of skipping ahead.

**Consequences**: This moves the completed main product chain forward while
keeping cost A/B measurement out of scope. Because the PRs are stacked, later
PRs may need GitHub to recompute mergeability after each earlier merge.
