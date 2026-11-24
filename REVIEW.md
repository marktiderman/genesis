# Review instructions

Claude Code Review (Claude Ship) reads this root file from `main` for every PR, staging batches
included. Neither branch counts as protected for Code Review here: `main`'s ruleset requires no
approval and doesn't restrict updates, and the staging rulesets only require checks. So a change
here takes effect once released, and `@file` includes would not be expanded: the rules that
matter are written out below. Code Review honors lowered severities and the "Do not report"
list only when the default branch is protected, so until `main` qualifies they are guidance,
not guarantees: expect some Nits there. AGENTS.md (through CLAUDE.md) is project context for the review;
a change that breaks one of its rules is a finding. Cite the principle IDs
(G1–G6, `docs/FRAMEWORK.md`) where one applies.

## What Important means here

Important is for a finding that would break behavior, leak data, or block a rollback:

- A breaking change to a published package's API or a shared contract (core types, ResourceView,
  the data layer) without a major changeset, or without the docs that describe it.
- A package change without a changeset.
- Data access that bypasses the declared provider rules, or a declared function without an
  access-rule test.
- The name of an app or customer built on Genesis anywhere in the change.
- Docs that name API the packages don't export.
- A parallel copy of a piece Genesis already has (G1–G6), instead of a prop, variant or slot.

Everything else (naming, style, refactors, wording) is Nit at most.

## Do not report

- What CI already enforces: lint, formatting, type errors, `pnpm lint:genesis`,
  `pnpm check:docs-match-exports`, `pnpm check:private-names`, `pnpm features check`.
- Generated files: `docs/component-reference.md`, `apps/sample/app/data/primitives.json`,
  `apps/sample/app/data/story-ids.json`, `.github/CODEOWNERS`, and the generated block in AGENTS.md.
- Lockfiles (`pnpm-lock.yaml`) and `CHANGELOG.md` files.

## Always check

- A new primitive declares its doctor rule in its package.json (`genesis.doctor`).
- Web and native twins stay in step when one of them changes.
