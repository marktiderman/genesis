# @marktiderman/genesis

One-install umbrella for the Genesis DS (design system). Holds no code of
its own — every subpath re-exports a granular `@marktiderman/genesis-*`
package.

```ts
import { Button } from "@marktiderman/genesis/ui";
import { useSwitchboard } from "@marktiderman/genesis/switchboard";
import { tokens } from "@marktiderman/genesis/design-system/tokens";
```

| Subpath                     | Re-exports                            |
| ---------------------------- | -------------------------------------- |
| `@marktiderman/genesis/core` | `@marktiderman/genesis-core`           |
| `@marktiderman/genesis/ui`   | `@marktiderman/genesis-ui`             |
| `.../ui/data`                | `@marktiderman/genesis-ui/data`        |
| `.../ui/utils`               | `@marktiderman/genesis-ui/utils`       |
| `.../ui/status-colors`       | `@marktiderman/genesis-ui/status-colors` |
| `.../ui/hooks`               | `@marktiderman/genesis-ui/hooks`       |
| `.../design-system`          | `@marktiderman/genesis-design-system`  |
| `.../design-system/tokens`   | `@marktiderman/genesis-design-system/tokens` |
| `.../design-system/theme`    | `@marktiderman/genesis-design-system/theme` |
| `.../switchboard`            | `@marktiderman/genesis-switchboard`    |
| `.../native`                 | `@marktiderman/genesis-ui-native`      |

Web bundlers never pull in React Native code unless a consumer explicitly
imports `@marktiderman/genesis/native` — `react-native` is an optional peer
dependency. Each granular package remains independently installable as an
escape hatch for rare subpaths not mirrored here.

## The Genesis version coordinate

`@marktiderman/genesis`'s own version is the single canonical coordinate for
the whole Genesis system — the one number that answers "which Genesis am I
on?" for a consuming repo. Pin one umbrella version and the entire set is
determined: the umbrella depends on `@marktiderman/genesis-{core,ui,
design-system,switchboard,ui-native}` via `workspace:*`, which pnpm replaces
with the **exact** published version at pack time. So `@marktiderman/genesis@X`
resolves one reproducible, pinned set — not a caret range that drifts. Each
granular package keeps its own independent semver train; the umbrella version
is the coordinate that names a specific combination of them.

The coordinate advances whenever any pinned sub-package is released, via
changesets' `updateInternalDependents` (default `"out-of-range"`): because the
umbrella pins each sub-package via `workspace:*` (which changesets resolves to
the dependency's **exact** current version), any sub-package release moves
that dependency out of the umbrella's pinned range, pulling the umbrella into
the same release plan.
