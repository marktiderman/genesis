# Review instructions

Claude Code Review (Claude Ship) reads this file from `main` for every PR, staging batches
included: a non-default base counts only with a ruleset that restricts updates or requires an
approval, and the staging rulesets here do neither. So a change here takes effect once released.
The `@AGENTS.md` include below is expanded because `main` is protected; without that protection
Code Review would leave it as plain text.
The repo's rules are in AGENTS.md, included below; a change that breaks one of them is a finding. Cite the principle IDs
(G1–G6, `docs/FRAMEWORK.md`) where one applies.

@AGENTS.md

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
