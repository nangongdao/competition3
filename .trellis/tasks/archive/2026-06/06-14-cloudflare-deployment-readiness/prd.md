# Cloudflare Deployment Readiness

## Goal

Make Cloudflare online deployment executable for the project owner by adding
clear deployment documentation and validating the Worker/Assets bundle locally.
The deployment itself requires the owner's Cloudflare account and provider API
key, so this task documents the exact commands and verifies all account-free
preflight steps.

## What I Already Know

* The user wants to continue after the overall delivery pass and specifically
  asks how to do Cloudflare online deployment.
* The repository is on `main` with a clean working tree.
* `wrangler.toml` already defines a Worker named
  `ai-visual-dialogue-assistant`, the Worker entry `src/worker/index.ts`, and
  static assets from `./dist`.
* `wrangler` is installed through the project dependency set; local version is
  `4.99.0`.
* The app requires `OPENAI_API_KEY` for real model calls. Chat mode also needs
  `OPENAI_CHAT_MODEL`; Realtime mode needs a Realtime-capable model and optional
  provider URL/model/voice configuration.
* The existing demo readiness script can verify toolchain, docs, provider
  config presence, quality gates, production build, and optional Worker HTTP
  endpoints without printing secrets.

## Requirements

* Add a focused Cloudflare deployment guide that explains:
  * prerequisites and account login,
  * local preflight checks,
  * how to set secrets without committing them,
  * how to configure Chat Completions or Realtime mode,
  * how to deploy with Wrangler,
  * how to verify the deployed URL,
  * how to update or roll back safely.
* Link the deployment guide from README.
* Keep real deployment and secret entry out of automation; the owner must run
  authenticated commands locally.
* Run account-free verification, including build/readiness checks and Wrangler
  dry-run if available.

## Acceptance Criteria

* [x] `docs/deployment.md` gives copy-pasteable Cloudflare deployment steps.
* [x] README links to the deployment guide from the Worker/deployment area.
* [x] The guide clearly separates local `.dev.vars` from deployed Worker
  secrets and warns not to commit provider keys.
* [x] Account-free verification passes or any blocker is documented.
* [x] The final answer explains the practical deployment steps in Chinese.

## Definition of Done

* Documentation is updated and committed on a task branch.
* `scripts/verify-demo.ps1 -SkipQuality -SkipBuild` passes.
* `corepack pnpm build` passes.
* `corepack pnpm exec wrangler deploy --dry-run` is attempted and result is
  recorded.
* A focused PR targets `main`.

## Out of Scope

* Running `wrangler login` for the user.
* Uploading or viewing the user's real `OPENAI_API_KEY`.
* Deploying to Cloudflare from this session unless the user explicitly provides
  an authenticated Wrangler environment and authorizes it.
* Live provider behavior tests, cost A/B measurement, or Cloudflare custom
  domain setup.

## Technical Notes

* `wrangler.toml` controls Worker name, entry, compatibility date, assets, and
  non-secret vars.
* `OPENAI_API_KEY` must be set as a Worker secret with `wrangler secret put`.
* Non-secret provider settings can live in `[vars]` in `wrangler.toml` or be
  changed through a future PR.
* For many third-party providers, Chat mode is the practical deployment path
  because it only requires an OpenAI-compatible `/chat/completions` endpoint.

## Decision (ADR-lite)

**Context**: The project is ready for online deployment, but Cloudflare account
ownership and provider secrets are external to the repository.

**Decision**: Document the owner-run deployment workflow and validate the
deployment bundle with account-free commands. Do not automate secret upload or
real deployment in this task.

**Consequences**: The user receives exact deployment instructions without
risking secret exposure. Actual public URL creation remains an owner-run step.
