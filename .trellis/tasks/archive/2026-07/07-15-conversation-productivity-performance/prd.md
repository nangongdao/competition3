# Conversation Productivity and Long-History Performance

## Goal

Upgrade the assistant conversation area from a basic transcript into a commercial-quality productivity surface. Users should be able to recover from failed Chat turns, reuse and export useful content, safely clear a session, navigate long conversations, and keep interaction responsive as history grows.

## What I Already Know

- The current transcript is held in React state inside `AssistantWorkspace` and rendered by a memoized `TranscriptList`.
- Transcript entries contain an id, speaker, text, and creation timestamp.
- Chat requests currently add a user entry before sending, but failure only appends a generic system entry; the original request metadata is not retained for retry.
- Realtime and Chat modes share the visible transcript, so generic actions must remain useful without pretending Realtime turns can always be replayed.
- The workspace already supports downloadable usage reports and a polished adaptive layout.
- No new dependency is desirable unless the existing platform cannot provide the feature safely.
- PR #26 is open and clean; this task builds on its adaptive workspace implementation.
- The repository-required `task.md` file is absent from the current checkout.

## Assumptions

- Conversation data remains in memory for this increment; browser persistence of prompts or transcripts is excluded for privacy and scope control.
- Retry is provided for the most recent failed Chat request and uses the same text, response budget, and optional captured image that were used originally.
- Exported conversation files contain only the visible transcript and basic timestamps, not provider configuration, credentials, raw media, or hidden instructions.
- Long-history performance will use bounded incremental rendering with an explicit “show earlier messages” affordance rather than adding a virtualization dependency.

## Requirements

- Add per-message copy actions with accessible labels and visible success/failure feedback.
- Track failed Chat turns with enough local metadata to retry safely without duplicating the user message.
- Provide a retry action for retryable failed Chat turns; prevent concurrent duplicate sends.
- Add conversation export in Markdown and JSON with stable UTF-8 filenames and sanitized content.
- Add a destructive clear-conversation action with explicit confirmation and sensible post-clear empty state.
- Add quick navigation to the newest message and preserve predictable auto-scroll behavior.
- Keep initial transcript rendering bounded for long histories and allow users to reveal older entries incrementally.
- Preserve keyboard navigation, focus visibility, screen-reader labels, and mobile usability.
- Keep transcript content out of layout persistence and other local storage.

## Acceptance Criteria

- [ ] A user can copy any transcript message and receive accessible status feedback.
- [ ] A failed Chat request can be retried once the previous request has settled, without adding a duplicate user entry.
- [ ] Retry is unavailable for non-replayable Realtime/system entries and while another Chat request is in flight.
- [ ] The visible conversation can be downloaded as valid Markdown and JSON.
- [ ] Export output excludes credentials, provider URLs, hidden instructions, raw image data, and audio data.
- [ ] Clearing the conversation requires confirmation, cancels active browser speech where applicable, and leaves a usable empty state.
- [ ] Long conversations initially render only a recent bounded window and older entries can be revealed without data loss.
- [ ] Users can jump to the latest message; new-message auto-scroll does not unexpectedly pull them away while reading older content.
- [ ] Desktop and mobile layouts remain usable and accessible.
- [ ] Unit tests cover transcript windowing, export serialization, and retry-state rules.
- [ ] ESLint, type-check, tests, build, and `git diff --check` pass.

## Definition of Done

- Tests are added or updated for pure conversation utilities and critical interaction state.
- Lint, type-check, tests, and production build are green.
- Frontend executable contract is updated if new reusable behavior or persistence boundaries are introduced.
- Work is committed on a focused task branch and delivered through a non-empty PR targeting `main`.

## Technical Approach

- Extract transcript operations and serializers into small pure utilities under `app/modules/assistant/lib/` for deterministic tests.
- Extend transcript entries with optional delivery/retry metadata only where needed, keeping display data serializable and media payloads outside exported transcript content.
- Evolve `TranscriptList` into a controlled conversation surface with message actions, bounded rendering, and scroll-state callbacks.
- Keep orchestration in `AssistantWorkspace`, but isolate conversation-specific handlers and memoized values to avoid unrelated workspace re-renders.
- Use native Clipboard and Blob/Object URL APIs with graceful failure handling; add no third-party dependency.

## Decision (ADR-lite)

**Context**: Full list virtualization would improve very large histories but adds implementation and accessibility complexity to a currently dependency-light application.

**Decision**: Use incremental windowing for this task: render the latest bounded set, reveal older batches on demand, and preserve scroll position. Retain pure utility boundaries so virtualization can replace the renderer later if empirical profiling justifies it.

**Consequences**: This substantially reduces DOM growth and implementation risk, but extremely large fully-expanded histories can still become expensive. Persistent conversation history and cross-session search remain future work.

## Expansion Sweep

- Future evolution: persistent named sessions, full-text search, and server-backed history can build on stable transcript serialization.
- Related scenarios: copy/export/clear should behave consistently across Chat and Realtime transcript entries.
- Failure and edge cases: clipboard denial, download URL cleanup, retry races, empty export, cleared history during speech, and users reading older messages during new arrivals.

## Out of Scope

- Persisting prompts or transcript history to local storage, IndexedDB, or a server.
- Editing or deleting individual messages.
- Replaying Realtime audio turns or re-uploading historic raw media.
- Full markdown rendering, syntax highlighting, or a new rich-text dependency.
- Full list virtualization or cross-session conversation search.
- Merging PR #26 automatically.

## Technical Notes

- Likely files: `assistant-workspace.tsx`, `transcript-list.tsx`, `types.ts`, `app.css`, and new/tested utilities under `app/modules/assistant/lib/`.
- Existing relevant contract: `.trellis/spec/frontend/workspace-layout.md`.
- Existing quality commands: ESLint, TypeScript type-check, Vitest, Vite build, and `git diff --check`.
- User-owned dirty paths to preserve: `wrangler.toml`, `worker-configuration.d.ts`, and `.nezha/`.
