---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
---

ResourceWorkspace: one record's screen from a view.

- `genesis-core/resource-view`: `defineWorkspace(view, { header?: { actions? }, sections, readiness? })`. A section is a child list (`list: { view, filter(row) }`), a few settings (`settings: [...]`, each in `view.writable("edit")`) or a slot the screen fills by `id`. Checked at start-up and frozen; a bad settings field, an unknown header action, a repeated id or a nested workspace throws `ViewDefinitionError`. Pure helpers: `headerFor(row)`, `settingsFields(id?)`, `settingsPatch(id, values)`, `listFilter(id, row)`, `readinessFor(row)` (chip tones only), `readinessSummary(row)`, and `isWorkspace`. `readinessOf`, `readinessChip` (and its labels) and `ChipTone` move into core; genesis-ui re-exports them unchanged.
- `genesis-ui`: `<ResourceWorkspace>` puts the header into `AppShellPageHeader` through `ResourceHeader`, registers the sections with `useAppShellSubNav`, draws list sections as embedded `ResourceView`, settings as `SettingsRow` and `ToggleRow` (saving only the section's keys, a zero-row save shown inline as a refusal), and readiness as the `ReadinessChip`. `ResourceHeader` gains a `leading` slot, used for the workspace's `switcher`.
- `genesis-ui-native`: `<NativeResourceWorkspace>` and `getNativeResourceWorkspaceStackOptions` (title in the navigation bar, actions in the header menu): up to four sections as a segmented control and more as pushed rows, list sections as embedded `NativeResourceView` (its `filter` is the row's `listFilter`), settings as inset grouped rows, readiness as the same summary chip as the web, and a `switcher` slot.
