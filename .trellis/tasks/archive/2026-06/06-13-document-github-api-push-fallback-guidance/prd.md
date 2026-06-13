# Document GitHub API Push Fallback Guidance

## Goal

Capture the practical Git/GitHub submission lesson from the previous task so
future sessions avoid wasting time on repeated failing push attempts and choose
the fastest safe fallback path.

## Requirements

* Update the local PR workflow documentation with a concrete escalation path for
  Git HTTPS failures in this repository.
* Document when to stop retrying `git push` and `gh api` large tree requests.
* Recommend the small-blob Git Data API flow that worked:
  create/update blobs, create tree, create commit, update branch ref, then
  verify with `gh pr view` and `gh pr diff`.
* Document the stacked-PR SHA mismatch issue: remote API-created commits may
  need to use the remote base commit/tree, not local equivalent SHAs.
* Keep the guidance concise and operational.

## Acceptance Criteria

* [x] `.trellis/spec/shared/pr-workflow.md` includes the direct fallback
      guidance.
* [x] The guidance says what to avoid after repeated timeout/reset failures.
* [x] The guidance includes the verification commands required after API
      fallback.
* [x] Documentation remains in English.

## Definition of Done

* Task branch created.
* Documentation updated and committed.
* Trellis task archived and journal recorded if appropriate.

## Out of Scope

* Adding a reusable script for the API fallback.
* Rewriting the full PR workflow.
* Changing existing competition delivery requirements.

## Technical Notes

* Target document: `.trellis/spec/shared/pr-workflow.md`.
* Prior observed failure modes:
  * `git push` failed with `Recv failure: Connection was reset`.
  * HTTP/1.1 retry failed with port 443 timeout.
  * Large `gh api` / PowerShell REST tree creation timed out.
  * GitHub API commits must be verified through PR diff because remote SHAs can
    differ from local SHAs.
