---
"@marktiderman/genesis-cli": minor
---

Two doctor rules read export maturity from the JSDoc tags in the installed Genesis packages' published declarations: `deprecated-import` (warn) for a named import of an export tagged `@deprecated` or `@stability Deprecated`, with the tag's advice, and `beta-import` (info) for one tagged `@stability Beta` or `Experimental`. Only top-level declarations count; a deprecated prop stays the type checker's to show.
