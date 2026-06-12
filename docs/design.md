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
| Package final contest demo | Planned | Final pass should include verification notes and PR descriptions. |

## Cost Controls

* No continuous raw video upload: the app samples frames manually or at a
  conservative interval.
* Session duration policy: the backend returns a 10-minute intended cap in the
  session cost policy and the browser closes the Realtime connection when that
  cap is reached.
* Key safety: permanent OpenAI API keys stay in Worker environment variables.
* Compact default instructions: the Worker sends a short default Realtime
  instruction block.
* Local fallback: without `OPENAI_API_KEY`, the media workspace remains
  runnable and session start reports a configuration error.

## Current Gaps

* Browser camera and microphone behavior must be manually tested because it
  depends on local hardware and browser permission prompts.
* End-to-end Realtime behavior requires `pnpm dev:worker` or deployment with a
  configured `OPENAI_API_KEY`; plain Vite dev mode does not provide the Worker
  API endpoint.
