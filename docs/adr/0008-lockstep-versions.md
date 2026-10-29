# ADR 0008: Lockstep framework versions, moved by genesis upgrade

- Status: accepted as direction (approved by the maintainer, 2026-10-29); ships at the 1.0 line
- Date: 2026-10-29
- Features: `lockstep-versions`, `cli-upgrade`, `npm-scope-rename`, `package-subpaths`
- Related: ADR 0005 (layers)

## Context

Each of Genesis's 28 published packages has its own version line, from `0.0.7` to `3.2.1` on
2026-10-29, and changesets bumps each separately (`.changeset/config.json` has no `fixed` or
`linked` groups). An app therefore pins a set of versions that was never tested together, and
the gap grows: one app on Genesis is 21 minor versions behind on genesis-ui. The umbrella
(`@marktiderman/genesis`) pins one reproducible set for the packages it re-exports, which helps
only apps that use it. `genesis upgrade` already moves every Genesis package an app has to one
release and runs a codemod when a release declares a breaking change it fixes
(`src/upgrade/codemods.ts`).

## Decision

1. **One version line for the framework.** The runtime packages (foundation, primitives and
   modules) and genesis-cli release together under one version: a changesets `fixed` group.
   A release is one number an app moves to, and every package in it was tested together in the
   batch's CI.
2. **`genesis upgrade` is how an app moves.** It bumps every Genesis package to the release, and
   runs the codemods between the app's version and the new one, in order. A breaking change
   ships with a codemod when it is mechanical, and with a MIGRATION.md entry always.
3. **Where it starts.** At the 1.0 line, together with the package merges of split families
   (`package-subpaths`) and the `@genesisone` scope (`npm-scope-rename`), so apps migrate once.
   Until then packages keep their own versions, and genesis-ai stays 0.x with genesis-mcp in
   step with it.
4. **Outside the group**: private packages, and a package still at its hand-set first version
   (0.1.0), which joins the group at its first CI release.

## Consequences

- A patch to one package releases every package at the new number, with changelogs that say
  "no changes" for most. That is the cost, and it is what Angular, Nx and Expo's SDK pay for one
  tested set.
- The umbrella stops pinning per-package versions: the version is the pin.
- `genesis doctor` warns when an app's Genesis packages are on different versions.
- Rejected: `linked` groups (versions stay apart, so the set is still untested), and staying
  per-package (the drift above).
