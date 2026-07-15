# Conversation Productivity Contract

## 1. Scope / Trigger

Use this contract when changing the assistant transcript, Chat retry behavior, conversation export, clear actions, message navigation, or long-history rendering under `app/modules/assistant/`.

## 2. Signatures

```typescript
type TranscriptEntry = {
  id: string;
  speaker: "system" | "user" | "assistant";
  text: string;
  createdAt: number;
  deliveryStatus?: "sent" | "failed";
};

function getVisibleTranscriptEntries(
  entries: readonly TranscriptEntry[],
  visibleCount: number,
): readonly TranscriptEntry[];

function serializeConversationMarkdown(
  entries: readonly TranscriptEntry[],
  exportedAt: number,
): string;

function serializeConversationJson(
  entries: readonly TranscriptEntry[],
  exportedAt: number,
): string;
```

## 3. Contracts

- Transcript timestamps use Unix milliseconds; ISO strings are display/export formatting only.
- Keep transcript content in memory for the current session. Do not add prompts, transcripts, images, audio, retry payloads, provider URLs, credentials, or hidden instructions to local storage through this feature.
- A retryable Chat turn retains its request payload outside the exported transcript and associates it with the original user entry ID.
- Retrying must reuse the original user entry instead of appending a duplicate user message.
- Realtime and system entries are not retryable unless a future transport contract explicitly supports deterministic replay.
- JSON and Markdown exports contain visible transcript fields and export metadata only. They must not serialize captured frame data, audio, provider configuration, or hidden model instructions.
- Use bounded incremental rendering for long histories. Start with a recent window and reveal older entries in stable batches while preserving scroll position.
- New entries may auto-scroll only while the user is already near the latest message. When the user is reading older messages, keep their visible content stable and offer an explicit jump-to-latest action.
- Clipboard and download behavior must be progressive enhancement: permission denial or API absence produces accessible feedback without breaking the transcript.
- Clearing requires an explicit confirmation step and must remove retry payloads together with transcript display data.

## 4. Validation & Error Matrix

| Condition | Expected handling |
| --- | --- |
| Clipboard API unavailable or denied | Keep the message intact and announce copy failure. |
| Chat request fails | Mark the original user entry failed and retain one retry payload. |
| Retry clicked during an active Chat request | Ignore/disable retry; never issue a concurrent duplicate request. |
| Retry succeeds | Mark the original entry sent and remove its retained retry payload. |
| Retry fails again | Keep the same entry failed and replace/retain one retry payload. |
| Conversation is empty | Show a useful empty state; export and clear controls are disabled. |
| User reveals older entries | Increase the window by a bounded batch and preserve scroll position. |
| New entry arrives while reading history | Do not remove currently visible older content or force-scroll. |
| Clear confirmation is canceled | Preserve transcript, retry state, and current session behavior. |

## 5. Good / Base / Bad Cases

- Good: a failed visual Chat question retries with its original captured frame, updates the existing user entry, and never exports the frame data.
- Good: a user reading older messages receives new entries without losing their position, then uses “jump to latest” when ready.
- Base: clipboard access is denied; the UI reports failure and all other message actions remain usable.
- Bad: retry appends the same user prompt again, creating a misleading transcript.
- Bad: conversation export serializes `imageDataUrl`, instructions, secrets, or provider routing values.
- Bad: every transcript entry remains mounted indefinitely without an empirical need or performance boundary.

## 6. Tests Required

- Unit tests for newest-window selection and bounded window growth.
- Unit tests for retry eligibility during idle and in-flight Chat states.
- Unit tests for JSON export shape, version, timestamps, and exclusion of private request metadata.
- Unit tests for Markdown export with populated and empty transcripts.
- Browser smoke coverage for copy feedback, export controls, clear confirmation/cancel, and mobile layout.
- Full lint, type-check, test, build, and `git diff --check` before delivery.

## 7. Wrong vs Correct

Wrong:

```typescript
setTranscript((current) => [...current, failedTurn.message]);
localStorage.setItem("conversation", JSON.stringify({
  entries,
  imageDataUrl,
  instructions,
}));
```

Correct:

```typescript
setTranscript((current) =>
  current.map((entry) =>
    entry.id === failedTurn.entryId
      ? { ...entry, deliveryStatus: "failed" }
      : entry,
  ),
);

const json = serializeConversationJson(entries, Date.now());
```
