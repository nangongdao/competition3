# Task Plan: Product Experience and Performance Upgrade

## Goal

Deliver a focused commercial-quality improvement to the existing assistant workspace across functionality, performance, UI, and interaction.

## Phases

- [x] Phase 1: Initialize Trellis task and planning artifacts
- [x] Phase 2: Audit architecture, dependencies, quality, security, operations, and product readiness
- [x] Phase 3: Select the focused improvement bundle and finalize requirements
- [x] Phase 4: Implement and verify the adaptive workspace increment
- [x] Phase 5: Commit, push, and open the focused pull request

## Key Questions

1. Which improvement bundle should be implemented first?
2. Which current UI and render paths create the highest user and maintenance cost?
3. How can the change remain focused while improving function, performance, and presentation together?

## Decisions Made

- The roadmap will be based on repository evidence rather than a generic technology checklist.
- Delivery will be decomposed into focused task branches and pull requests.
- Existing local-only changes in `wrangler.toml`, `worker-configuration.d.ts`, and `.nezha/` will not be modified.
- The earlier SaaS roadmap direction is paused at the user's request.
- This task now targets immediate functionality, performance, UI, and interaction improvements.
- UI direction: a professional multimodal operator workspace with clear hierarchy and restrained motion.
- First increment: workspace restructuring with responsive regions, mode-aware controls, collapsible auxiliary panels, component extraction, and render isolation.
- Include focus modes plus advanced desktop panel ordering/resizing with safe local persistence and reset behavior.

## Errors Encountered

- Initial PowerShell wrapper used `$LASTEXITCODE:` inside an interpolated string, which PowerShell parsed as an invalid variable reference. Resolved by using the `-f` formatting operator.
- A repository search included the absent `.github` directory and `rg` returned exit code 2. The search target will be limited to existing paths; the absence itself is evidence that repository CI workflows are not currently configured.
- Switching from the previous feature branch to a new branch based on `origin/main` was blocked because local user changes in `wrangler.toml` and `worker-configuration.d.ts` would be overwritten. Resolution: temporarily stash only those two paths, switch branches, then restore them immediately.
- The first targeted test invocation stopped because pnpm detected a branch/lockfile mismatch in `node_modules` and refused an interactive purge without a TTY. Resolution: run a frozen-lockfile install with `CI=true`, then rerun verification.
- Full-repository lint found two warnings only in the user's preserved, untracked generated `worker-configuration.d.ts`. The task will not modify that file; source lint will run against `app`, `src`, and project configuration files, while final status will disclose the unrelated warning.
- The first scoped lint command referenced `vitest.worker.config.ts`, which does not exist on the `origin/main` baseline. Resolution: lint only paths present on this branch.
- After extracting the memoized transcript list, typecheck showed the parent still uses `TranscriptSpeaker` for another state path. Resolution: retain the type-only import in the parent while keeping display helpers inside the extracted component.

## Status

**Delivered** - Focused commits are available in pull request #26 targeting `main`.
