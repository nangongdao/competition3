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

### Fast Fallback for This Repository

In this checkout, repeated Git HTTPS pushes have failed with connection resets
and port 443 timeouts even when `gh auth status` is healthy. Do not spend a long
session retrying the same transport path.

Use this escalation order:

1. Try normal push once:
   `git push -u origin <branch>`.
2. If it fails with reset/timeout, retry once with HTTP/1.1:
   `git -c http.version=HTTP/1.1 push -u origin <branch>`.
3. If HTTP/1.1 also fails and `gh api repos/nangongdao/competition3 --jq .name`
   works, stop retrying Git transport and use the GitHub REST API fallback.

Prefer the **small-blob Git Data API flow** for code/doc commits:

1. Resolve the remote base commit and tree from GitHub, not from the local
   equivalent commit:
   ```bash
   gh api repos/nangongdao/competition3/git/ref/heads/<base-branch> --jq .object.sha
   gh api repos/nangongdao/competition3/git/commits/<remote-base-sha> --jq .tree.sha
   ```
2. For each changed file, create a blob with `POST /git/blobs` using base64
   content. This keeps each request small and avoids the large-tree timeout seen
   with one huge JSON payload.
3. Create a tree with `POST /git/trees` using `base_tree: <remote-base-tree>`
   and the blob SHA entries for changed files.
4. Create a commit with `POST /git/commits` using parent
   `<remote-base-sha>`.
5. Create or update the branch ref with `POST /git/refs` or `PATCH
   /git/refs/heads/<branch>`.

For Trellis bookkeeping moves after `/finish-work` style cleanup, the Contents
API may be simpler than hand-building tree deletions:

- `PUT /contents/<path>` to create archived task files or update journal files.
- `DELETE /contents/<path>` to remove the old active task files.

Avoid these time sinks after the first failure:

- Do not keep repeating `git push`; one normal attempt plus one HTTP/1.1 retry
  is enough evidence for this repository.
- Do not build one large `POST /git/trees` payload with full file contents; it
  has timed out in this environment.
- Do not use local parent SHAs when the base branch was previously created by
  API fallback. Use the remote base SHA/tree from GitHub, otherwise the PR head
  can diverge or the branch update may be rejected.

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

## Demo Readiness Script Contract

Use `scripts/verify-demo.ps1` when a task needs final-demo or PR handoff
evidence beyond the raw package scripts.

### 1. Scope / Trigger

- Trigger: final contest demo packaging, PR handoff verification, or any task
  that needs a repeatable local demo readiness check.
- The script is a verification wrapper, not a provider test runner. It must not
  make model calls or print secret values.

### 2. Signatures

```powershell
.\scripts\verify-demo.ps1 `
  [-RunInstall] `
  [-SkipQuality] `
  [-SkipBuild] `
  [-RequireProviderConfig] `
  [-WorkerUrl "http://localhost:8787"]
```

### 3. Contracts

- `-RunInstall`: runs `corepack pnpm install --frozen-lockfile`.
- `-SkipQuality`: skips `corepack pnpm lint`, `typecheck`, and `test`.
- `-SkipBuild`: skips `corepack pnpm build`.
- `-RequireProviderConfig`: treats missing live-provider readiness as a failure.
- `-WorkerUrl`: if provided, checks `/api/health` and
  `/api/provider/config`.
- Environment file: reads `.dev.vars` only to check whether required keys are
  present; never prints `OPENAI_API_KEY` or provider key values.
- Provider mode: blank `OPENAI_PROVIDER_MODE` is treated as the Worker default
  Chat mode for validation purposes.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| Missing `node` or `corepack` | Fail |
| Node.js major version below 24 | Fail |
| Missing required project docs | Fail |
| Missing `OPENAI_API_KEY` without `-RequireProviderConfig` | Warn |
| Missing `OPENAI_API_KEY` with `-RequireProviderConfig` | Fail |
| Effective Chat mode without `OPENAI_CHAT_MODEL` and `-RequireProviderConfig` | Fail |
| Invalid `OPENAI_PROVIDER_MODE` with `-RequireProviderConfig` | Fail |
| Worker URL not provided | Skip HTTP checks |
| Worker `/api/health` or `/api/provider/config` non-200 | Fail |

### 5. Good/Base/Bad Cases

- Good: `.\scripts\verify-demo.ps1 -RequireProviderConfig -WorkerUrl
  "http://localhost:8787"` while a configured Worker is running.
- Base: `.\scripts\verify-demo.ps1 -SkipQuality -SkipBuild` on a no-key local
  checkout; missing provider keys are warnings.
- Bad: treating a no-key checkout as a live provider demo, or printing the
  actual API key in script output.

### 6. Tests Required

- Run `.\scripts\verify-demo.ps1 -SkipQuality -SkipBuild` after changing the
  script.
- Run `.\scripts\verify-demo.ps1` before final handoff when time permits; this
  covers lint, typecheck, tests, and production build.
- If a Worker is running, add `-WorkerUrl "http://localhost:8787"` to verify
  the HTTP readiness endpoints.

### 7. Wrong vs Correct

#### Wrong

```powershell
# Prints secrets and makes the PR log unsafe.
Get-Content .\.dev.vars
```

#### Correct

```powershell
# Only reports whether the key is present.
.\scripts\verify-demo.ps1 -RequireProviderConfig
```

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
