---
"@marktiderman/genesis-cli": minor
---

Every app upgrade cleans out its overlays and rebases them. `genesis upgrade` diffs each overlay against its upstream tag and the new version, prints a checklist that sorts each hunk as already shipped (dropped), promoted (link its Genesis PR in docs/genesis-upstream.md) or kept (say why), rebases what's left onto the new version by a three-way merge, and moves the marker's `upstream`. It deletes an overlay with nothing left and pins the release, and when a rebase conflicts it stops and lists the files without changing anything. The new doctor rule `overlay-behind` warns, failing `--strict`, when an overlay's `upstream` is older than the version the app pins.
