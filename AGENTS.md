<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Project Delivery Requirements

This repository is a competition submission. Before making implementation,
documentation, or build changes, read `task.md` and follow its delivery rules.

- Work on a task branch, not directly on `main`.
- Keep each pull request focused on one feature or one coherent change.
- Maintain continuous commit and pull request history; do not batch all work into
  one final submission.
- Open a GitHub pull request targeting `main` for each completed task. Do not
  treat `git push origin main` as task completion unless the user explicitly
  overrides the competition workflow.
- PR titles and descriptions must be non-empty and must include: feature or
  change description, implementation approach, and verification/testing method.
- If new third-party libraries or frameworks are introduced, list them in
  `README.md` and clarify which parts are original project work.
