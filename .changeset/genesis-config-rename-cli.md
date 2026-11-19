---
"@marktiderman/genesis-cli": minor
---

The `genesis-features-renamed-genesis-config` codemod (`genesis codemod
genesis-features-renamed-genesis-config`; `genesis upgrade` runs it when genesis-features crosses
0.10.0 and whenever a package.json still lists genesis-features) moves an app from
`@marktiderman/genesis-features` to `@marktiderman/genesis-config`: every mention as a module name in
its scripts, the dependency in each package.json (with the release's genesis-config range, or dropped
when genesis-config is already listed), `overrides` / `pnpm.overrides` / `resolutions` keys,
`tsconfig*.json` paths and `pnpm-workspace.yaml`; it prints what still mentions the old name as a
checklist. Codemods now get the release's pinned versions (`wanted`) and can say they still apply
(`applies`), and the install note covers a workspace package's package.json.

The doctor's `deprecated-import` rule now flags a whole deprecated package as well as tagged
exports: any import of a package Genesis renamed (genesis-features), or of one whose package.json
carries npm's `deprecated` notice, is reported once per import with the advice to run the codemod.
