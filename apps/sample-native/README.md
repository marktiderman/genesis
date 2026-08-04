# Genesis Sample (Native)

Reference Expo app demonstrating @genesis/ui-native components, @genesis/design-system tokens, and @genesis/core hooks.

## Quick Start

```bash
pnpm install
# Build workspace packages first — sample-native resolves
# @marktiderman/genesis-* types through their built dist/, so on a fresh
# clone `typecheck` fails with TS2307 "Cannot find module" until this runs.
pnpm -r --filter './packages/*' build
pnpm --filter sample-native start
```

## Typecheck

```bash
pnpm --filter sample-native typecheck
```

Requires the workspace packages to be built first (see Quick Start). CI runs
this in the Lint workflow (`typecheck-sample-native` job).

## Screens

| Screen | What it demonstrates |
|--------|---------------------|
| Home | NativeText, NativeButton, NativeCard, NativeBadge |
| Components | All @genesis/ui-native components |
| Data | useResource hook with mock DataProvider, search, filter chips, pull-to-refresh |
| Forms | useResourceForm hook with Zod validation, create mode, inline error messages |
| Theme | Read-only view of active brand and token values (edit brand in _layout.tsx) |

## Packages Consumed

- `@genesis/core` — GenesisProvider, useResource, useResourceForm, mock DataProvider
- `@genesis/design-system` — tokens, GenesisThemeProvider
- `@genesis/ui-native` — React Native components
