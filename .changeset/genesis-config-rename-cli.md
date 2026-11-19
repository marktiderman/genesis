---
"@marktiderman/genesis-cli": minor
---

The `genesis-features-renamed-genesis-config` codemod: `genesis upgrade` (when
`@marktiderman/genesis-features` crosses 0.10.0) or `genesis codemod
genesis-features-renamed-genesis-config` rewrites every `@marktiderman/genesis-features` import and
subpath to `@marktiderman/genesis-config`, and renames the dependency in each package.json with the
installed genesis-config's range.

The doctor's `deprecated-import` rule now flags a whole deprecated package as well as tagged
exports: any import of a package Genesis renamed (genesis-features), or of one whose package.json
carries npm's `deprecated` notice, is reported once per import with the notice as advice.
