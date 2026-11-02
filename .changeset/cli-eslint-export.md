---
"@marktiderman/genesis-cli": minor
---

Genesis's lint rules now ship from the CLI, as `@marktiderman/genesis-cli/eslint` (for `require` and `import`), so `genesis upgrade` brings new and changed rules to apps. Until now an app's `eslint.config.js` was copied once at `genesis init` and never updated.

- `genesis("native" | "web")` returns every Genesis piece for the platform; `testing()` is React Native Testing Library 14's await rules for test files (testing-library's `await-async-events` for fireEvent and userEvent, and `no-restricted-syntax` for unawaited render calls, `act`, `rerender`, `unmount` and a chained `userEvent.setup()`). `"web"` has no rules yet. `eslint-plugin-testing-library` is a new optional peer dependency, loaded only when `testing` is built.
- The native starter's `eslint.config.js` spreads `genesis("native")` instead of inlining the rules.
- The `genesis-cli-eslint-config` codemod runs when an app's CLI moves to 1.20.0: it adds the import and the spread to the app's flat config, and `eslint-plugin-testing-library` to a native app's devDependencies when it's missing. A config it can't edit safely is left as it is, with the lines to add printed. This changes the app's lint in the upgrade's pull request; unawaited RNTL calls in its tests become lint errors there.
- The doctor's new `genesis-eslint-config` rule (warn, ratcheted under `--base`) reports a native app whose config doesn't load the export, or loads it without the plugin installed.
