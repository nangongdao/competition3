# Product Experience and Performance Upgrade

## Goal

Improve the current application through a focused, commercial-quality increment spanning useful functionality, runtime/rendering performance, and a clearer, more polished UI and interaction model.

## What I Already Know

- The project uses a Cloudflare Worker backend and has recently added upstream request resilience, structured logging, a Durable Object circuit breaker, runtime integration tests, and generated Wrangler types.
- The repository follows a task-branch and focused pull-request competition workflow.
- The roadmap must be actionable rather than a generic list of best practices.
- The current project is feature-rich for a competition demo, including multimodal Chat and Realtime modes, cost controls, provider compatibility, and demo verification.
- Commercial operation is currently blocked more by platform capabilities than by missing AI interaction features: identity, tenancy, persistence, quotas, CI/CD, observability, security governance, and E2E coverage are not yet complete.
- The existing roadmap already defers decomposition of the workspace and Realtime hook, so maintainability work should be treated as an explicit prerequisite rather than hidden cleanup.

## Assumptions (Temporary)

- The first increment should improve the existing assistant workspace rather than introduce SaaS identity, billing, or tenancy infrastructure.
- Performance claims must be supported by build output, code-path analysis, or browser measurements when tooling is available.
- The visual direction should be a professional multimodal operator workspace: focused, information-rich, responsive, and accessible.

## Open Questions

- None.

## Requirements (Evolving)

- Audit the assistant workspace for usability friction, visual hierarchy, responsive behavior, accessibility, and expensive render or media paths.
- Add at least one user-visible functional improvement that strengthens the main multimodal workflow.
- Improve rendering or media-path efficiency without weakening current behavior.
- Establish a coherent visual system for panels, controls, statuses, spacing, typography, and feedback.
- Preserve Chat, Realtime, camera, microphone, transcription, cost controls, provider compatibility, and upstream resilience behavior.
- Keep the implementation focused enough for one reviewable task branch and pull request.
- Reorganize the workspace into explicit presentation regions with mode-aware primary actions and secondary controls.
- Support a desktop multi-panel composition and a narrow-screen stacked composition without hiding critical session controls.
- Make secondary status, cost, and configuration information collapsible so the conversation and media context remain primary.
- Split the 2,132-line workspace component along stable presentation boundaries while keeping session orchestration behavior intact.
- Isolate expensive or frequently changing UI regions so transcript, camera, meter, and control updates do not force unnecessary whole-workspace rendering.
- Add focus modes for balanced, camera-first, and conversation-first workspace compositions.
- Add desktop panel resizing and reordering with clear drag handles and keyboard-accessible alternatives where practical.
- Persist focus mode, panel visibility, panel order, and desktop panel sizing locally without storing prompts, transcripts, images, audio, or credentials.
- Provide a reset-layout action that restores a safe default composition.
- Disable freeform dragging on narrow screens and use a deterministic stacked order optimized for touch interaction.

## Acceptance Criteria (Evolving)

- [ ] The primary workflow is easier to understand on first use.
- [ ] Important session, media, provider, and cost states have clear visual feedback.
- [ ] The workspace remains usable across desktop and narrow/mobile layouts.
- [ ] Keyboard operation, focus visibility, reduced motion, and accessible labels are preserved or improved.
- [ ] Performance-sensitive logic has measurable verification through tests, build artifacts, or profiling evidence.
- [ ] Existing lint, typecheck, unit, Workers-runtime, and production build checks pass.
- [ ] Chat and Realtime modes expose only relevant primary actions while retaining access to advanced controls.
- [ ] Collapsed auxiliary panels remain accessible and announce their expanded state correctly.
- [ ] Extracted component contracts have targeted tests for important display and interaction states.
- [ ] Users can switch between balanced, camera-first, and conversation-first layouts without interrupting an active session.
- [ ] Desktop users can resize and reorder supported panels within bounded dimensions.
- [ ] Narrow layouts remain deterministic, readable, and free from horizontal overflow.
- [ ] Layout preferences survive reload, tolerate invalid or old stored values, and can be reset.
- [ ] Layout persistence contains no conversation or provider-sensitive content.

## Definition of Done

- UI and functional changes are implemented with focused tests.
- A before/after rationale and verification evidence are documented.
- The change is delivered on a task branch through a focused pull request.

## Out of Scope

- Changing local provider defaults or unrelated user work.
- Merging existing pull requests without review.
- SaaS tenancy, billing, authentication, or broad data-platform implementation.
- Unrelated backend infrastructure changes.
- Unsupported numeric Core Web Vitals claims when browser tracing is unavailable.

## Decision (ADR-lite)

**Context**: The user paused the long-range SaaS roadmap and requested immediate product functionality, performance, UI, and interaction improvements.

**Decision**: Redirect this task to a focused product-experience and performance increment on the existing assistant workspace.

**Consequences**: The work will prioritize the current multimodal workflow and defer SaaS platform foundations. UI improvements must remain cohesive and performance work must be evidence-based.

### First Increment Decision

**Context**: The first increment could emphasize conversation tools, media behavior, or the overall workspace structure.

**Decision**: Rebuild the workspace structure first.

**Consequences**: The increment combines visible UX improvements with maintainability and render-boundary improvements, while avoiding unrelated backend changes.

### Layout Personalization Decision

**Context**: A basic responsive redesign would be lower risk, while focus modes and freeform layout controls provide substantially more user value but add state, persistence, accessibility, and responsive complexity.

**Decision**: Implement both focus modes and an advanced desktop layout system.

**Consequences**: Layout state needs a versioned, validated local persistence contract, bounded resizing, reset behavior, narrow-screen fallback, and targeted interaction tests. Dragging will be a progressive desktop enhancement rather than a mobile dependency.

## Technical Notes

- Task directory: `.trellis/tasks/07-15-technical-upgrade-roadmap/`
- Existing reliability delivery: PR #25.
- Existing roadmap: `docs/roadmap.md`, currently competition- and cost-optimization-oriented.
- Current architecture: React/Vite frontend plus Hono Cloudflare Worker, with provider calls kept server-side.
- Current test baseline includes unit, hook, route, and Workers-runtime integration tests, but no repository CI workflows or Playwright E2E suite were found.
- Initial upgrade tracks identified: engineering foundation, maintainability, identity/tenancy, data, usage governance, operations, product quality, security/privacy.
- Chrome DevTools MCP is not available in the current session, so empirical Core Web Vitals tracing is deferred unless the tool is configured later.
- Current concentration points: `assistant-workspace.tsx` is 2,132 lines, `use-realtime-session.ts` is 1,119 lines, and `app.css` is 1,082 lines.
- Design-system retrieval recommends a minimal-modern SaaS workspace with crisp hierarchy, strong contrast, restrained effects, and clear scanability. The implementation will avoid generic decorative gradients and low-contrast cards.
