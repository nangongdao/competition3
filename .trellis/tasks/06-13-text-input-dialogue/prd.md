# Text Input Dialogue

## Goal

Add a text input path to the assistant workspace so the user can type a message
to the AI during an active Realtime session, instead of speaking. The typed
message is sent over the existing Realtime data channel and triggers a normal
assistant response (audio + text), keeping interaction possible in quiet or
noisy environments.

## What I Already Know

* The Realtime data channel already carries `conversation.item.create` events
  with `input_text` + `input_image` parts for sampled frames
  (`app/modules/assistant/hooks/use-realtime-session.ts`).
* `response.create` events already trigger assistant turns.
* Transcript entries support `user` speaker rendering in the workspace
  (`app/modules/assistant/components/assistant-workspace.tsx`).
* The competition requires small, focused PRs with clear descriptions.

## Requirements

* Add a text composer (input + send button) to the dialogue board in the
  assistant workspace.
* Sending text requires an open Realtime data channel; otherwise show a clear
  system message instead of failing silently.
* Sent text appears in the transcript as a `user` entry.
* The send action creates a `conversation.item.create` event with only an
  `input_text` part (no image), followed by `response.create`.
* Support Enter-to-send and disable the composer when there is no active
  connection.
* Keep the change focused: no refactors of unrelated session logic.

## Acceptance Criteria

* [ ] A text input and send control render in the dialogue board.
* [ ] Typing a message and sending it adds a `user` transcript entry.
* [ ] The message is sent over the data channel as `conversation.item.create`
      with an `input_text` part, followed by `response.create`.
* [ ] The composer is disabled (or send is rejected with a system message)
      when the Realtime connection is not open.
* [ ] Enter submits; the input clears after a successful send.
* [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass.
* [ ] Existing worker tests still pass.

## Definition of Done

* Lint / typecheck / build pass.
* Docs updated: README feature list and `docs/design.md` user stories.
* PR created targeting `main` with feature/implementation/verification
  description.

## Technical Approach

* Extend `useRealtimeSession` with a `sendTextMessage(text: string): boolean`
  callback that mirrors `sendVisualContext` but builds a text-only
  conversation item and always requests a response.
* Add composer state (`textDraft`) in `AssistantWorkspace`; on submit, call
  `sendTextMessage`, add the `user` transcript entry on success, and clear the
  draft.
* Reuse existing button/panel styling patterns from `app/app.css`.

## Out of Scope

* Text-only sessions without WebRTC (offline text chat).
* Message history persistence.
* Editing or deleting sent messages.
