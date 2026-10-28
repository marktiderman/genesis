# Contributing to Genesis

## The one rule: reuse, then extend, then invent

This is the Genesis way, and [`docs/FRAMEWORK.md`](./docs/FRAMEWORK.md) (Part 1) says it in
full: the purpose, what counts as config and what counts as custom code, and how an
invention moves up into Genesis. Cite its principle IDs (G1–G6) in reviews.

Before adding a new component, token, variant, or dependency, check it doesn't
already exist and that reuse won't do:

1. Search [`docs/component-reference.md`](./docs/component-reference.md) —
   the auto-generated catalogue of every export (`pnpm gen:component-reference`
   to regenerate).
2. If something close already exists, extend it (new prop, new variant)
   rather than adding a sibling that duplicates most of its behavior.
3. The burden of proof for adding something new is on the PR, not the
   reviewer — say in the PR description what you checked and why reuse or
   extension didn't fit.

## Setup

- **Package manager:** pnpm (`packageManager: pnpm@11.26.0`). Node `>=20`.
- `pnpm install`
- `pnpm build:packages`

## Branch & PR flow

1. Fork or branch off `main`. Keep each PR to one coherent change.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org):
   `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:` — scope optional,
   e.g. `feat(ui): promote Button loading slot`.
3. Add a changeset for any `packages/**` source change (below).
4. Open the PR ready for review (not draft). CodeRabbit reviews it against `AGENTS.md` and
   `docs/FRAMEWORK.md` (its settings are in `.coderabbit.yaml`); comment `@coderabbitai review`
   to ask again after you push.

## Changesets (required for package changes)

Any change to `packages/**` source needs a changeset:

```bash
pnpm exec changeset   # pick the changed packages + bump level
```

- Bump level matches semver impact. Genesis ships breaking changes at
  **minor on 0.x** and **major on 1.x+** — not the SemVer default of "major
  always." A 0.x package hasn't promised API stability yet; treat every 0.x
  minor as a potential break.
- `apps/sample` and `apps/genesis-rn-starter` are ignored by changesets — no
  changeset needed for changes scoped to those.

## Before you push

```bash
pnpm lint:genesis   # legacy-imports + token-usage + forbidden-imports + peer-deps + testid-coverage
pnpm typecheck
pnpm build:packages
pnpm test
```

## PR gates (what must pass to merge)

| Gate | What it checks |
| --- | --- |
| **CI** | `pnpm build:packages && pnpm typecheck && pnpm test && pnpm lint`, on every push/PR. |
| **Genesis Lint** | The `pnpm lint:genesis` checks above, run as separate jobs so one failure doesn't hide the rest, plus a per-package exports-resolve check (part of each package's own `build`). Also usable as a reusable workflow (`uses: marktiderman/genesis/.github/workflows/genesis-lint.yml@main`) if you're building on Genesis in your own repo and want the same gates. |
| **Tarball Integrity** | Builds every publishable package and asserts its `npm pack --dry-run` tarball actually contains `dist/` + a `.d.ts` — a package that publishes empty or unbuilt fails loud here instead of shipping silently. |

## Publishing

Merges to `main` open or update a "chore: version packages" PR (via
[changesets](https://github.com/changesets/changesets)); merging *that* PR
publishes to npm via OIDC trusted publishing — no long-lived npm token in
this repo.

## Getting help

- **How do I use a package?** Start with its README under `packages/`, then
  [`docs/component-reference.md`](./docs/component-reference.md) for every export and the
  design docs in [`docs/`](./docs).
- **Found a bug?** Open an [issue](https://github.com/marktiderman/genesis/issues/new/choose)
  with the package, its version and the smallest steps that reproduce it.
- **Want a feature?** Open an issue that describes the need. Read
  [`docs/FRAMEWORK.md`](./docs/FRAMEWORK.md) first: Genesis grows by reuse, then extension, and
  takes in what several apps need.

## Security

Report a vulnerability privately, as [`SECURITY.md`](./SECURITY.md) says, never in a public issue.
