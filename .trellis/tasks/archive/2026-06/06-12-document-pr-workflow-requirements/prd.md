# Document PR workflow requirements

## Goal

Make the competition delivery rules explicit in local project instructions so future AI sessions do not push completed work directly to `main` and instead use task-scoped branches, commits, and pull requests that satisfy `task.md`.

## Requirements

- Record the competition PR and commit rules from `task.md` in local AI-facing documentation.
- Require each development task to use a non-`main` branch and a pull request targeting `main`.
- Require PR titles and descriptions to include a clear feature summary, implementation approach, and verification method.
- Require small, single-purpose PRs and continued commit history rather than one final bulk submission.
- Keep the existing Trellis managed block intact and place project-specific instructions outside it.
- Document the same workflow in Trellis shared specs so future spec loading reinforces the requirement.

## Acceptance Criteria

- [ ] `AGENTS.md` contains project-specific PR workflow instructions outside the Trellis managed block.
- [ ] `.trellis/spec/shared/` contains a PR workflow guideline referenced by the shared index.
- [ ] The guideline explicitly references `task.md` as the authoritative competition requirement source.
- [ ] The current change is committed on a non-`main` branch and submitted as a GitHub PR to `main`.
- [ ] The PR body is not blank and includes feature description, implementation approach, and testing/verification.

## Definition of Done

- Documentation updated.
- No Trellis managed block is overwritten.
- Relevant validation commands pass or are documented if not applicable.
- Changes are committed, branch is pushed, and a PR is opened.

## Technical Approach

Update `AGENTS.md` for always-visible agent instructions and add `.trellis/spec/shared/pr-workflow.md` for Trellis-loaded project rules. Update `.trellis/spec/shared/index.md` to link the new guideline. Use GitHub CLI for PR creation because the local `task.py` CLI does not currently expose the `create-pr` command mentioned in `.trellis/workflow.md`.

## Decision (ADR-lite)

**Context**: `task.md` requires continuous commits and PR records. The previous delivery pushed directly to `main`, which satisfies remote synchronization but not the competition PR workflow.

**Decision**: Store the requirement in both `AGENTS.md` and Trellis shared specs, and use a branch PR for this corrective documentation task.

**Consequences**: Future sessions get the rule from startup instructions and Trellis spec loading. The already-pushed feature commits cannot be converted into a meaningful PR without rewriting history, so this task corrects the workflow forward.

## Out of Scope

- Rewriting existing `main` history.
- Reverting already-pushed feature commits.
- Implementing or modifying Trellis CLI support for `create-pr`.

## Technical Notes

- Source requirement: `task.md`.
- Existing Trellis shared index: `.trellis/spec/shared/index.md`.
- Project startup instructions: `AGENTS.md`.
- `python ./.trellis/scripts/task.py create-pr --help` currently fails because `create-pr` is not a supported command in the checked-in script.
