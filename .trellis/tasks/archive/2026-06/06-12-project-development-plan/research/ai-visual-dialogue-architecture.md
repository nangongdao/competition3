# AI visual dialogue architecture research

## Sources checked

* OpenAI Realtime API guide: https://developers.openai.com/api/docs/guides/realtime
* OpenAI Realtime WebRTC guide: https://developers.openai.com/api/docs/guides/realtime-webrtc
* OpenAI Realtime costs guide: https://developers.openai.com/api/docs/guides/realtime-costs
* OpenAI vision/image input guide: https://developers.openai.com/api/docs/guides/images-vision
* OpenAI latest model guide: https://developers.openai.com/api/docs/guides/latest-model

## Common patterns

* Browser apps should not expose permanent OpenAI API keys. A thin backend should mint short-lived credentials or proxy requests.
* Realtime voice UX is usually built with WebRTC in the browser for low-latency microphone input and audio output.
* Visual understanding can be added by sampling camera frames and sending selected frames to a vision-capable model instead of streaming every video frame.
* Cost control usually comes from shorter sessions, turn detection, model selection, truncation, prompt caching, and reducing media volume.

## Repository constraints

* The repository currently has no application code, only `task.md` and Trellis/agent configuration.
* Project specs are already oriented toward Cloudflare Workers + Hono + Vite/React + TypeScript.
* The contest requires a runnable main branch at every PR boundary and a separate design document covering user stories and cost-control techniques.

## Feasible approaches

### Approach A: Browser WebRTC + Worker ephemeral session (recommended)

* Build a Vite/React app that captures camera and microphone in the browser.
* Add a Cloudflare Worker endpoint that creates a short-lived OpenAI Realtime session credential.
* Use WebRTC for natural voice interaction.
* Sample camera frames on user turns or at a controlled interval and include them as visual context.
* Pros: best voice latency, protects API key, matches project specs, strong demo value.
* Cons: more integration complexity than a text-first app.

### Approach B: Text/audio pipeline with periodic vision calls

* Use browser speech recognition or recorded audio upload/transcription, then call a vision-capable Responses API endpoint with sampled frames.
* Pros: simpler to debug, less WebRTC complexity.
* Cons: less natural voice UX, more latency, weaker fit for the "AI dialogue" requirement.

### Approach C: Frontend-only mock/demo mode first

* Build a polished local demo with camera/mic permissions and deterministic mock AI replies.
* Add real model integration in a later PR.
* Pros: fastest first PR and useful for UI validation.
* Cons: does not satisfy core AI requirement until later.

## Recommendation

Use Approach A as the target architecture, but implement it in small PR-style increments:

1. Scaffold a runnable Cloudflare Workers + Vite/React app and document dependencies.
2. Build camera/microphone capture UI with a local mock assistant state.
3. Add Worker-backed Realtime session creation and browser WebRTC connection.
4. Add camera frame sampling and vision context strategy.
5. Add design document covering planned/implemented user stories and cost-control decisions.

