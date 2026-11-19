# @marktiderman/genesis-features (deprecated)

**Renamed to [`@marktiderman/genesis-config`](../features/README.md).** This package is a thin
re-export of genesis-config with the same subpaths (`.`, `/blocks`, `/gate`, `/gate/react`,
`/settings`, `/node`, `/react`), kept for two minor versions (0.10 and 0.11) so apps can move at their own pace.
It goes after that.

To move an app:

```bash
npx genesis codemod genesis-features-renamed-genesis-config   # genesis upgrade runs it too
```

The codemod rewrites every `@marktiderman/genesis-features` import (and subpath) to
`@marktiderman/genesis-config`, the dependency and overrides in each `package.json`, tsconfig paths
and `pnpm-workspace.yaml`, and lists what still mentions the old name. `genesis doctor` reports any
import that is left as `deprecated-import`.

Feature ids, `features.ts`, `features.json`, `flags.json` and the generated AGENTS.md block keep
their format.

Publishing and deprecating it: docs/RELEASING.md, "Renaming a package".
