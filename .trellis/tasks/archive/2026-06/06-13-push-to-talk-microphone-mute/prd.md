# Push-to-talk and Microphone Mute

## Goal

Reduce noisy-environment Realtime costs by letting the user choose between the
existing server VAD flow and an explicit push-to-talk flow, while also providing
an independent microphone mute control that works in both modes without
renegotiating the WebRTC connection.

## Requirements

* Extend `POST /api/realtime/session` input with
  `turnDetectionMode: "server-vad" | "push-to-talk"`, defaulting to
  `"server-vad"` for current behavior.
* Map `"push-to-talk"` to `turn_detection: null` in the upstream OpenAI
  Realtime session payload. Keep server VAD unchanged for the default mode.
* Include the selected turn detection mode in the returned cost policy so the
  browser can show the active mode.
* Let the workspace choose the turn detection mode before starting a session.
* Add an independent microphone mute toggle that controls the local audio track
  with `audioTrack.enabled = false` and requires no reconnection.
* In push-to-talk mode, keep the microphone track disabled except while the user
  is holding the speak control.
* On push-to-talk release, send `input_audio_buffer.commit` followed by
  `response.create` over the Realtime data channel.
* Preserve existing text-message, sampled-frame, frame-pruning, usage-meter, and
  auto-sampling behavior.

## Acceptance Criteria

* [x] Worker tests cover default server VAD behavior, push-to-talk payload
      mapping, invalid turn detection mode validation, and returned cost policy.
* [x] Starting a session in server VAD keeps the current hands-free voice flow.
* [x] Starting a session in push-to-talk disables server VAD and does not keep
      the mic enabled while idle.
* [x] Holding the push-to-talk control enables the mic track; releasing it
      disables the track again and requests a response.
* [x] The mute toggle disables the mic track in both modes and prevents
      push-to-talk from arming audio while muted.
* [x] The UI clearly displays active turn mode and microphone state.
* [x] `corepack pnpm lint`, `corepack pnpm typecheck`,
      `corepack pnpm build`, and `corepack pnpm test` pass.

## Definition of Done

* Tests added or updated for backend contract changes.
* Frontend and backend TypeScript contracts remain aligned.
* README and design/roadmap docs describe the shipped cost-control increment.
* No new third-party dependencies are introduced unless documented in README.
* A focused task branch and pull request are prepared for this increment.

## Technical Approach

The Worker schema remains the source of truth for session options. The frontend
imports the inferred response and cost-policy types from the Worker route types,
then performs a runtime guard before using the response.

`useRealtimeSession` will own the WebRTC audio track reference because it is the
module that attaches the track to the peer connection and owns the data channel.
It will expose small control methods for mute and push-to-talk. Push-to-talk
release will send typed Realtime client events:
`input_audio_buffer.commit` and `response.create`.

`AssistantWorkspace` will add the controls and mode state, pass the selected
mode into session creation, and keep visual frame controls unchanged.

## Decision (ADR-lite)

**Context**: Server VAD is convenient but can create billable false-positive
turns in noisy rooms. Push-to-talk reduces that risk by making turns explicit.

**Decision**: Keep server VAD as the default mode for existing behavior, and add
push-to-talk as an opt-in session mode. Implement mute and push-to-talk by
toggling the existing local `MediaStreamTrack.enabled` flag.

**Consequences**: Push-to-talk requires a new session to change modes because
turn detection is configured when the Realtime session is created. Mute can be
toggled live because it only affects the local track.

## Out of Scope

* Response budget presets and text-only responses; these remain roadmap item
  3.3.
* Idle auto-disconnect; this remains roadmap item 3.4.
* Microphone level metering from real audio samples.
* New dependencies or alternate WebRTC libraries.

## Technical Notes

* Roadmap source: `docs/roadmap.md` section 3.2.
* Worker files: `src/worker/routes/realtime/types.ts`,
  `src/worker/routes/realtime/router.ts`,
  `src/worker/routes/realtime/router.test.ts`.
* Frontend files: `app/modules/assistant/hooks/use-realtime-session.ts`,
  `app/modules/assistant/hooks/use-media-capture.ts`,
  `app/modules/assistant/components/assistant-workspace.tsx`,
  `app/app.css`.
* Existing session creation only sends `model`, `voice`, and `instructions`;
  this task adds conditional `turn_detection`.
* Existing tests use Vitest with `app.request` and a stubbed global `fetch`.
