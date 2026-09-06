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
  -ChatModel "your-vision-chat-model" `
  -TranscriptionModel "whisper-1"
```

If Chat Completions and speech transcription use separate providers:

```powershell
.\scripts\start-chat-worker.ps1 `
  -ApiKey "your-chat-provider-key" `
  -ChatBaseUrl "https://chat-provider.example/v1" `
  -ChatModel "your-vision-chat-model" `
  -TranscriptionApiKey "your-asr-provider-key" `
  -TranscriptionBaseUrl "https://asr-provider.example/v1" `
  -TranscriptionModel "your-asr-model"
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
* Try Chat voice input: record a short utterance, confirm it transcribes through
  the Worker, and verify the default mode auto-sends it to Chat. Switch to
  review mode and confirm the transcript fills the text composer instead.
* If the browser supports speech synthesis, try optional spoken answer playback.

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

## 6. Tauri 桌面演示（原生外壳）

桌面外壳（`src-tauri/`，PR #45 已并入 `main`）通过 `use-tauri` hook 在原生
WebView 中复用同一套 Web / Worker 前端，并暴露两个 Rust 命令
（`get_host_platform` / `run_terminal_command`）。桌面演示分为**开发态**与
**打包态**两条路径。

> 前置条件：本机需安装 [Rust 工具链](https://rustup.rs/)（Tauri v2 在
> Linux 还需 `webkit2gtk` / `libappindicator` 等系统库，详见
> [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/))。

### 6.1 开发态运行（HMR）

```powershell
corepack enable
corepack prepare pnpm@11.6.0 --activate
pnpm dev:tauri
```

该命令先以 Vite dev server（5173，`strictPort`）启动前端，再启动原生窗口
加载 `devUrl`。验证要点：

* 原生窗口以 1440x900 打开，标题为 “AI Visual Dialogue Assistant”。
* 摄像头授权弹窗、实时预览、Chat / Realtime 两种 provider 行为与浏览器一致。
* 开发态下 WebView 自动打开 DevTools（`debug_assertions`）。
* `use-tauri` 检测到 `__TAURI_INTERNALS__`，host platform 返回当前系统名
  （macos / linux / windows）。

### 6.2 打包态验证（发布路径）

```powershell
pnpm build:tauri
```

该命令先执行 `beforeBuildCommand: pnpm build`（产出 `dist/`），再由 Tauri
编译 Rust 后端并打包（`bundle.targets = "all"`），产物位于
`src-tauri/target/release/bundle/`。验证要点：

* `dist/` 前端产物被正确嵌入 `frontendDist`，离线可启动。
* 原生安装包（MSI / DMG / deb 或 AppImage）生成成功，应用可安装并启动。
* CSP（`default-src 'self'`）下摄像头 `getUserMedia`、媒体 `blob:`、
  WebSocket `wss:` 均可用。
* 无需外置 dev server，独立运行后端调用由 Worker 提供（本地需起 Worker
  或用远程部署地址）。

### 6.3 桌面端 Cost-Control 佐证

同第 5 节，在桌面窗口内对同一场景重复采样并导出用量报告，作为跨 Web /
桌面一致的性能佐证。

## 7. PR Evidence

Each final demo PR should include:

* Feature or change description.
* Implementation approach.
* Verification commands run.
* Manual hardware/browser checks completed.
* Dependency disclosure.
* Code provenance notes if any code was reused.
