# @marktiderman/genesis-studio (deprecated)

**Renamed to [`@marktiderman/genesis-data`](../data/README.md).** Genesis Data Studio is now **Genesis Data**: the
name "Genesis Studio" now belongs to the creator suite (Map, Imago and the tools beside them).

This package is a thin re-export of @marktiderman/genesis-data with the same entries and stylesheets, kept for two minor
versions so apps can move at their own pace. To move an app, change the imports and the dependency
from `@marktiderman/genesis-studio` to `@marktiderman/genesis-data`; the exports are the same. `genesis doctor` reports any import of the old name
that is left as `deprecated-import`.
