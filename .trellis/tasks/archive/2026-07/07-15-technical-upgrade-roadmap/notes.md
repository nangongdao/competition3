# Notes: Project Technical Upgrade Roadmap

## Repository Findings

### Current strengths

- React 19, TypeScript, Vite, Tailwind CSS, Hono, and Cloudflare Workers provide a modern edge-native baseline.
- Chat Completions, Realtime WebRTC, speech transcription, camera sampling, cost controls, and third-party OpenAI-compatible providers are already integrated.
- Worker upstream calls now share timeout, retry, cancellation, safe-error, request-ID, structured-log, and Durable Object circuit-breaker behavior.
- The project has meaningful unit, hook, route, and Workers-runtime integration coverage, plus repeatable lint, typecheck, test, build, Wrangler type, and deployment checks.
- Demo verification and detailed provider configuration documentation already exist.

### Commercial-grade gaps

- No application authentication, user identity, tenant/workspace isolation, roles, or administrative control plane is implemented.
- No durable product data model exists for users, conversations, settings, usage ledgers, audit events, or retention policies.
- No application-level quotas, per-user/provider budgets, abuse controls, or route-specific rate limiting are visible.
- Structured logs exist, but there is no defined metrics, tracing, alerting, SLO, incident, or operational dashboard layer.
- The `.github` workflow directory is absent, so quality gates and deploy promotion are not enforced in repository CI.
- There is no explicit development/staging/production environment promotion strategy, secret rotation procedure, release versioning, or rollback automation.
- No Playwright end-to-end suite or automated browser/device matrix covers the camera, microphone, chat, and failure flows.
- The primary assistant workspace and Realtime orchestration remain high-complexity concentration points; the existing roadmap already identifies state-machine/media/transport/presentation decomposition as deferred work.
- Product privacy, consent, data retention, export/deletion, provider data handling, and compliance boundaries are not yet executable requirements.
- The current roadmap is optimized for competition delivery and cost demonstration, not for operating a multi-user commercial service.

### Delivery constraints

- Each coherent upgrade must use a task branch and focused pull request targeting `main`.
- Existing reliability PR #25 should land before building higher-level operational features that depend on stable upstream behavior.
- Local-only provider configuration changes must remain outside roadmap commits.

## Upgrade Candidates

1. Engineering foundation: CI gates, dependency/security scanning, release metadata, environment validation.
2. Architecture maintainability: frontend state-machine and transport decomposition, typed API client contracts, test harness improvements.
3. Identity and tenancy: authentication, user/workspace model, authorization, audit trail.
4. Usage governance: metering ledger, quotas, rate limits, cost budgets, provider fallback policy.
5. Data platform: D1 schema and migrations, conversation persistence, retention, export, deletion, optional R2 media storage.
6. Operations: metrics, traces, dashboards, alerts, SLOs, runbooks, staged deployment and rollback.
7. Product quality: E2E tests, accessibility audit, responsive/device coverage, runtime localization strategy.
8. Security and privacy: threat model, CSP/security headers, abuse protection, secret rotation, consent and data lifecycle controls.

## Constraints

- Competition workflow requires a task branch and focused pull request for each coherent change.
- Preserve unrelated local changes in `wrangler.toml`, `worker-configuration.d.ts`, and `.nezha/`.

## Product Direction

- Primary target: scalable SaaS platform.
- Architectural implication: tenant boundaries and usage ownership must be designed before persistence, billing, analytics, and administration are implemented.
- Sequencing implication: identity/tenancy, platform contracts, and operational foundations precede broad product feature expansion.

## Revised Immediate Direction

- The SaaS roadmap is paused; immediate work targets the existing assistant workspace.
- Selected bundle: workspace restructuring across function, performance, UI, and interaction.
- Source evidence: `assistant-workspace.tsx` has 2,132 lines, `use-realtime-session.ts` has 1,119 lines, and `app.css` has 1,082 lines.
- Design direction: minimal-modern professional operator workspace, high scanability, crisp borders, restrained depth, strong contrast, and explicit state feedback.
- Performance method: create stable component boundaries first, then add memoization only where prop/state flow shows meaningful render isolation.
- Confirmed personalization scope: focus modes, collapsible panels, desktop reorder/resize, local preference persistence, reset action, and deterministic mobile fallback.
- Privacy boundary: layout persistence must never include prompts, transcripts, captured media, provider URLs, or credentials.

## Delivery

- Branch: `feat/adaptive-workspace-layout`
- Pull request: https://github.com/nangongdao/competition3/pull/26
- Git HTTPS push failed after the permitted normal and HTTP/1.1 attempts; the remote branch was created with the documented small-blob Git Data API flow.
