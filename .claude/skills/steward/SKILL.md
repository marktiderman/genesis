---
name: steward
description: House rules for PR Steward, /ship and /steward in this repository
user-invocable: false
disable-model-invocation: true
---

PR Steward (Claude Ship) and the `/ship` and `/steward` watches read this. AGENTS.md still
applies; where it says "the author", that includes you while you watch.

- Work on failing required checks, merge conflicts, and Important findings from Claude Code Review.
- Leave the adversarial review to its owner: never add or remove the `review: approved` label,
  never write a line starting "Verdict", and never approve, merge, retarget, or turn on auto-merge.
  Fix a finding from that review only when the comment that started you asks for it, and reply in
  its thread with the commit.
- Every push takes `review: approved` off and needs a new review, so batch your fixes into one push.
- Bring the base in with a merge. Never rebase, amend a pushed commit, or force-push.
- A package change needs a changeset (`pnpm changeset`).
- Never name an app or customer built on Genesis: write "a consumer app" (`pnpm check:private-names`).
- Don't regenerate `docs/component-reference.md`, `primitives.json` or `story-ids.json` in a
  feature PR; on a conflict in one, take main's version.
- Regenerate, don't hand-edit: `pnpm install` for `pnpm-lock.yaml`, `pnpm gen:codeowners` for
  `.github/CODEOWNERS`, `pnpm features build` for the generated block in AGENTS.md.
- Checks to run before pushing: `pnpm build:packages`, then `pnpm typecheck`, `pnpm test`,
  `pnpm lint:genesis`, `pnpm check:docs-match-exports`.
- Reference work tracked outside the repo only by its id.
