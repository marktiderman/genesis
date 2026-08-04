# Contributing to Genesis

## The one rule: Reuse > Extend > Create

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

- **Package manager:** pnpm (`packageManager: pnpm@9.15.4`). Node `>=20`.
- `pnpm install`
- `pnpm build:packages`

## Branch & PR flow

1. Fork or branch off `main`. Keep each PR to one coherent change.
2. Commit with [Conventional Commits](https://www.conventionalcommits.org):
   `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `ci:` — scope optional,
   e.g. `feat(ui): promote Button loading slot`.
3. Add a changeset for any `packages/**` source change (below).
4. Open the PR ready for review (not draft).

## Changesets (required for package changes)

Any change to `packages/**` source needs a changeset:

```bash
pnpm exec changeset   # pick the changed packages + bump level
```

- Bump level matches semver impact. Genesis ships breaking changes at
  **minor on 0.x** and **major on 1.x+** — not the SemVer default of "major
  always." A 0.x package hasn't promised API stability yet; treat every 0.x
  minor as a potential break.
- `apps/sample` and `apps/sample-native` are ignored by changesets — no
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
