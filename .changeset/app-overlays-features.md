---
"@marktiderman/genesis-features": minor
---

`readOverlayMarker(name, raw, problems)` validates a package's `genesis.overlay` marker (an app's local copy of a Genesis package): `upstream` is `@marktiderman/genesis-*@<semver>` naming the package itself, `since` a real `YYYY-MM-DD` day, `owner` and `reason` text. `readPackageMeta` checks the marker when present, and `PackageMeta` gains `overlay`. New exports: `readOverlayMarker`, `overlayUpstream`, `OverlayMarker`.

Features: app-overlays
