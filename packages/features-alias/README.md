# @marktiderman/genesis-features (deprecated)

**Renamed to [`@marktiderman/genesis-config`](../features/README.md).** This package is a thin
re-export of genesis-config with the same subpaths (`.`, `/blocks`, `/gate`, `/gate/react`,
`/node`, `/react`), kept for two minor versions (0.10 and 0.11) so apps can move at their own pace.
It goes after that.

To move an app:

```bash
npx genesis upgrade                                      # runs the codemod when genesis-features crosses 0.10.0
npx genesis codemod genesis-features-renamed-genesis-config   # or run it by hand
```

The codemod rewrites every `@marktiderman/genesis-features` import (and subpath) to
`@marktiderman/genesis-config`, and the dependency in `package.json`. `genesis doctor` reports any
import that is left as `deprecated-import`.

Feature ids, `features.ts`, `features.json`, `flags.json` and the generated AGENTS.md block keep
their format.
