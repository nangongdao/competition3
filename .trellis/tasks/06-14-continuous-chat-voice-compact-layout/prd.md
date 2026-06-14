# Continuous Chat Voice and Compact Media Layout

## Goal

Make Chat Completions mode feel like a natural spoken turn-taking assistant: the user can start continuous voice once, speak one utterance, receive one model answer, and continue speaking without manually pressing "voice question" and "stop transcription" every turn. Also make the camera and dialogue area more compact so the user can see both the live image and model responses at the same time.

## Requirements

* Add a continuous Chat voice mode on top of the existing browser recording, Worker ASR transcription, and Chat Completions flow.
* In continuous mode, one user action starts the loop:
  * record a short utterance,
  * auto-stop after a short silence or maximum duration,
  * transcribe through `/api/speech/transcription`,
  * send the recognized text to Chat automatically,
  * speak the model answer through browser `speechSynthesis` when available,
  * then start listening for the next utterance.
* Provide a clear way to stop continuous voice mode without stopping camera access.
* Keep the existing manual/review path available for users who prefer checking transcription before sending.
* Avoid restarting recording while transcription, Chat request, or browser speech output is active.
* Handle empty transcription, ASR failure, Chat failure, lost microphone permission, and unsupported browser recording by stopping the loop and surfacing the existing localized error/status text.
* Tighten the main visual layout:
  * camera preview should use a normal video-like 16:9 frame instead of filling most of the viewport,
  * dialogue should sit directly below the camera and have more available vertical space,
  * the user should be able to see camera context and recent model response together on desktop,
  * mobile layout should remain single-column and non-overlapping.

## Acceptance Criteria

* [ ] In Chat mode, after device authorization, the user can start continuous voice with one control.
* [ ] Continuous mode automatically transcribes and sends each completed utterance without requiring a stop button press for every turn.
* [ ] After the model response completes, continuous mode resumes recording for the next user utterance.
* [ ] Browser speech synthesis is used for Chat answers when supported, and continuous mode enables it by default.
* [ ] Existing "先填入" review mode still works and does not auto-send.
* [ ] Camera preview is visibly smaller with stable 16:9 proportions on desktop.
* [ ] Dialogue is visually adjacent to the camera and remains readable without layout overlap.
* [ ] Lint and type-check pass.

## Definition of Done

* Implementation follows existing React hook/component patterns.
* No API keys or provider settings are exposed to the browser.
* No new third-party dependency is introduced.
* Quality checks run successfully or any failure is reported.
* Cloudflare deployment command is provided after implementation.

## Technical Approach

Use the existing `useWorkerSpeechTranscription` hook and `sendChatTurn` path. Add loop state in `AssistantWorkspace` rather than changing Worker APIs. Start MediaRecorder with a small `timeslice` and use chunk-size silence heuristics plus a maximum duration to auto-stop a turn. Restart the next recording only after the Chat answer path finishes and browser speech has had a chance to start.

The layout change stays in `app/app.css`: reduce the right-column camera row, enforce an aspect ratio on `.camera-stage`, and give `.dialogue-board` more useful height directly below the camera.

## Decision (ADR-lite)

**Context**: The user wants natural spoken turn-taking but the current Chat voice flow requires pressing start and stop for each utterance. Realtime voice remains optional and provider-dependent, while Chat + Worker ASR is the more compatible path currently working.

**Decision**: Implement continuous turn-taking in Chat mode with browser recording + Worker ASR + Chat Completions + browser speech synthesis, without moving to a new voice engine or adding dependencies.

**Consequences**: This is not true realtime VAD; silence detection depends on MediaRecorder chunk behavior and browser support. It is lower risk for this project because it reuses the working ASR and Chat path, keeps costs request-based, and avoids exposing secrets.

## Out of Scope

* Replacing Chat mode with a full duplex WebRTC/Reatime voice agent.
* Adding model-generated TTS audio.
* Changing Cloudflare Worker transcription or Chat provider contracts.
* Adding new speech/silence detection libraries.

## Technical Notes

* Current component: `app/modules/assistant/components/assistant-workspace.tsx`
* Current ASR hook: `app/modules/assistant/hooks/use-worker-speech-transcription.ts`
* Current layout styles: `app/app.css`
* Existing Chat answer speech uses browser `speechSynthesis` from `useBrowserSpeechAdapter`.
* Existing Chat voice already defaults `chatVoiceSendMode` to `auto-send`; this task adds hands-free turn progression.
