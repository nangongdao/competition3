# Development Roadmap

> Planning document for the AI Visual Dialogue Assistant. Covers the cost
> model that drives the plan, what has shipped, and what is planned with
> concrete implementation methods. Companion to [`design.md`](design.md)
> (architecture and user stories) and the contest brief in
> [`../task.md`](../task.md).
>
> Status legend: `shipped` (merged or in an open PR), `in progress`
> (implemented locally before PR publication), `planned` (committed direction
> with a concrete method), `candidate` (worth doing if time allows).

---

## 1. Cost Model That Drives the Plan

All cost work is grounded in three structural properties of the OpenAI
Realtime API (gpt-realtime, USD per 1M tokens, estimates kept in one place
in `app/modules/assistant/lib/cost-model.ts`):

| Bucket | Price | Note |
| --- | --- | --- |
| Audio input | 32 | ~10 tokens/second of speech |
| Audio output | 64 | The most expensive bucket, 4x text output |
| Image input | 5 | A 640px JPEG frame is ~500-800 tokens |
| Text input | 4 | |
| Text output | 16 | |
| Cached input | 0.4 | Prompt-cache hits are ~10-80x cheaper |

Three consequences shape every increment below:

1. **History re-billing (the snowball).** Every `response.create` re-bills
   the entire conversation history as input. Anything left in the
   conversation costs money on every later turn, not once. This is the
   single largest hidden cost source.
2. **Audio output dominates per-token cost.** Shorter or text-only answers
   are the highest-leverage output-side control.
3. **Idle time is not free.** While a session stays open, server VAD keeps
   listening and speech-like noise can trigger fully billed turns.

Strategy: **measure first, then cut the largest source, then reduce
useless input, then cap output, then write down the measured results.**

---

## 2. Shipped Increments

| PR | Branch | Increment | Status |
| --- | --- | --- | --- |
| #1 | `docs/pr-workflow-requirements` | PR workflow + git sync/fallback docs | merged |
| #2 | `feat/text-input-dialogue` | Text message composer over the Realtime data channel | open, stacked base |
| #3 | `feat/realtime-usage-cost-meter` | Usage meter: parses `response.done` usage into modality buckets, USD estimate, last-turn input (snowball indicator); 12 unit tests | open, stacked on #2 |
| #4 | `feat/history-frame-pruning` | History frame pruning: consumed frame items deleted via `conversation.item.delete` (pending -> in-flight -> consumed tracker, `evt_prune_` tagged deletes, silenced races); toggle + pruned counter; 10 unit tests | open, stacked on #3 |
| #6 | `feat/frame-difference-sampling` | Frame-difference sampling: downscaled luma diff skips low-change interval uploads, manual frame actions bypass the gate, sent/skipped counters show savings; 8 unit tests | open, stacked on #5 |
| #7 | `feat/push-to-talk-microphone-mute` | Push-to-talk and microphone mute: session-level turn detection mode, PTT audio buffer commit, live `MediaStreamTrack.enabled` mute, Worker payload mapping tests | open, stacked on #6 |
| pending | `feat/response-budgets` | Response budgets: Worker-enforced output token caps, brief-mode instruction, text-only `response.create` mode, cost-panel policy display, Worker/client tests | in progress |
| pending | `feat/idle-auto-disconnect` | Idle auto-disconnect: activity-based warning and disconnect timers, transcript notices, cost-panel policy display, client helper tests | in progress |
| pending | `docs/design-measurement-backfill` | Measurement backfill support: usage-meter JSON/CSV export, repeatable measurement protocol, pending evidence table scaffold | in progress |
| pending | `feat/chinese-interface-localization` | Chinese default interface localization: primary workspace labels, controls, transcript notices, accessibility labels, and Realtime client error messages | in progress |
| pending | `feat/third-party-realtime-provider` | Third-party Realtime provider configuration: Worker-side base URL/path/full URL overrides, browser uses returned `webrtcUrl`, README startup commands, and local PowerShell startup helper | in progress |

Earlier foundation (merged via the initial feature commit): Vite/React/TS
frontend, Hono Worker with `/api/realtime/session`, camera/mic permission
flow, WebRTC voice loop, manual + interval frame sampling, 10-minute
session cap, key-safe server-side session creation.

---

## 3. Planned Increments

Ordered by leverage. Each entry lists the method concretely enough that a
future session can implement it without re-deriving the design.

### 3.1 Frame-difference sampling (shipped)

*Cost lever: stop uploading frames that carry no new information.*

* **Problem**: interval sampling uploads a frame every N seconds even when
  the scene is static (user talking at a desk), paying ~500-800 image
  tokens per upload.
* **Method**: client-side change detection before upload. New pure module
  `app/modules/assistant/lib/frame-diff.ts`:
  * Downscale each candidate frame to a small grayscale grid (e.g. 32x18)
    via the existing capture canvas; extract luma values.
  * `frameDifferenceRatio(prev, next)`: mean absolute luma delta normalized
    to 0..1.
  * Skip upload when the ratio is below a threshold (start at ~0.04,
    tune empirically); always allow manual "Ask with frame" to bypass.
* **Wiring**: `captureFrame("auto")` keeps the last *uploaded* signature;
  the interval effect computes the diff and skips `sendVisualContext` on
  low change. Show `sent / skipped` counters next to the existing frame
  stats so the saving is visible.
* **Why client-side**: the diff runs on free browser CPU in milliseconds;
  the alternative (let the model decide) costs tokens to evaluate.
* **Verification**: unit tests on synthetic luma grids (identical, noise,
  scene change); manual A/B with a static scene — skipped count should
  dominate; usage meter image-input bucket grows slower with diff on.

### 3.2 Push-to-talk and microphone mute (in progress)

*Cost lever: eliminate VAD false-positive turns in noisy environments.*

* **Problem**: server VAD treats background speech/noise as user turns;
  each false positive bills audio input plus a full audio response.
* **Method**:
  * Session-level switch between `turn_detection: server_vad` (current
    behavior) and push-to-talk. The Worker session endpoint accepts a
    `turnDetectionMode: "server-vad" | "push-to-talk"` field
    (extend `realtimeSessionInputSchema`) and maps push-to-talk to
    `turn_detection: null` in the session payload.
  * In push-to-talk, a hold-to-speak button (pointer/keyboard events)
    enables the mic track only while held; on release send
    `input_audio_buffer.commit` + `response.create` over the data channel.
  * Independent mute toggle: `audioTrack.enabled = false` — no renegotiation
    needed, works in both modes.
* **Current implementation**: the browser exposes a locked-per-session turn
  mode selector, a live mute toggle, and a hold control that arms the audio
  track only while active. Push-to-talk releases send
  `input_audio_buffer.commit` and then `response.create`.
* **Verification**: worker test for the new schema field and payload
  mapping; manual check that no `input_audio_buffer.speech_started`
  events arrive while muted/not holding; usage meter audio-input bucket
  stays flat during background noise in push-to-talk mode.

### 3.3 Response budgets (in progress)

*Cost lever: audio output is the most expensive bucket; cap it.*

* **Method**:
  * Add `responseBudget: "brief" | "standard" | "detailed"` to the session
    request; Worker maps it to `max_response_output_tokens` (e.g. 300 /
    800 / 1600) and appends a brevity instruction in brief mode.
  * Optional per-turn text-only mode: workspace checkbox switches the
    `response.create` payload to `modalities: ["text"]` (16 vs 64 per 1M).
  * Show the active budget in the cost-controls panel.
* **Current implementation**: the Worker validates the budget enum, sends
  `max_response_output_tokens` values of 300 / 800 / 1600, appends a brief
  answer instruction for the brief preset, and returns the active budget plus
  token cap in `costPolicy`. The workspace exposes a locked-per-session budget
  selector and a live text-only response toggle that changes all
  `response.create` calls, including text messages, frame questions, and
  push-to-talk releases.
* **Verification**: worker test for payload mapping; usage meter
  output-audio bucket drops in text-only mode; transcript still renders
  text responses.

### 3.4 Idle auto-disconnect (in progress)

*Cost lever: stop paying for forgotten-open sessions; smarter than the
fixed 10-minute cap.*

* **Method**: track the last meaningful activity timestamp (speech started,
  text sent, frame sent, response done) in `useRealtimeSession`. A 30s
  interval check warns in the transcript at ~90s idle and closes the
  connection at ~120s. The existing 10-minute hard cap stays as the outer
  bound. Idle thresholds live next to the session constants.
* **Why it is not the old countdown idea**: it reacts to actual activity
  rather than displaying a fixed timer; active conversations are never
  interrupted, abandoned ones stop billing ~8 minutes sooner.
* **Verification**: unit-test the idle decision function with synthetic
  timestamps; manual check that an active conversation never disconnects.
* **Current implementation**: the browser tracks meaningful activity from
  speech start, text sends, visual frame sends, push-to-talk commits, and
  response completion/output events. A 30-second interval warns in the
  transcript after 90 seconds idle and closes the Realtime connection after
  120 seconds idle. The existing 10-minute hard cap remains unchanged, and the
  cost panel shows the idle close policy.

### 3.5 Design-doc measurement backfill (in progress — final cost PR)

*Deliverable lever: the contest asks "which techniques did you consider,
which did you adopt"; adopted ones need measured evidence.*

* **Method**: run scripted A/B sessions with `OPENAI_API_KEY` (same scene,
  same turn count) toggling each lever: pruning on/off, frame-diff on/off,
  push-to-talk vs VAD, brief vs standard budget. Record usage-meter
  buckets and estimated cost per run; backfill a results table into
  `design.md` cost section and final PR descriptions.
* **Current implementation**: the usage meter can export JSON and CSV reports
  from the browser. Each export includes a Unix millisecond timestamp, per-turn
  usage buckets, session totals, and estimated USD cost. `design.md` includes
  the measurement protocol and a pending results table. The live A/B values
  still require a configured `OPENAI_API_KEY` and local camera/mic test runs.
* **Verification**: the table cites the usage meter (authoritative
  `response.done` usage), not hand-waving.

---

## 4. Candidate Increments (time permitting)

| Candidate | Method sketch | Why candidate, not planned |
| --- | --- | --- |
| Interface localization (Chinese) | Translate primary workspace labels, controls, transcript notices, accessibility labels, and Realtime client error messages to Chinese by default | Shipped as `feat/chinese-interface-localization`; no runtime language switching in this increment |
| Cloudflare deployment | `wrangler deploy` with `OPENAI_API_KEY` secret; document the public demo URL in README | Needs the owner's Cloudflare account/decision; everything already runs on Workers |
| Text-history summarization | After N turns, replace old text items with a compact summary item (client-built, then prune originals) | Real snowball reduction for long chats, but riskier UX (model may "forget" details); frames were the cheap 80% |
| Session usage export | Download per-turn usage as JSON/CSV from the meter | Absorbed into 3.5 as the measurement export path |

---

## 5. Sequencing and Delivery Rules

* Order: 3.1 -> 3.2 -> 3.3 -> 3.4 -> 3.5, then candidates. Measurement
  (already shipped in #3) stays ahead of every optimization so each PR can
  prove its effect.
* One increment per PR; stacked PRs merge base-first (#2 -> #3 -> #4 -> ...).
* Every PR: feature description, implementation approach, verification
  method, dependency disclosure (per `task.md` and
  `.trellis/spec/shared/pr-workflow.md`).
* Quality gates per increment: `pnpm lint`, `pnpm typecheck`, `pnpm build`,
  `pnpm test`; pure logic ships with unit tests.
* Keep `main` runnable after every merge; the app must stay usable without
  `OPENAI_API_KEY` (clear configuration error instead of a broken UI).
