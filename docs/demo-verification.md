# Final Demo Verification

This checklist packages the local demo paths for the AI Visual Dialogue
Assistant. It is intended for the final contest pass and for PR reviewers who
need to reproduce the app without guessing which mode to run.

## 1. Toolchain and Static Checks

From the repository root:

```powershell
corepack enable
corepack prepare pnpm@11.6.0 --activate
.\scripts\verify-demo.ps1 -RunInstall
```

The script checks:

* Node.js 24+ and Corepack availability.
* Required project documents.
* `.dev.vars` provider readiness without printing secrets.
* `corepack pnpm lint`
* `corepack pnpm typecheck`
* `corepack pnpm test`
* `corepack pnpm build`

For a fast script syntax/configuration smoke test:

```powershell
.\scripts\verify-demo.ps1 -SkipQuality -SkipBuild
```

## 2. No-Key Browser Smoke Test

This path proves the workspace loads and handles missing model credentials
without exposing a browser-side key.

```powershell
corepack pnpm dev
```

Open the Vite URL printed by the command, usually:

```text
http://localhost:5173
```

Manual checks:

* The workspace renders without a blank screen.
* Camera and microphone permission prompts appear when requested.
* The live camera preview appears after permission is granted.
* Starting a live model path without Worker credentials shows a clear
  configuration error instead of a broken UI.

## 3. Chat Completions Provider Demo

Use this path for most third-party OpenAI-compatible providers because it only
requires a Chat Completions endpoint.

```powershell
.\scripts\start-chat-worker.ps1 `
  -ApiKey "your-provider-key" `
  -BaseUrl "https://api.your-provider.example/v1" `
  -ChatModel "your-vision-chat-model"
```

In a second PowerShell window:

```powershell
.\scripts\verify-demo.ps1 `
  -SkipQuality `
  -SkipBuild `
  -RequireProviderConfig `
  -WorkerUrl "http://localhost:8787"
```

Manual checks:

* Open `http://localhost:8787`.
* Confirm the provider mode is Chat Completions.
* Type a message and receive a text answer.
* If the selected model supports image input, sample a camera frame and ask a
  visual question.
* In a browser with Web Speech API support, try dictation and optional spoken
  answer playback.

## 4. Realtime Provider Demo

Use this path only for providers that implement the OpenAI-style Realtime
session and WebRTC SDP exchange.

```powershell
.\scripts\start-realtime-worker.ps1 `
  -ApiKey "your-provider-key" `
  -Model "your-realtime-model"
```

In a second PowerShell window:

```powershell
.\scripts\verify-demo.ps1 `
  -SkipQuality `
  -SkipBuild `
  -RequireProviderConfig `
  -WorkerUrl "http://localhost:8787"
```

Manual checks:

* Open `http://localhost:8787`.
* Start a Realtime session.
* Confirm remote assistant audio plays through the page.
* Confirm server VAD and push-to-talk modes can be selected before session
  start.
* Toggle microphone mute during a live session.
* Send a text message, a manual frame, and an ask-with-frame turn.
* Confirm the usage meter updates after `response.done` events.

## 5. Cost-Control Evidence Collection

When `OPENAI_API_KEY` is available, use the usage meter export as the source of
truth for the design measurement table.

For each comparison, keep the scene, prompts, response budget, and turn count
fixed. Start a fresh session for each row, then export the usage report
immediately after the final response.

Suggested runs:

* History frame pruning: pruning off vs pruning on.
* Frame-difference sampling: repeated static scene with diff disabled vs diff
  enabled.
* Push-to-talk: server VAD in a noisy room vs push-to-talk in the same room.
* Response budget: standard audio+text vs brief or text-only.
* Idle auto-disconnect: forgotten-open session vs idle close after final turn.

Keep the exported JSON or CSV files with the PR notes so the design table can
be audited later.

## 6. PR Evidence

Each final demo PR should include:

* Feature or change description.
* Implementation approach.
* Verification commands run.
* Manual hardware/browser checks completed.
* Dependency disclosure.
* Code provenance notes if any code was reused.
