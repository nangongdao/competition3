# Fix Chinese Text Encoding Display

## Goal

Restore the assistant UI and related browser hook messages so Chinese text renders as readable UTF-8 text instead of literal question-mark placeholders.

## Requirements

* Replace corrupted visible Chinese strings in the assistant workspace with meaningful Chinese copy that matches the existing controls and state transitions.
* Replace corrupted localized messages in the Chat Completions and browser speech hooks.
* Keep the existing assistant behavior, provider modes, media flow, and cost controls unchanged.
* Add a regression check that fails when source files contain likely corrupted question-mark-only UI strings.

## Acceptance Criteria

* [x] `app/modules/assistant/components/assistant-workspace.tsx` no longer contains corrupted `???` Chinese placeholders.
* [x] Affected hook files no longer contain corrupted `???` Chinese placeholders.
* [x] Existing unit tests pass after updating expected localized strings.
* [x] Lint, typecheck, and build remain green.

## Definition of Done

* Tests added or updated where appropriate.
* Lint, typecheck, tests, and production build verified.
* No unrelated deployment configuration changes are included in this task.
* Pull request targets `main` from a focused task branch.

## Technical Approach

The original Chinese characters were already lost in the affected source files, so the fix rebuilds the localized strings from the surrounding UI logic and existing English/provider contracts. The implementation should be text-only and avoid changing state machines, API payloads, or component structure unless a small extraction is needed for testing.

## Out of Scope

* Reworking visual design or layout.
* Changing provider configuration or Cloudflare deployment settings.
* Adding a full i18n framework.

## Technical Notes

* Current branch: `fix/chinese-encoding-display`.
* Base branch: `main`.
* User has an unrelated local `wrangler.toml` deployment configuration change; do not commit it in this task.
* Root cause evidence: `rg -n "\?\?\?" app/modules/assistant` shows literal question-mark placeholders in frontend source.
