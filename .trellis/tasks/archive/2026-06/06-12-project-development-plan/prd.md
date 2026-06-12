# AI Visual Dialogue Assistant

## Goal

Build an AI visual dialogue assistant for the contest: a runnable browser application that can open the user's camera and microphone, let the AI understand visual context and spoken input, and respond naturally. The project must also include a design document covering planned vs implemented user stories and cost-control techniques.

## What I Already Know

* Contest topic from `task.md`: "AI 视觉对话助手".
* Required capabilities:
  * Open camera and microphone.
  * Let AI see camera video content.
  * Let AI hear the user.
  * Give appropriate responses.
  * Consider visual understanding accuracy, natural/fluent voice interaction, and cloud-edge cost control.
* Required deliverables:
  * Runnable application.
  * Design document with planned/implemented user stories.
  * Design document with considered/adopted operating cost-control techniques.
  * Continuous PR/commit record; avoid one final bulk submission.
  * PR descriptions must include feature description, implementation idea, and test method.
* Repository state:
  * No application code exists yet.
  * Existing files are `task.md`, `AGENTS.md`, and Trellis/agent configuration.
  * Project specs target Cloudflare Workers + Hono + Vite/React + TypeScript.

## Requirements

* Implement PR1 first: project scaffold and quality baseline.
* Scaffold a runnable TypeScript full-stack web app aligned with local specs.
* Provide a first-screen product experience, not a marketing landing page.
* Implement browser camera and microphone permission flow.
* Show a live camera preview and voice interaction state.
* Protect permanent model API keys behind a backend endpoint or documented local secret setup.
* Use a low-latency voice path for the final MVP.
* Add visual context by sampling selected camera frames rather than streaming every frame.
* Include explicit cost-control behavior and document it.
* Keep each implementation stage independently runnable.
* Maintain English project docs where Trellis specs require English, while user-facing app copy may be Chinese.

## Acceptance Criteria

* [ ] `pnpm install` succeeds with documented dependencies.
* [ ] `pnpm dev` starts a local app.
* [ ] The app requests camera and microphone access from the browser.
* [ ] The app renders live camera preview after permission is granted.
* [ ] The user can start and stop an assistant session.
* [ ] The UI shows listening, thinking/responding, connected, and error states.
* [ ] A backend endpoint exists for creating a short-lived AI session or equivalent key-safe connection.
* [ ] The assistant can use sampled visual context from the camera.
* [ ] Cost-control settings are implemented, such as frame sampling interval, session time limit, or manual visual refresh.
* [ ] `docs/design.md` explains planned vs implemented user stories and cost-control techniques.
* [ ] README lists dependencies, setup, environment variables, and original functionality.
* [ ] Lint/typecheck/build checks pass or known blockers are documented.

## Definition of Done

* Tests added/updated where appropriate.
* Lint / typecheck / CI-equivalent checks pass or failures are explained.
* Docs/notes updated if behavior changes.
* Rollout/rollback considered if risky.

## Technical Approach

Target architecture: browser WebRTC + Cloudflare Worker session endpoint + sampled camera frame visual context.

* Frontend: Vite/React/TypeScript app with a focused assistant workspace.
* Backend: Cloudflare Worker with Hono-style API routes where useful.
* AI integration: OpenAI Realtime API for low-latency audio conversation, with camera frames added at controlled times for visual context.
* Cost strategy:
  * Do not stream raw video continuously to the model.
  * Sample frames only on demand or at a conservative interval.
  * Add session duration / idle controls.
  * Keep prompts compact and document model/cost trade-offs.
* Local demo strategy:
  * If no API key is configured, keep camera/mic UI runnable and show a clear configuration error or mock state rather than breaking the app.

## Research References

* [`research/ai-visual-dialogue-architecture.md`](research/ai-visual-dialogue-architecture.md) - Recommends browser WebRTC plus Worker-issued short-lived session credentials, with controlled camera frame sampling for visual context and cost control.

## Feasible Approaches

### Approach A: Browser WebRTC + Worker ephemeral session (Recommended)

* How it works: browser captures audio/video; Worker creates a short-lived AI session; WebRTC handles low-latency voice; selected camera frames are sent as visual context.
* Pros: strongest fit for natural dialogue, protects API key, matches local Cloudflare specs, high demo value.
* Cons: more implementation complexity.

### Approach B: Simpler request/response audio + periodic vision

* How it works: record audio or use speech recognition, send text/audio plus sampled frame to a model endpoint, return text/audio response.
* Pros: easier to debug and cheaper to build.
* Cons: less natural and less aligned with real-time voice interaction.

### Approach C: Mock-first UI, real AI later

* How it works: first implement camera/mic UX and deterministic mock assistant replies; integrate real AI afterward.
* Pros: fastest first runnable milestone.
* Cons: does not satisfy the core AI requirement until later.

## Proposed Implementation Plan

* PR1: Project scaffold and quality baseline
  * Add package manager setup, TypeScript, Vite/React app, Worker entry, lint/typecheck/build scripts, README skeleton.
* PR2: Camera/microphone workspace
  * Implement permission flow, live preview, session controls, transcript/status panel, and mock assistant states.
* PR3: AI session backend and WebRTC connection
  * Add server endpoint for short-lived session creation, frontend connection lifecycle, error handling, and environment docs.
* PR4: Visual context and cost controls
  * Add frame capture/sampling, manual visual refresh, session limits, and visible cost-control settings.
* PR5: Design document and contest packaging
  * Add `docs/design.md`, complete README dependency/originality notes, and final verification notes.

## Out of Scope

* Native mobile apps.
* User accounts/authentication.
* Persistent conversation history database.
* Continuous full-frame video streaming to the model.
* Multi-user collaboration.
* Production billing dashboards.

## Open Questions

* None for PR1.

## Decision (ADR-lite)

**Context**: The full AI visual dialogue assistant has several risky pieces: browser media permissions, real-time voice, backend session creation, visual frame sampling, and contest documentation. The user chose option 1: start with PR1.

**Decision**: Implement PR1 first: a runnable Cloudflare Workers + Vite/React + TypeScript scaffold with quality scripts, README setup notes, and a clean foundation for later camera/microphone and AI integration.

**Consequences**: This first increment will not yet implement the full AI assistant behavior. It prioritizes a stable runnable baseline so later PRs can remain small and independently verifiable.

## Technical Notes

* Current task directory: `.trellis/tasks/06-12-project-development-plan`
* Specs inspected:
  * `.trellis/spec/guides/index.md`
  * `.trellis/spec/backend/index.md`
  * `.trellis/spec/frontend/index.md`
  * `.trellis/spec/shared/index.md`
  * `.trellis/spec/shared/dependency-versions.md`
  * `.trellis/spec/shared/code-quality.md`
  * `.trellis/spec/frontend/directory-structure.md`
  * `.trellis/spec/frontend/quality.md`
* Relevant future implementation specs:
  * `.trellis/spec/backend/environment.md`
  * `.trellis/spec/backend/hono-framework.md`
  * `.trellis/spec/backend/security.md`
  * `.trellis/spec/frontend/components.md`
  * `.trellis/spec/frontend/type-safety.md`
