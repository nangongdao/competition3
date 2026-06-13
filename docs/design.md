# AI Visual Dialogue Assistant Design

## Product Goal

Build a browser assistant that can use live camera context, microphone input, and
low-latency AI responses while keeping long-lived model credentials on the
server side.

## Architecture

* Frontend: Vite, React, TypeScript, Tailwind CSS v4.
* Backend: Cloudflare Worker with Hono routes.
* Media: browser `getUserMedia` for camera and microphone permissions.
* AI session boundary: Worker endpoint creates short-lived OpenAI Realtime
  sessions using `OPENAI_API_KEY`.
* Visual context: browser samples selected camera frames instead of streaming
  raw video continuously.
* Realtime transport: browser WebRTC peer connection sends microphone audio,
  receives assistant audio, and uses the data channel for sampled visual
  context events.

## User Stories

| Story | Status | Notes |
| --- | --- | --- |
| Open the app as a runnable browser workspace | Implemented | `pnpm dev` starts the frontend. |
| Grant camera and microphone permissions | Implemented | The app requests both through `getUserMedia`. |
| See live camera preview | Implemented | The preview binds the granted `MediaStream` to a video element. |
| Start and stop an assistant session | Implemented | The browser creates a Worker-backed Realtime session and closes the peer connection on stop. |
| See listening, thinking, responding, connected, and error states | Implemented | State ring, media status, transcript, and error banner cover these states. |
| Sample visual context frames | Implemented | Manual sampling and low-frequency interval controls capture JPEG frames to canvas. |
| Create a key-safe AI session | Implemented | `POST /api/realtime/session` creates a server-side Realtime session when `OPENAI_API_KEY` is configured. |
| Stream low-latency voice to the model | Implemented | The browser posts an SDP offer with the short-lived client secret and plays the remote audio stream. |
| Send sampled frames into model context | Implemented | Manual and interval samples are sent as `conversation.item.create` data-channel events. |
| Type a text message during a session | Implemented | A composer in the dialogue board sends text-only conversation items over the data channel and requests a response. |
| See real token usage and estimated cost per session | Implemented | The usage meter parses authoritative `response.done` usage events into modality buckets with a USD estimate. |
| Stop paying for consumed camera frames on later turns | Implemented | Consumed frame items are deleted from the server-side conversation after each response, with a visible pruned counter and an opt-out toggle. |
| Package final contest demo | Planned | Final pass should include verification notes and PR descriptions. |

## Cost Controls

### Cost model

Realtime pricing has three structural properties that drive every decision
below (USD per 1M tokens, gpt-realtime estimates: audio in 32, audio out 64,
image in 5, text in 4, text out 16, cached in 0.4):

1. **Audio output is the most expensive bucket** (4x text output).
2. **Every `response.create` re-bills the whole conversation history as
   input.** Context left in the conversation costs money on every later turn,
   not once. A sampled 640px frame is roughly 500-800 image tokens; at one
   frame per 8 seconds a 10-minute session accumulates ~45k image tokens that
   would otherwise be re-billed every turn.
3. **Idle time is not free** while the session stays open and VAD keeps
   detecting speech-like input.

### Measures

* **Usage meter (implemented)**: the app parses the `usage` block of every
  `response.done` event into audio/text/image x input/cached/output buckets,
  accumulates session totals, and shows an estimated USD cost plus the
  last-turn input size. The last-turn input number makes the history snowball
  visible and is the baseline metric for the optimizations below.
* **No continuous raw video upload (implemented)**: the app samples frames
  manually or at a conservative interval.
* **Session duration policy (implemented)**: the backend returns a 10-minute
  intended cap in the session cost policy and the browser closes the Realtime
  connection when that cap is reached.
* **Key safety (implemented)**: permanent OpenAI API keys stay in Worker
  environment variables.
* **Compact default instructions (implemented)**: the Worker sends a short
  default Realtime instruction block.
* **Local fallback (implemented)**: without `OPENAI_API_KEY`, the media
  workspace remains runnable and session start reports a configuration error.
* **Conversation history pruning (implemented)**: after each response
  completes, the frame items it consumed are deleted from the server-side
  conversation via `conversation.item.delete`, so each sampled frame is
  billed once instead of on every later turn. The tracker only deletes
  frames that were actually inside a completed response's context; frames
  sampled mid-response wait for the next one. Trade-off documented honestly:
  deleting items invalidates the prompt-cache suffix after the deletion
  point, but consumed frames sit at the conversation tail, so the cached
  prefix for earlier history survives and the uncached full-rate re-billing
  of frames (which pruning removes) dominates the small cache loss. The
  workspace shows a pruned-frame counter, and a toggle (default on) lets the
  demo compare snowball vs pruned sessions in the usage meter. Prune-delete
  errors for already-removed items are tagged with an `evt_prune_` event id
  and silenced instead of breaking the session.
* **Frame-difference sampling (planned)**: client-side downscaled grayscale
  diff between consecutive samples; skip upload when the scene has not
  changed.
* **Push-to-talk mode (planned)**: disable server VAD and commit the audio
  buffer manually so noisy environments cannot trigger billable false turns.
* **Response budget (planned)**: `max_response_output_tokens` presets and an
  optional text-only response mode (audio out is 4x text out).
* **Idle auto-disconnect (planned)**: close the session after a period with
  no speech activity, instead of relying only on the fixed cap.

## Current Gaps

* Browser camera and microphone behavior must be manually tested because it
  depends on local hardware and browser permission prompts.
* End-to-end Realtime behavior requires `pnpm dev:worker` or deployment with a
  configured `OPENAI_API_KEY`; plain Vite dev mode does not provide the Worker
  API endpoint.
