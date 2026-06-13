# AI Visual Dialogue Assistant

A contest project for building a browser-based AI assistant that can use camera context, microphone input, and cloud AI responses. This repository is being developed in small increments so each milestone remains runnable and reviewable.

## Current Scope

The app is now a runnable browser workspace with the first AI integration
boundary in place:

* Vite + React + TypeScript frontend
* Cloudflare Workers backend entry with Hono
* `/api/health` endpoint
* `/api/provider/config` endpoint for safe non-secret provider mode defaults
* `/api/chat/completion` endpoint for OpenAI-compatible Chat Completions
  providers
* `/api/realtime/session` endpoint for Worker-created short-lived Realtime sessions
* Tailwind CSS v4 setup
* Browser camera and microphone permission flow
* Live camera preview after permission is granted
* Start/stop controls for a browser WebRTC Realtime session
* Remote assistant audio playback through the WebRTC peer connection
* Server VAD and push-to-talk turn modes, plus a live microphone mute toggle
* Manual and low-frequency visual frame sampling controls
* Frame-difference gating for automatic sampling, with visible sent/skipped
  counters to show static-scene upload savings
* Sampled frame delivery through the Realtime data channel
* Text message composer for typed questions during a Realtime session
* Browser speech dictation and optional spoken answer playback for Chat
  Completions mode when the browser supports Web Speech APIs
* Per-session usage meter built from Realtime `response.done` usage events,
  with modality buckets and an estimated cost
* Conversation history pruning that deletes consumed camera frames so they
  are billed once instead of on every later turn
* Chat Completions compatibility mode for third-party OpenAI-compatible API
  sites that do not support Realtime/WebRTC
* ESLint, typecheck, build, and preview scripts
* Dependency and environment documentation

The media workspace remains usable without model credentials. Real model calls
require the Worker endpoint and `OPENAI_API_KEY`. Chat Completions mode also
requires `OPENAI_CHAT_MODEL`; Realtime mode requires a Realtime-capable model.

## Requirements

* Node.js 24+
* pnpm 11.6.0 via Corepack

Enable pnpm if it is not already available:

```bash
corepack enable
corepack prepare pnpm@11.6.0 --activate
```

## Setup

```bash
corepack pnpm install
corepack pnpm dev
```

The local frontend runs on the Vite URL printed by the command, usually `http://localhost:5173`.

If the `pnpm` shim is not on PATH, use Corepack directly:

```bash
corepack pnpm install
corepack pnpm dev
```

## Final Demo Verification

Use the packaged demo readiness check before a final local demo or PR handoff:

```powershell
.\scripts\verify-demo.ps1 -RunInstall
```

For a fast smoke check that does not run lint, tests, or build:

```powershell
.\scripts\verify-demo.ps1 -SkipQuality -SkipBuild
```

When a Worker is already running, verify its health and provider config without
printing secrets:

```powershell
.\scripts\verify-demo.ps1 `
  -SkipQuality `
  -SkipBuild `
  -RequireProviderConfig `
  -WorkerUrl "http://localhost:8787"
```

See [`docs/demo-verification.md`](docs/demo-verification.md) for the full
no-key, Chat Completions, Realtime, hardware, and cost-evidence checklist.

## Worker Development

Build the frontend and start the Worker for end-to-end API and Realtime testing:
```bash
corepack pnpm dev:worker
```

Health check:

```bash
curl http://localhost:8787/api/health
```

Realtime session check:

```bash
curl -X POST http://localhost:8787/api/realtime/session \
  -H "Content-Type: application/json" \
  -d "{\"visualContextMode\":\"manual\",\"turnDetectionMode\":\"server-vad\"}"
```

Chat Completions check:

```bash
curl -X POST http://localhost:8787/api/chat/completion \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"hello\",\"responseBudget\":\"brief\"}"
```

## Cloudflare Deployment

For the online demo path, deploy the Worker and static assets with Wrangler.
The permanent provider key must be stored as a Cloudflare Worker secret, not in
the repository or a frontend variable.

See [`docs/deployment.md`](docs/deployment.md) for the full Cloudflare
deployment workflow, including provider-mode configuration, `wrangler secret`
commands, `wrangler deploy`, and deployed URL verification.

## Windows Quick Start With Third-Party Chat Completions

This is the recommended mode for most third-party API sites because they
usually support `/v1/chat/completions`, not OpenAI Realtime WebRTC.

```powershell
cd E:\competition3
corepack enable
corepack prepare pnpm@11.6.0 --activate
corepack pnpm install
.\scripts\start-chat-worker.ps1 `
  -ApiKey "your-provider-key" `
  -BaseUrl "https://api.your-provider.example/v1" `
  -ChatModel "your-vision-chat-model"
```

Open the Worker URL after startup:

```text
http://localhost:8787
```

If the provider uses a custom Chat Completions path:

```powershell
.\scripts\start-chat-worker.ps1 `
  -ApiKey "your-provider-key" `
  -BaseUrl "https://api.your-provider.example/v1" `
  -ChatCompletionsPath "/chat/completions" `
  -ChatModel "your-vision-chat-model"
```

If the provider requires a completely custom endpoint URL:

```powershell
.\scripts\start-chat-worker.ps1 `
  -ApiKey "your-provider-key" `
  -ChatCompletionsUrl "https://api.your-provider.example/custom/chat" `
  -ChatModel "your-vision-chat-model"
```

## Windows Quick Start With Realtime

Use this only when the provider explicitly supports OpenAI-style Realtime
session creation plus WebRTC SDP exchange.

PowerShell startup command for the default OpenAI Realtime endpoint:

```powershell
cd E:\competition3
corepack enable
corepack prepare pnpm@11.6.0 --activate
corepack pnpm install
.\scripts\start-realtime-worker.ps1 -ApiKey "sk-your-key"
```

Open the Worker URL after startup:

```text
http://localhost:8787
```

PowerShell startup command for a third-party OpenAI-compatible Realtime
provider:

```powershell
cd E:\competition3
.\scripts\start-realtime-worker.ps1 `
  -ApiKey "your-provider-key" `
  -BaseUrl "https://api.your-provider.example/v1" `
  -Model "your-realtime-model" `
  -Voice "alloy"
```

If the provider does not use OpenAI's default Realtime paths, override the
paths:

```powershell
.\scripts\start-realtime-worker.ps1 `
  -ApiKey "your-provider-key" `
  -BaseUrl "https://api.your-provider.example/v1" `
  -SessionPath "/realtime/sessions" `
  -WebrtcPath "/realtime" `
  -Model "your-realtime-model"
```

If the provider requires completely different endpoint URLs, override the full
URLs:

```powershell
.\scripts\start-realtime-worker.ps1 `
  -ApiKey "your-provider-key" `
  -SessionUrl "https://api.your-provider.example/custom/realtime/session" `
  -WebrtcUrl "https://rtc.your-provider.example/connect" `
  -Model "your-realtime-model"
```

## Quality Checks

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Environment Variables

Do not commit secrets. Use `.dev.vars` for local Worker runtime secrets.

Worker runtime variables:

```bash
OPENAI_API_KEY=sk-...
ENVIRONMENT=development
OPENAI_PROVIDER_MODE=chat
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_CHAT_BASE_URL=
OPENAI_CHAT_COMPLETIONS_PATH=/chat/completions
OPENAI_CHAT_COMPLETIONS_URL=
OPENAI_CHAT_MODEL=
OPENAI_REALTIME_BASE_URL=
OPENAI_REALTIME_SESSION_PATH=/realtime/sessions
OPENAI_REALTIME_WEBRTC_PATH=/realtime
OPENAI_REALTIME_SESSION_URL=
OPENAI_REALTIME_WEBRTC_URL=
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy
```

Parameter meanings:

* `OPENAI_API_KEY`: Permanent server-side API key for OpenAI or the
  third-party provider. Required for real Realtime sessions. Never expose it
  through `VITE_` variables, browser settings, localStorage, or URLs.
* `ENVIRONMENT`: Runtime label returned by `/api/health`; use `development`
  locally.
* `OPENAI_PROVIDER_MODE`: Frontend default provider mode. Use `chat` for
  ordinary OpenAI-compatible Chat Completions providers, or `realtime` for
  Realtime/WebRTC providers. Defaults to `chat` when unset or invalid.
* `OPENAI_BASE_URL`: OpenAI-compatible API root. Defaults to
  `https://api.openai.com/v1`. For many third-party providers this is the only
  URL parameter you need to change.
* `OPENAI_CHAT_BASE_URL`: Optional Chat Completions-specific API root. If set,
  it overrides `OPENAI_BASE_URL` only for `/api/chat/completion`.
* `OPENAI_CHAT_COMPLETIONS_PATH`: Path appended to the selected Chat base URL.
  Default: `/chat/completions`.
* `OPENAI_CHAT_COMPLETIONS_URL`: Optional full Chat Completions endpoint URL.
  Use only when the provider cannot be represented by base URL plus path.
* `OPENAI_CHAT_MODEL`: Provider model ID used for Chat Completions mode. This
  is required for real Chat Completions calls. Use a vision-capable model if
  you want camera-frame understanding.
* `OPENAI_REALTIME_BASE_URL`: Optional Realtime-specific API root. If set, it
  overrides `OPENAI_BASE_URL` only for Realtime session creation and WebRTC SDP
  exchange.
* `OPENAI_REALTIME_SESSION_PATH`: Path appended to the selected base URL for
  creating short-lived sessions. Default: `/realtime/sessions`.
* `OPENAI_REALTIME_WEBRTC_PATH`: Path appended to the selected base URL for
  browser WebRTC SDP exchange. Default: `/realtime`.
* `OPENAI_REALTIME_SESSION_URL`: Optional full session-creation URL. Use only
  when the provider cannot be represented by base URL plus path.
* `OPENAI_REALTIME_WEBRTC_URL`: Optional full WebRTC SDP URL. Use only when the
  provider cannot be represented by base URL plus path.
* `OPENAI_REALTIME_MODEL`: Provider model ID used when creating a Realtime
  session. Default: `gpt-realtime`.
* `OPENAI_REALTIME_VOICE`: Provider voice ID used for audio output when the
  provider supports voice selection. Default: `alloy`.

Frontend variables must use the `VITE_` prefix and must not contain secrets.

If `OPENAI_API_KEY` is not configured, the frontend still runs locally and the
Worker endpoints return configuration errors instead of exposing a browser-side
key. Chat mode will also report a configuration error until
`OPENAI_CHAT_MODEL` is set.

## Third-Party Provider Requirements

### Chat Completions mode

This mode is intended for broad third-party compatibility. The provider/model
must support:

* `POST /v1/chat/completions` or a configurable equivalent endpoint.
* Bearer API key authentication.
* A request body with `model`, `messages`, and `max_tokens`.
* User message content as plain text.
* `choices[0].message.content` text in the response.
* For camera-frame understanding: multimodal message content with
  `type: "image_url"` and a `data:image/...` URL. Text-only chat models can
  still answer typed questions, but they cannot understand the sampled frame.

Chat mode does not stream raw microphone audio to the model and does not ask
the provider to generate audio tokens. Instead, supported browsers can use the
Web Speech APIs as a local adapter: speech recognition fills the existing text
composer, and speech synthesis can read returned text answers aloud. Browser
support and recognition quality depend on the user's browser/OS; use Realtime
mode when you need true low-latency model audio.

### Realtime mode

Realtime is optional. A provider that says it is "OpenAI compatible" is not
enough unless it also implements the Realtime WebRTC surface used here.

The provider/model must support:

* Creating a short-lived Realtime session with a Bearer API key.
* Returning a session object with `client_secret.value` or a compatible
  `client_secret` string.
* WebRTC SDP exchange over HTTP with `Content-Type: application/sdp` and
  `Authorization: Bearer <client_secret>`.
* Realtime data channel events using the `oai-events` channel.
* `conversation.item.create` messages with `input_text` content.
* `conversation.item.create` messages with `input_image.image_url` data URLs if
  you want camera-frame understanding.
* `response.create` with `modalities: ["audio", "text"]` and/or
  `modalities: ["text"]`.
* Microphone audio input over WebRTC.
* `input_audio_buffer.commit` if push-to-talk mode is used.
* `turn_detection: null` if push-to-talk mode is used, or server VAD if
  `server-vad` mode is used.
* `max_response_output_tokens` or a compatible response length control if you
  want the response budget selector to work as intended.

Providers that only support `/v1/chat/completions`, `/v1/responses`, or normal
HTTP text generation cannot be connected to this project without adding a
separate non-Realtime adapter.

## Realtime Flow

1. The browser asks `POST /api/realtime/session` for a short-lived session.
2. The Worker calls the configured Realtime provider with the permanent
   `OPENAI_API_KEY`.
3. The Worker returns the short-lived provider session plus a configured
   `webrtcUrl`.
4. The browser uses `session.client_secret.value` to post a WebRTC SDP offer to
   `webrtcUrl`.
5. Microphone audio is sent over the peer connection. Server VAD can detect
   turns automatically, or push-to-talk can disable server VAD and commit the
   audio buffer only when the user releases the hold control.
6. Assistant audio is played through the page, and sampled camera frames are
   sent over the Realtime data channel.

## Dependencies

Runtime:

* React
* React DOM
* React Router
* Hono
* Lucide React
* Zod

Development:

* Vite
* TypeScript
* Tailwind CSS
* Cloudflare Workers types
* Wrangler
* ESLint

## Original Functionality

This project is implemented for the contest from this repository's `task.md`. Later PR descriptions should explicitly state any copied or reused code if that ever happens.

## Design Notes

See [`docs/design.md`](docs/design.md) for planned vs implemented user stories,
architecture notes, and cost-control decisions.

See [`docs/roadmap.md`](docs/roadmap.md) for the development roadmap: the
realtime cost model, shipped increments, and planned features with their
implementation methods.
