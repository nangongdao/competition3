# AI Visual Dialogue Assistant Design

> Roadmap companion: see [`roadmap.md`](roadmap.md) for the development
> sequence, planned increments, and their implementation methods.

## Product Goal

Build a browser assistant that can use live camera context, microphone input, and
low-latency AI responses while keeping long-lived model credentials on the
server side.

## Architecture

* Frontend: Vite, React, TypeScript, Tailwind CSS v4.
* Backend: Cloudflare Worker with Hono routes.
* Media: browser `getUserMedia` for camera and microphone permissions.
* AI provider boundary: Worker endpoints keep `OPENAI_API_KEY` server-side and
  support two modes:
  * Chat Completions compatibility mode for ordinary OpenAI-compatible
    `/chat/completions` providers.
  * Realtime mode for providers that support short-lived sessions plus WebRTC
    SDP exchange.
* Visual context: browser samples selected camera frames instead of streaming
  raw video continuously.
* Realtime transport: browser WebRTC peer connection sends microphone audio,
  receives assistant audio, and uses the data channel for sampled visual
  context events.
* Chat transport: browser sends text plus an optional sampled JPEG frame to the
  Worker, which calls the configured Chat Completions endpoint over HTTP.

## User Stories

| Story | Status | Notes |
| --- | --- | --- |
| Open the app as a runnable browser workspace | Implemented | `pnpm dev` starts the frontend. |
| Grant camera and microphone permissions | Implemented | The app requests both through `getUserMedia`. |
| See live camera preview | Implemented | The preview binds the granted `MediaStream` to a video element. |
| Start and stop an assistant session | Implemented | The browser creates a Worker-backed Realtime session and closes the peer connection on stop. |
| See listening, thinking, responding, connected, and error states | Implemented | State ring, media status, transcript, and error banner cover these states. |
| Sample visual context frames | Implemented | Manual sampling and low-frequency interval controls capture JPEG frames to canvas. |
| Create a key-safe AI session | Implemented | `POST /api/realtime/session` creates a server-side Realtime session when `OPENAI_API_KEY` is configured. Provider URLs can target OpenAI or a third-party Realtime-compatible API. |
| Use third-party Chat Completions providers | Implemented | `POST /api/chat/completion` lets the browser send text and optional sampled frames through the Worker to an OpenAI-compatible Chat Completions provider. |
| Pick the provider protocol | Implemented | `/api/provider/config` exposes the non-secret default mode, and the workspace can switch between Chat Completions compatibility and Realtime. |
| Use voice-style interaction in Chat mode | Implemented | Supported browsers can use speech recognition to fill the Chat text composer and speech synthesis to read Chat answers aloud. |
| Stream low-latency voice to the model | Implemented | The browser posts an SDP offer with the short-lived client secret and plays the remote audio stream. |
| Avoid noisy-room voice false positives | Implemented | The session can run in push-to-talk mode, which disables server VAD and commits audio only after the user releases the hold control. |
| Mute the microphone during a live session | Implemented | The workspace toggles the local audio track with `MediaStreamTrack.enabled` without renegotiating WebRTC. |
| Send sampled frames into model context | Implemented | Manual and interval samples are sent as `conversation.item.create` data-channel events. |
| Type a text message during a session | Implemented | A composer in the dialogue board sends text-only conversation items over the data channel and requests a response. |
| See real token usage and estimated cost per session | Implemented | The usage meter parses authoritative `response.done` usage events into modality buckets with a USD estimate. |
| Cap response length and request text-only responses | Implemented | The session uses brief, standard, or detailed response budgets, and the workspace can request text-only `response.create` events to avoid assistant audio output. |
| Close forgotten-open Realtime sessions | Implemented | The browser warns after sustained inactivity and closes the Realtime connection after 120 seconds idle while preserving the 10-minute hard cap. |
| Stop paying for consumed camera frames on later turns | Implemented | Consumed frame items are deleted from the server-side conversation after each response, with a visible pruned counter and an opt-out toggle. |
| Skip static interval frames | Implemented | Automatic sampling compares downscaled grayscale frame signatures and skips low-change uploads; manual frame actions bypass the gate. |
| Use Chinese as the default demo interface | Implemented | Primary workspace labels, controls, transcript notices, accessibility labels, and client-side Realtime errors are localized for the contest audience. |
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
* **Provider configuration (implemented)**: the Worker accepts
  OpenAI-compatible Realtime base URL/path overrides and returns the browser
  SDP endpoint as `webrtcUrl`, so permanent keys and provider routing stay
  server-side.
* **Chat Completions compatibility (implemented)**: the Worker accepts
  ordinary OpenAI-compatible Chat Completions base URL/path/full URL overrides
  and uses `OPENAI_CHAT_MODEL` for text plus optional `image_url` data URL
  requests. This is the broadest third-party provider path because it does not
  require Realtime/WebRTC support.
* **Browser speech adapter for Chat mode (implemented)**: when the browser
  supports Web Speech APIs, Chat mode can turn microphone speech into text
  before sending the existing Chat request and can read returned text answers
  through browser speech synthesis. This does not send raw microphone audio to
  the Worker/model and does not create provider audio-output tokens; support
  and quality depend on the local browser/OS.
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
* **Frame-difference sampling (implemented)**: automatic interval sampling
  computes a downscaled grayscale frame signature and compares it with the last
  uploaded frame. Frames below the 4% mean luma-change threshold update the
  skipped counter but are not sent to the Realtime data channel; manual
  `Sample frame` and `Ask with frame` actions always bypass the gate.
* **Push-to-talk mode (implemented)**: session creation accepts
  `turnDetectionMode: "server-vad" | "push-to-talk"`. Push-to-talk maps to
  `turn_detection: null`, keeps the local audio track disabled while idle, and
  sends `input_audio_buffer.commit` plus `response.create` on release so noisy
  environments cannot trigger billable false turns.
* **Microphone mute (implemented)**: an independent toggle sets
  `MediaStreamTrack.enabled = false` in both turn modes. In push-to-talk mode,
  mute also prevents the hold control from arming audio.
* **Response budgets (implemented)**: session creation accepts
  `responseBudget: "brief" | "standard" | "detailed"`, and the Worker maps
  those presets to `max_response_output_tokens` values of 300 / 800 / 1600.
  Brief mode appends a concise-answer instruction. The workspace shows the
  active budget and token cap, and a live text-only toggle changes
  `response.create` to `modalities: ["text"]` so assistant responses can avoid
  audio output when the user wants the cheapest output path.
* **Idle auto-disconnect (implemented)**: the browser tracks meaningful
  activity from speech start, text sends, frame sends, push-to-talk commits,
  and response completion/output events. It warns in the transcript after about
  90 seconds idle and closes the Realtime connection after about 120 seconds
  idle, while the 10-minute hard cap remains the outer bound.

### Measurement protocol

The app exports the usage meter as JSON or CSV from the browser. The export is
based on authoritative `response.done` usage events and includes a Unix
millisecond `generatedAt` timestamp, per-turn token buckets, session totals, and
estimated USD cost. Use it as the source of truth for the final cost-control
evidence table.

Run each comparison with the same camera scene, prompt script, response budget,
and turn count. Start a fresh Realtime session for each row, then download the
usage report immediately after the final response completes. Keep the raw JSON
or CSV files with the PR notes so the table below can be audited.

| Lever | Baseline run | Optimized run | Metric to compare | Result |
| --- | --- | --- | --- | --- |
| History frame pruning | Pruning off | Pruning on | Last-turn input tokens and image input tokens | Pending live run |
| Frame-difference sampling | Auto sampling with repeated static scene and diff disabled | Auto sampling with diff enabled | Image input tokens, sent frames, skipped frames | Pending live run |
| Push-to-talk | Server VAD in a noisy room | Push-to-talk with same background noise | Audio input tokens and turn count | Pending live run |
| Response budget | Standard audio+text responses | Brief or text-only responses | Output audio/text tokens and estimated cost | Pending live run |
| Idle auto-disconnect | Session left open until hard cap | Session left idle after final turn | Connected time before close | Pending live run |

## Current Gaps

* Browser camera and microphone behavior must be manually tested because it
  depends on local hardware and browser permission prompts.
* End-to-end Chat or Realtime behavior requires `pnpm dev:worker` or deployment
  with a configured `OPENAI_API_KEY`; plain Vite dev mode does not provide the
  Worker API endpoint.
* Chat Completions mode needs `OPENAI_CHAT_MODEL`; use a model that supports
  image input if testing camera-frame understanding.
* Chat-mode speech input/playback depends on browser Web Speech API support and
  is a progressive enhancement, not a provider-side STT/TTS guarantee.
* The measurement table above still needs live Realtime runs from an environment
  with `OPENAI_API_KEY`; this local development environment did not expose the
  key.