# Local Preview Control Scripts

## Goal

Make local project startup and shutdown easy for a Windows user who does not
want to remember process IDs or terminal windows. Add one-command PowerShell
scripts to start the local preview service, open the browser, record runtime
state, and stop the started service later.

## What I Already Know

* The user asked for a one-click script to start and close the project.
* This project is Windows-oriented in its local helper scripts.
* Existing helper scripts are PowerShell files under `scripts/`.
* `corepack pnpm dev` starts the Vite-only frontend on port 5173.
* `corepack pnpm dev:worker` builds the frontend and runs Wrangler dev, serving
  the frontend and Worker APIs together, usually on port 8787.
* The full local demo path should prefer the Worker preview because plain Vite
  dev does not provide Worker API endpoints.

## Requirements

* Add a start script for local preview.
* Add a stop script for local preview.
* Default startup should run the Worker-backed preview and open the browser to
  `http://localhost:8787`.
* Support a Vite-only mode for quick no-Worker frontend inspection.
* Track the started process in a PID/state file so shutdown is deterministic.
* Provide safe behavior when the preview is already running or no tracked
  preview exists.
* Avoid printing provider secrets.
* Document usage in README.

## Acceptance Criteria

* [x] `scripts/start-local-preview.ps1` starts a local preview in the
  background and writes state.
* [x] `scripts/stop-local-preview.ps1` stops the tracked local preview.
* [x] Runtime PID/log state is ignored by git.
* [x] README documents the start and stop commands.
* [x] Script syntax and project readiness checks pass.

## Definition of Done

* Scripts are committed on a task branch.
* `scripts/verify-demo.ps1 -SkipQuality -SkipBuild` passes.
* PowerShell parses both scripts successfully.
* A start/stop smoke test is run when feasible.
* A focused PR targets `main`.

## Out of Scope

* Running real provider model calls.
* Managing deployed Cloudflare Workers.
* Replacing the existing provider setup scripts.
* Cross-platform shell scripts for macOS/Linux.

## Technical Approach

Create Windows PowerShell helpers:

* `scripts/start-local-preview.ps1`
  * Parameters: `-Mode worker|vite`, `-Url`, `-NoOpen`, `-Force`.
  * Starts the selected command in a hidden PowerShell child process.
  * Writes PID, mode, URL, command, and log path to a local state file.
  * Opens the browser unless `-NoOpen` is provided.
* `scripts/stop-local-preview.ps1`
  * Reads the state file.
  * Stops the tracked process and child processes.
  * Removes the state file and points the user at the log.

## Decision (ADR-lite)

**Context**: Users may not know which terminal is running the local preview or
how to close it after starting the project.

**Decision**: Store preview runtime state under a git-ignored local directory
and stop by PID instead of asking the user to manually find ports/processes.

**Consequences**: Shutdown is deterministic for previews started by the helper.
If the user starts `pnpm dev` manually, the stop script will not kill unrelated
processes unless the user opts into broader manual cleanup later.
