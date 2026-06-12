# Pull Request Workflow Requirements

> These rules adapt the competition requirements in `task.md` into the local
> development workflow. Treat `task.md` as the authoritative source when there
> is any conflict.

---

## Required Workflow

For every implementation, documentation, build, or refactor task:

1. Start from an up-to-date `main` branch.
2. Create a task-scoped branch before editing files.
3. Make focused Conventional Commits on that branch.
4. Push the branch to `origin`.
5. Open a GitHub pull request targeting `main`.
6. Leave `main` runnable after merge.

Do not push task work directly to `main` unless the user explicitly overrides
the competition PR workflow for that turn.

---

## PR Scope

- Each PR should do one coherent thing.
- Split large features into smaller PRs when practical.
- Avoid combining unrelated feature, refactor, documentation, and bookkeeping
  changes in one PR unless they are required to explain or verify the same task.

---

## PR Description Checklist

Every PR description must include:

- **Feature or change description**: what changed and how to use it.
- **Implementation approach**: key technical choices or core logic.
- **Verification**: commands run, manual checks performed, or why a check is not
  applicable.
- **Dependency disclosure**: new third-party libraries or frameworks, with
  `README.md` updated when dependencies are added.
- **Code provenance**: source notes for any reused prior code.

The PR description must not be blank and must match the actual diff.

---

## Trellis Task Handling

- Record the task branch and base branch in task metadata when possible:
  `task.py set-branch <task> <branch>` and
  `task.py set-base-branch <task> main`.
- If `.trellis/workflow.md` mentions `task.py create-pr` but the checked-in
  `task.py` does not provide that command, use `gh pr create` instead.
- For Codex inline work, complete the task on the branch, run verification,
  commit task changes, push the branch, and create the PR before reporting the
  task as complete.
