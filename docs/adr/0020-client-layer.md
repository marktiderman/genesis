# ADR 0020: The app client layer

- Status: accepted (2026-11-13)
- Date: 2026-11-13
- Features: `client-layer`, `cli-doctor`, `view-filters`, `saved-views`
- Related: ADR 0013 (the customization layer), ADR 0017 (lists v-next), ADR 0019 (custom views),
  ADR 0021 (view types and record pages), docs/FRAMEWORK.md (G2), docs/RESOURCE-VIEW.md

## Context

An app built on Genesis configures a lot that every list and record page shares: its
`ResourceViewDefaultsProvider` (phone mode, column sizing, the saved-view store, the router's URL
adapter, row actions), its own cells, its own record-page parts and the view types it registers.
With ADR 0017 that set grows: a `SavedViewStore` over the app's own table, a router adapter, row
actions switched on. Today each app puts these wherever its first screen needed them. Two things
follow:

- Screens render Genesis's `<ResourceView>` and `<RecordView>` directly, each passing the app's
  defaults again (a `cells` map, `createdToast`, a `slotProps` tweak), so an app-wide change is an
  edit on every screen.
- A resource gets a second `defineView` beside its first, for one screen's columns or filter,
  instead of the screen narrowing the one view with `preset`, `filter` or `columns`. The two views'
  rules (guards, words, tones) drift.

A consumer app's discussion proposed one folder for "the app's surface over Genesis". Its idea of
a "surface" (a screen an app draws itself over a view) became ADR 0019's custom view; this ADR
takes the rest: where the app's own layer over Genesis lives, and what the doctor says about it.

`pnpm features find layer` and `find wrapper` find `ResourceViewDefaultsProvider` (the defaults
themselves, which stay) and the genesis-ui extending guide (EXTENDING.md, rung 4: an app's wrapper
around a Genesis part). Neither says where those pieces live or keeps screens on them. This is
G2 (extend: the app's own wrapper around the Genesis piece), at ADR 0013's Compose and Adapt
levels, given one home.

## Decision

1. **One folder, `src/client/`**, the app's client layer. `genesis.config.json` `client.dir`
   names another folder (`{ "client": { "dir": "app/layer" } }`). It holds:
   - `client-layer.tsx`: the provider an app mounts once (inside `GenesisProvider`), with its list
     defaults, its `SavedViewStore` and its router's URL adapter (`ResourceViewDefaultsProvider`).
   - `resource-view.tsx`: the app's `ResourceView`, Genesis's with the app's defaults. Screens
     render this one.
   - `record-view.tsx`: the app's `RecordView`, Genesis's record page with the app's defaults.
     Screens render this one.
   - `<type>/contract.ts`: the scaffold's starting contract, so the view works the day it is
     written; the app swaps in its generated contract.
   - `<type>/view.ts`: one view per resource, its `defineView`. Platform-neutral (ADR 0009), so a
     phone screen imports the same file.
   - `<type>/appearance.tsx`: how that type looks: its own cells, its card and its record page.
   - `cells/`: cells shared by several types; `components/`: the app's own parts (named `app-*`,
     ADR 0018); `view-types/`: the view types it registers (ADR 0021).
2. **A scaffold.** `genesis client init [--folder <dir>] [--type <name>]` writes those files
   (keeping any that exist unless `--force`) and, for another folder, names it in
   genesis.config.json. The folder must be one the config accepts (relative, inside the app, `/`
   between plain names, no `.`, `..`, spaces or backslashes), and it is written normalized. Moving
   a layer the config already names takes `--force`.
3. **Two doctor rules** (genesis-cli built-ins, warn, and only once the app has a layer: a
   `resource-view.tsx` in the folder):
   - `client/layer`: a screen outside the layer renders Genesis's `<ResourceView>` or
     `<RecordView>` directly; render the layer's (`<RecordView>` is reported once the layer has
     `record-view.tsx`).
   - `client/one-view-per-resource`: a second `defineView` over the same contract; keep one view
     per resource and narrow it on the screen. A contract is told apart by where it comes from
     (the module and name it is imported as, plus a `["…"]` key), not by its spelling; stories and
     tests are left out.
4. **What stays in Genesis.** The layer holds configuration and the app's own drawing (G2, G3);
   it never copies a Genesis component (ADR 0013, rule 3). A part the layer grows that more than
   one app wants is promoted (G4) and the app deletes its copy.

All in genesis-cli (the scaffold, the config block and the rules) and docs. The layer's files are
the app's; Genesis ships no code that runs in them.

## Glossary

- **client layer**: an app's own layer over Genesis, in one folder (`src/client/`): its provider and
  defaults, its ResourceView wrapper, one view per resource with its appearance, its cells, parts
  and registered view types. Don't use: surface (a custom view, ADR 0019), app shell (the
  navigation frame), wrapper folder.

## Alternatives

- **Leave it to each app.** The duplication this removes: defaults repeated per screen, second
  views per resource, and no place a doctor rule can point to.
- **A Genesis-made provider that bundles the defaults** (`<GenesisClient store url>`): it would be
  one more component beside `ResourceViewDefaultsProvider` doing the same job (G5). The app's
  `client-layer.tsx` composes the existing provider instead.
- **Fail rather than warn.** The rules steer existing screens over; an app moves screen by screen
  (`doctor.ratchet` holds new code to them meanwhile).

## Consequences

- Apps get one place for their list defaults, saved-view store and URL adapter, and the doctor
  points screens at it.
- An app without a layer sees no new findings.
- The layer's record-page wrapper (`record-view.tsx`) ships beside `resource-view.tsx`; it passes
  Genesis's `RecordView` through until the app sets its own defaults there.
