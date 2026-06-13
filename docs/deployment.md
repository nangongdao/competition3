# Cloudflare Deployment

This guide describes how the project owner can publish the AI Visual Dialogue
Assistant to Cloudflare Workers. It covers the Worker, static frontend assets,
provider configuration, secrets, and post-deploy checks.

## 1. What Gets Deployed

`wrangler.toml` deploys one Cloudflare Worker:

```toml
name = "ai-visual-dialogue-assistant"
main = "src/worker/index.ts"
assets = { directory = "./dist", binding = "ASSETS", not_found_handling = "single-page-application" }
```

The Worker serves:

* The Vite production build from `dist/`.
* Backend API routes such as `/api/health`, `/api/provider/config`,
  `/api/chat/completion`, and `/api/realtime/session`.

## 2. Prerequisites

From the repository root:

```powershell
corepack enable
corepack prepare pnpm@11.6.0 --activate
corepack pnpm install --frozen-lockfile
```

You also need:

* A Cloudflare account with Workers enabled.
* Wrangler login access for that account.
* A provider API key for OpenAI or an OpenAI-compatible provider.
* A model choice for the provider mode you will use.

## 3. Choose Provider Mode

Chat Completions mode is the recommended production path for most third-party
providers because it only requires an OpenAI-compatible HTTP endpoint.

The checked-in `wrangler.toml` keeps a conservative default provider mode and
development environment label. Before a public deployment, set the deployed
Worker's non-secret variables to production values either in `wrangler.toml` or
in the Cloudflare dashboard.

### Chat Completions Mode

Use this when the provider supports `/v1/chat/completions` or a compatible
endpoint:

```toml
[vars]
ENVIRONMENT = "production"
OPENAI_PROVIDER_MODE = "chat"
OPENAI_BASE_URL = "https://api.openai.com/v1"
OPENAI_CHAT_COMPLETIONS_PATH = "/chat/completions"
OPENAI_CHAT_MODEL = "your-vision-chat-model"
```

For a third-party provider, replace `OPENAI_BASE_URL` and
`OPENAI_CHAT_MODEL`. If the provider requires a completely custom endpoint,
set `OPENAI_CHAT_COMPLETIONS_URL` instead of base URL plus path.

### Realtime Mode

Use this only when the provider supports OpenAI-style Realtime session creation
and WebRTC SDP exchange:

```toml
[vars]
ENVIRONMENT = "production"
OPENAI_PROVIDER_MODE = "realtime"
OPENAI_REALTIME_MODEL = "gpt-realtime"
OPENAI_REALTIME_VOICE = "alloy"
```

For a third-party Realtime provider, also configure
`OPENAI_REALTIME_BASE_URL`, `OPENAI_REALTIME_SESSION_PATH`,
`OPENAI_REALTIME_WEBRTC_PATH`, or the full URL overrides documented in
[`../README.md`](../README.md#environment-variables).

## 4. Configure Secrets

Do not commit real provider keys. Do not put `OPENAI_API_KEY` in
`wrangler.toml`, `.env`, frontend `VITE_` variables, browser settings, or URLs.

Use Wrangler Secrets for the deployed Worker:

```powershell
corepack pnpm exec wrangler login
corepack pnpm exec wrangler whoami
corepack pnpm exec wrangler secret put OPENAI_API_KEY
```

Paste the provider key when Wrangler prompts. Wrangler stores the secret in
Cloudflare; it is not written to the repository.

If you configure non-secret variables in the Cloudflare dashboard instead of
`wrangler.toml`, deploy with `--keep-vars` so Wrangler does not replace those
dashboard variables:

```powershell
corepack pnpm exec wrangler deploy --keep-vars
```

For reproducible contest handoff, prefer committing non-secret provider settings
to `wrangler.toml` and keeping only `OPENAI_API_KEY` as a secret.

## 5. Preflight Checks

Run the local readiness and build checks before deploying:

```powershell
.\scripts\verify-demo.ps1
corepack pnpm exec wrangler deploy --dry-run
```

The readiness script runs lint, typecheck, tests, and production build. The
Wrangler dry run compiles the Worker/Assets bundle without uploading it.

If you only want a fast deployment-script smoke check:

```powershell
.\scripts\verify-demo.ps1 -SkipQuality -SkipBuild
```

## 6. Deploy

Deploy the Worker and static assets:

```powershell
corepack pnpm build
corepack pnpm exec wrangler deploy
```

Wrangler prints the deployed URL, usually similar to:

```text
https://ai-visual-dialogue-assistant.<your-subdomain>.workers.dev
```

Keep that URL for the README, PR notes, and final demo handoff.

## 7. Verify The Deployed URL

Replace `$WorkerUrl` with the URL printed by Wrangler:

```powershell
$WorkerUrl = "https://ai-visual-dialogue-assistant.<your-subdomain>.workers.dev"
Invoke-WebRequest -UseBasicParsing "$WorkerUrl/api/health"
Invoke-WebRequest -UseBasicParsing "$WorkerUrl/api/provider/config"
.\scripts\verify-demo.ps1 -SkipQuality -SkipBuild -WorkerUrl $WorkerUrl
```

Then open `$WorkerUrl` in a browser and check:

* The workspace renders.
* Camera and microphone permissions can be granted.
* The selected provider mode matches your deployment configuration.
* Chat mode can send a text request and, with a vision-capable model, a sampled
  camera frame.
* Realtime mode can start a session only if the provider supports Realtime
  session creation and WebRTC.

If your local `.dev.vars` mirrors the deployed provider setup, you can make the
verification script fail on missing local provider config:

```powershell
.\scripts\verify-demo.ps1 `
  -SkipQuality `
  -SkipBuild `
  -RequireProviderConfig `
  -WorkerUrl $WorkerUrl
```

## 8. Update Or Roll Back

For normal updates:

```powershell
corepack pnpm build
corepack pnpm exec wrangler deploy
```

For secret rotation:

```powershell
corepack pnpm exec wrangler secret put OPENAI_API_KEY
```

If a deployed version is bad, use the Cloudflare dashboard Worker deployment
history to roll back to the previous Worker version, then fix the repository and
ship a new PR.

## 9. Common Failure Cases

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Worker loads, model calls fail with configuration error | `OPENAI_API_KEY` or provider model variable is missing | Set `OPENAI_API_KEY` with Wrangler Secret and configure the required non-secret vars |
| Chat mode works for text but not images | The configured chat model does not support image input | Use a vision-capable Chat Completions model |
| Realtime session fails | Provider does not implement OpenAI-style Realtime/WebRTC | Use Chat Completions mode or switch to a Realtime-capable provider |
| Dashboard vars disappear after deploy | Wrangler replaced vars from dashboard with `wrangler.toml` vars | Commit non-secret vars to `wrangler.toml` or deploy with `--keep-vars` |
| Browser cannot use camera or microphone | Browser permission, HTTPS, or device issue | Use the deployed HTTPS URL, allow permissions, and verify local hardware |
