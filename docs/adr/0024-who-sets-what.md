# ADR 0024: Who sets what

- Status: proposed
- Date: 2026-11-13
- Features: `appearance-preferences`, `org-brands`
- Related: ADR 0018 (app brands, styles and themes), ADR 0004 (workspaces), ADR 0003
  (navigation zones), docs/GLOSSARY.md ("Look and feel")

## Context

ADR 0018 splits the look into a brand, a style and a theme. It leaves open who chooses each one.
In Genesis today every preference lives in one device's browser: AppShell's options and its
light/dark toggle in local storage, `GenesisThemeProvider`'s mode in component state. A person
who picks dark on a laptop gets light on their phone. An organization can set one accent colour
(`WorkspaceTheme.accent`) and nothing else. A theme sets density, which is a person's choice.

## Decision

1. **Three owners.** A person sets their **appearance** (light, dark or system) and **density**
   (compact, comfortable, spacious). An organization sets its **brand**. The app sets the **theme**
   per area of the app (a zone, ADR 0003). An app can lock any of the person's values.
2. **One order**, value by value, written as `resolveAppearancePreferences`:

   `app lock > person > organization default > theme default > Genesis default`

   A value that isn't a known appearance or density is skipped, so a bad stored value falls
   through to the next layer.
3. **The person's choice follows them.** `defineAppearancePreferences` names a store: an adapter
   (`read`, `write`, optional `subscribe`) the app backs with its own server table, since Genesis
   has no profile table of its own. The device keeps a copy (`useStorage()`), which is the
   fallback when there is no store and fills in until the store answers.
   `AppearancePreferencesProvider` serves it, with the organization's and theme's defaults.
4. **Readers, not new owners.** genesis-ui's `AppearanceProvider` is `GenesisThemeProvider` fed
   from the preferences, saving `setMode` there (`GenesisThemeProvider` gains `onModeSelect` for
   it). `AppShell` reads density and drives its toggle through them. Without a provider, both work
   exactly as before.
5. **An organization's brand.** `WorkspaceTheme` gains `brand`, an app brand's id, and
   `defaults`, the organization's appearance and density. `resolveWorkspaceBrand` returns the brand
   that applies in the active workspace, checked against the brands the app ships; the app sets
   it on `<html>` (`data-app-brand`) while the workspace is open, as ADR 0018 says for portalled
   menus.
6. **A brand carries its name and images.** `AppBrandInput` gains `appName`, `logo` and `mark`
   (each image with alt text and a dark version), checked like the rest of a brand;
   `appShellBrandProps` gives AppShell its `appName` and `logo` from one.

## Glossary

- **appearance**: light, dark or system, the person's (`AppearanceProvider`,
  `GenesisThemeProvider`, the `Appearance` type). The props keep their `mode` names.
- **density**: compact, comfortable or spacious, the person's; a theme sets the default.
- **lock**: a value the app fixes, which no one below can change.

## Alternatives

- **Genesis stores preferences in its own table.** Genesis has no user table; every app already
  has one. An adapter keeps the data where the app's row security is.
- **Rename `GenesisThemeProvider` and `ThemeMode`.** They are published; the glossary's words come
  as an alias (`AppearanceProvider`) and type aliases (`Appearance`), not renames.
- **The organization's brand as more colour fields on `WorkspaceTheme`.** That is a second brand
  shape; naming an app brand by id keeps one.

## Consequences

- core's `Density` names the same three words as design-system's `DENSITY_LEVELS` (core can't
  import design-system, a layer beside it); AppShell draws all three.
- A store's read is asynchronous, so a person's server-kept choice can arrive after first paint;
  the device's copy covers repeat visits.
- Native reads the same contract (`AppearancePreferencesProvider` is platform-neutral, and the
  device copy uses the storage adapter); the native `GenesisThemeProvider` has `onModeSelect` too.
  A native `AppearanceProvider` twin is planned.
