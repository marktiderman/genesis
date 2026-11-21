# @marktiderman/genesis-studio-server (deprecated)

**Renamed to [`@marktiderman/genesis-data-server`](../data-server/README.md).** Genesis Data Studio is now **Genesis Data**: the
name "Genesis Studio" now belongs to the creator suite (Map, Imago and the tools beside them).

This package is a thin re-export of @marktiderman/genesis-data-server with the same entries and command, kept for two minor
versions so apps can move at their own pace. To move an app, change the imports and the dependency
from `@marktiderman/genesis-studio-server` to `@marktiderman/genesis-data-server`; the exports are the same. `genesis doctor` reports any import of the old name
that is left as `deprecated-import`.
