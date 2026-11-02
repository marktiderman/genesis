---
"@marktiderman/genesis-cli": minor
---

`genesis upgrade` and `genesis doctor` handle what a Bun lockfile keeps after an upgrade.

- **Stale nested copies.** Bun keeps a Genesis package nested under another one (`<parent>/@marktiderman/genesis-…` in `bun.lock`) across installs, even once the root's version satisfies the parent's range, so the app runs two copies. `genesis upgrade` drops those entries from `bun.lock` before the install (judged against the versions the release moves the root to), drops any the install leaves and installs once more, and lists what went in the summary; when it didn't install, the summary says to run `bun install`. A copy nested on purpose (the parent's range excludes the root's version) stays. Bun has no dedupe, so this is its counterpart of the `pnpm dedupe` the upgrade already runs.
- **Deleted overlays.** When the upgrade deletes an overlay (a vendored package now installed from npm), its workspace also leaves `bun.lock` and a root `package.json` `workspaces` entry naming its folder, so `bun install` no longer stops with "Workspace dependency not found". A removed overlay's pins are now applied to each `package.json` as it is after the bump, so they no longer undo the bump or another overlay's pin in the same file.
- **`genesis doctor`**: `lock-files` warns on a stale nested Genesis copy in `bun.lock` (at or above the app, with or without `genesis.lock.json`) and names the exact fix: delete that entry, then reinstall.

The binary `bun.lockb` and `pnpm-lock.yaml` aren't edited; with pnpm, `pnpm dedupe` and `duplicate-genesis-package` still cover duplicate copies.
