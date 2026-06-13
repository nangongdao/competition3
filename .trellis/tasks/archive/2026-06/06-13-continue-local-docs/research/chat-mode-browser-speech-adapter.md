# Chat Mode Browser Speech Adapter Research

## Question

How should Chat Completions compatibility mode support voice interaction without
breaking the existing server-side provider boundary or adding broad new scope?

## Repo Context

* Chat mode currently sends typed text and optional camera frames through
  `POST /api/chat/completion`.
* The previous Chat Completions PR intentionally left microphone STT and TTS
  out of scope.
* `README.md` says Chat mode does not stream microphone audio or generate voice
  output unless the provider exposes separate STT/TTS APIs or the app adds a
  future browser speech adapter.
* The UI is already localized to Chinese and uses one assistant workspace
  component for Chat and Realtime modes.
* Competition delivery favors small focused PRs and no unnecessary new
  dependencies.

## Options

### Option A: Browser Web Speech adapter (recommended)

Use browser-provided speech recognition for Chat-mode dictation and
`speechSynthesis` for optional answer playback.

Pros:

* No new dependency and no new provider credentials.
* Keeps permanent API keys server-side because recognition/synthesis happen in
  the browser and Chat calls still go through the Worker.
* Directly improves the contest requirement for microphone-driven interaction
  in the broad third-party Chat mode.
* Fits one frontend-focused PR.

Cons:

* Speech recognition support is browser-dependent, especially outside
  Chromium-derived browsers.
* Recognition quality depends on the local browser/OS service and may require
  network access outside this app's provider boundary.
* It is not equivalent to low-latency streaming audio; Realtime mode remains
  the best path for true voice conversations.

### Option B: Provider STT/TTS endpoints

Add Worker routes for provider-specific speech-to-text and text-to-speech APIs.

Pros:

* More consistent behavior when a provider exposes compatible speech APIs.
* Server-side route can keep speech API keys out of the browser.

Cons:

* Provider APIs vary widely; this becomes a new configuration matrix.
* More backend endpoints, docs, environment variables, and tests.
* Higher chance of scope creep and dependency on unavailable credentials.

### Option C: Leave Chat mode text-only

Preserve current split: Chat mode is text/vision HTTP; Realtime mode owns
streaming voice.

Pros:

* No implementation risk.
* Current behavior is already documented.

Cons:

* Leaves a visible gap against the original "camera + microphone + response"
  contest brief for third-party Chat providers.

## Recommendation

Implement Option A as a progressive enhancement:

* Show Chat-mode voice controls only when the browser supports the needed APIs.
* Let users dictate into the existing text draft and then send the recognized
  text through the existing Chat Completions route.
* Add an optional auto-read setting for Chat answers using browser
  `speechSynthesis`.
* Surface clear Chinese status/error notices when browser speech support is
  unavailable or recognition fails.
* Do not change Realtime behavior, Worker routes, provider configuration, or
  API key handling.