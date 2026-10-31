---
"@marktiderman/genesis-features": patch
---

Layering fixes for optional packages: an optional peer is left out of the cycle search, so an upgrade's adapter that uses the primitive no longer reports a false cycle. `LayerPackage.valueImports` (filled by the repo's layering check) lets a foundation package or primitive import an optional peer only for types or with `import()`. `packageLayerProblems` refuses `genesis.overlay` on a Genesis package itself, and the overlay marker's `upstream` refuses build metadata and a `-local` tag. `optional` on a module is documented as adding no rule.

Features: package-layering, app-overlays
