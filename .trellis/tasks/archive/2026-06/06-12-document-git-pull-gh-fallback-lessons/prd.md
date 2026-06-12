# Document Git pull and GitHub fallback lessons

## Goal

Capture the practical Git/GitHub lessons from this session in local project
documentation so future work can avoid repeated confusion around pull, push,
PR creation, and GitHub CLI fallback behavior.

## Requirements

- Document the difference between pulling remote changes and pushing local
  commits.
- Document the recommended pull command for this repository:
  `git pull --ff-only origin main`.
- Document how to verify remote URL, branch, divergence, and working tree state
  before syncing.
- Document how to diagnose push failures: distinguish authentication problems
  from network transport failures.
- Document when to use `gh auth status`, `gh pr create`, and `gh api` as
  fallbacks.
- Document the local/remote branch mismatch risk when a remote branch is created
  by GitHub API instead of normal `git push`.
- Keep the guidance in English and in Trellis shared specs, with a short pointer
  in `AGENTS.md`.

## Acceptance Criteria

- [ ] `.trellis/spec/shared/pr-workflow.md` includes a concrete sync checklist.
- [ ] `.trellis/spec/shared/pr-workflow.md` includes a push failure fallback
      checklist using `gh`.
- [ ] `.trellis/spec/shared/pr-workflow.md` warns about API-created remote
      branches not matching local commit hashes.
- [ ] `AGENTS.md` points future agents to the shared PR workflow spec for
      sync and fallback procedures.
- [ ] Changes are committed on `docs/pr-workflow-requirements` and added to
      PR #1.

## Definition of Done

- Documentation updated.
- Trellis task archived and session journal recorded.
- Markdown/diff checks pass.
- Existing project lint/typecheck/tests pass or are reported if not run.
- PR #1 reflects the new documentation changes.

## Technical Approach

Extend the existing `.trellis/spec/shared/pr-workflow.md` rather than creating a
separate Git troubleshooting document. This keeps PR requirements, pull/push
checks, and `gh` fallback rules in one place. Add a concise pointer in
`AGENTS.md` so future sessions discover the detailed checklist quickly.

## Decision (ADR-lite)

**Context**: This session showed repeated ambiguity between `pull`, `push`, and
PR creation. Normal Git push also failed several times with network transport
errors while `gh api` remained usable.

**Decision**: Store the operational runbook in the shared PR workflow spec and
reference it from startup instructions.

**Consequences**: Future AI sessions should check repository state before
acting, use `git pull --ff-only` for safe sync, diagnose GitHub connectivity
more quickly, and prefer branch PR updates over direct `main` pushes.

## Out of Scope

- Changing Git remotes or credentials.
- Rewriting previous commits.
- Adding automation scripts around GitHub API fallback.

## Technical Notes

- Existing PR: https://github.com/nangongdao/competition3/pull/1
- Current branch: `docs/pr-workflow-requirements`
- Source docs: `task.md`, `AGENTS.md`, `.trellis/spec/shared/pr-workflow.md`
