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

## Git Sync Checklist

Before starting or finishing task work, verify the repository state explicitly:

```bash
git remote -v
git status -sb
git branch --show-current
git pull --ff-only origin main
```

Interpret the results carefully:

- `Already up to date.` after `git pull --ff-only origin main` means the remote
  has no newer commits to pull into the current branch.
- `main...origin/main [ahead N]` means local commits need delivery through a
  branch/PR workflow. Pulling again will not upload those commits.
- `main...origin/main [behind N]` means remote has commits that must be pulled
  before new work continues.
- `ahead` and `behind` together means histories diverged; stop and inspect
  before merging or rebasing.
- Untracked `.trellis/tasks/` and `.trellis/workspace/` paths are often workflow
  bookkeeping, but classify them before committing.

For this competition repository, do not treat `git pull` as submission. Pull
only synchronizes remote changes into the local checkout; submission requires a
branch, commits, push, and PR.

---

## Push and GitHub CLI Fallback

If `git push` fails, identify whether the failure is authentication, branch
state, or network transport before retrying:

```bash
gh auth status
git remote -v
git status -sb
gh api repos/nangongdao/competition3 --jq .default_branch
```

Use these rules:

- If `gh auth status` fails or lacks `repo` scope, fix authentication first.
- If `gh api repos/nangongdao/competition3 --jq .default_branch` works but
  `git push` fails with connection reset, timeout, or port 443 errors, treat it
  as a Git HTTPS transport problem rather than a repository permission problem.
- Retry Git push once with HTTP/1.1 before using a fallback:
  `git -c http.version=HTTP/1.1 push -u origin <branch>`.
- If normal push remains unavailable but `gh api` works, use GitHub CLI to
  create/update the remote branch or create the PR, then verify the remote diff.

The local Trellis workflow may mention `task.py create-pr`; this checkout does
not currently provide that command. Use `gh pr create` instead:

```bash
gh pr create \
  --repo nangongdao/competition3 \
  --base main \
  --head <branch> \
  --title "<clear title>" \
  --body "<feature, implementation, verification>"
```

After any GitHub CLI fallback, verify what GitHub actually sees:

```bash
gh pr view <number> --repo nangongdao/competition3 --json url,state,headRefName,baseRefName,title
gh pr diff <number> --repo nangongdao/competition3 --name-only
```

---

## API-Created Branch Warning

Prefer normal `git push` whenever possible. If a branch is created or updated
through `gh api` instead of Git transport, the remote branch may have the same
file tree but a different commit SHA from the local branch. In that case:

- Do not assume local `HEAD` equals the remote PR head.
- Verify the PR diff with `gh pr diff`, not only `git log`.
- Keep the local branch clean and document that GitHub API fallback was used.
- For later updates, either restore normal Git push or intentionally update the
  remote branch through the same API-based process.

This warning matters because competition review is based on the GitHub PR and
commit record, not only the local checkout.

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
