# Continue project development from local docs

## Goal

Continue development of the AI visual conversation assistant by selecting the next focused, document-backed improvement from the local roadmap and design notes, then implement it as a small competition-friendly PR.

## What I already know

* The user asked to continue developing this project based on local development documents and direction.
* This is a competition submission and must keep a continuous commit and PR history.
* Each PR should stay focused on one coherent change.
* The previous completed task added a browser-side Chat mode speech adapter and opened PR #15.
* `docs/roadmap.md` lists the remaining practical directions as final contest demo packaging, live measurement table backfill, and Cloudflare deployment.
* `docs/design.md` marks "Package final contest demo" as planned and lists the remaining gaps: camera/mic manual testing, Worker/API-key requirements, Chat model configuration, browser Web Speech support, and pending live measurement runs.
* Measurement backfill requires a configured `OPENAI_API_KEY` and real camera/mic runs; Cloudflare deployment requires the owner's Cloudflare account/decision.

## Assumptions (temporary)

* The next task should be selected from `README.md`, `docs/roadmap.md`, `docs/design.md`, and Trellis specs.
* The task should avoid broad rewrites and should fit in one small PR.
* The current project direction remains an AI assistant that can use camera, microphone, and model responses with cost-conscious cloud coordination.
* Because measurement and deployment require external state, the next self-contained PR should focus on final demo packaging and local verification support.

## Open Questions

* None currently blocking. The selected direction is final contest demo packaging unless the user redirects.

## Requirements (evolving)

* Add final contest demo packaging / local verification support based on the local roadmap and design gaps.
* Make it clear how a reviewer or developer can verify the app locally, including no-key, Chat provider, and Realtime provider paths.
* Provide a local script that checks toolchain readiness, provider configuration, quality gates, build output, and optional Worker endpoints.
* Keep external-condition work explicit: live measurement backfill and Cloudflare deployment are not included in this PR.
* Keep the implementation focused and compatible with the existing architecture.
* Preserve the competition workflow: task branch, commit history, and PR with a non-empty description.

## Acceptance Criteria (evolving)

* [x] Local docs are inspected and the selected next task is recorded.
* [x] `scripts/verify-demo.ps1` checks demo readiness without printing secrets.
* [x] `docs/demo-verification.md` documents no-key, Chat, Realtime, hardware, and evidence checks.
* [x] README/design/roadmap notes reflect how to use the new demo packaging support.
* [x] Relevant lint, type-check, tests, and build commands pass.
* [x] Documentation is updated if behavior or demo operation changes.

## Definition of Done (team quality bar)

* Tests added/updated where appropriate.
* Lint / typecheck / CI-equivalent commands are green.
* Docs/notes updated if behavior changes.
* Rollout/rollback considered if risky.
* Focused commits and PR are prepared per competition rules.

## Out of Scope (explicit)

* Large unrelated redesigns.
* Introducing new third-party libraries unless the selected task clearly requires them.
* Changing backend model/provider contracts without a document-backed reason.
* Running live Realtime measurement backfill without `OPENAI_API_KEY`.
* Deploying to Cloudflare without the owner's account decision.

## Technical Notes

* Task directory: `.trellis/tasks/06-13-continue-project-development`.
* Current branch at task creation: `feat/chat-mode-browser-speech-adapter`.
* Task branch: `docs/final-demo-packaging`.
* Current working tree at task creation was clean except this new task file.
* Local docs inspected: `task.md`, `README.md`, `docs/roadmap.md`, `docs/design.md`, `.trellis/spec/shared/index.md`, `.trellis/spec/frontend/index.md`, `.trellis/spec/big-question/index.md`.
* Spec update: `.trellis/spec/shared/pr-workflow.md` now records the `scripts/verify-demo.ps1` command contract.

## Technical Approach

* Add a PowerShell readiness script because the existing provider startup
  helpers are PowerShell-based and the documented quick-start path is Windows.
* Keep the script read-only for secrets: it checks whether provider variables
  are present but never prints API key values.
* Keep model/provider live calls out of the script; it checks Worker health and
  provider configuration endpoints only when a `-WorkerUrl` is provided.
* Keep live measurement values out of scope until an environment with
  `OPENAI_API_KEY` is available.

## Candidate Directions Considered

**Final demo packaging / local verification support (selected)**

* Why: planned in `docs/design.md`, self-contained, improves reviewability without external accounts.
* Trade-off: mostly packaging and verification polish, not a new model capability.

**Live measurement table backfill**

* Why: valuable for final cost-control evidence.
* Trade-off: requires configured `OPENAI_API_KEY`, camera/mic runs, and raw export artifacts unavailable in this local environment.

**Cloudflare deployment**

* Why: useful for public demo.
* Trade-off: requires owner Cloudflare account and deployment decision.
