# AI Visual Dialogue Assistant

A contest project for building a browser-based AI assistant that can use camera context, microphone input, and cloud AI responses. This repository is being developed in small increments so each milestone remains runnable and reviewable.

## Current Scope

The app is now a runnable browser workspace with the first AI integration
boundary in place:

* Vite + React + TypeScript frontend
* Cloudflare Workers backend entry with Hono
* `/api/health` endpoint
* `/api/realtime/session` endpoint for Worker-created short-lived Realtime sessions
* Tailwind CSS v4 setup
* Browser camera and microphone permission flow
* Live camera preview after permission is granted
* Start/stop controls for a browser WebRTC Realtime session
* Remote assistant audio playback through the WebRTC peer connection
* Manual and low-frequency visual frame sampling controls
* Sampled frame delivery through the Realtime data channel
* ESLint, typecheck, build, and preview scripts
* Dependency and environment documentation

The media workspace remains usable without model credentials. A real Realtime
session requires the Worker endpoint and `OPENAI_API_KEY`.

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
pnpm install
pnpm dev
```

The local frontend runs on the Vite URL printed by the command, usually `http://localhost:5173`.

If the `pnpm` shim is not on PATH, use Corepack directly:

```bash
corepack pnpm install
corepack pnpm dev
```

## Worker Development

Build the frontend and start the Worker for end-to-end API and Realtime testing:

```bash
pnpm dev:worker
```

Health check:

```bash
curl http://localhost:8787/api/health
```

Realtime session check:

```bash
curl -X POST http://localhost:8787/api/realtime/session \
  -H "Content-Type: application/json" \
  -d "{\"visualContextMode\":\"manual\"}"
```

## Quality Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Environment Variables

Do not commit secrets. Use `.dev.vars` for local Worker runtime secrets.

Planned variables:

```bash
OPENAI_API_KEY=sk-...
ENVIRONMENT=development
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy
```

Frontend variables must use the `VITE_` prefix and must not contain secrets.

If `OPENAI_API_KEY` is not configured, the frontend still runs locally and the
Worker session endpoint returns a configuration error instead of exposing a
browser-side key. The Start session control will surface that configuration
error in the transcript.

## Realtime Flow

1. The browser asks `POST /api/realtime/session` for a short-lived session.
2. The Worker calls OpenAI with the permanent `OPENAI_API_KEY`.
3. The browser uses `session.client_secret.value` to post a WebRTC SDP offer to
   OpenAI's Realtime endpoint.
4. Microphone audio is sent over the peer connection, assistant audio is played
   through the page, and sampled camera frames are sent over the Realtime data
   channel.

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
