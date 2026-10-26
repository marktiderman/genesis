---
"@marktiderman/genesis-ui": minor
---

Resource workspace components: the page around one publishable thing (a form, a course, a lesson, a worksheet), moved up from genesis-forms-studio. `ResourceHeader`, `ReadinessChip`, `ResponsesToolbar`, `HeadlineNumbers`, `SummaryCard`, `FollowUpList`, `ResourceSettingsPage`, `SettingsSection`, `ShareDialog` and `Chip`, with the pure `readinessOf`, `readinessChip`, `dayLabel`, `SAVE_STATE_LABEL`, `prefilledUrl` and `embedSnippet` and their types. Import from `@marktiderman/genesis-ui/resource` (or the root); the pure rules are also at `/resource/rules`, safe on a server.

The defaults are resource-neutral: `ShareDialog` says "Share your page" and "Anyone with the link can open it." unless given a `noun` and `description`; an empty `ReadinessChip` says "Nothing to publish yet" (`labels` renames any state); `readinessOf` treats a finding as "empty" only with `emptyCode`. `ResponsesToolbar` takes `labels` and `FollowUpList` takes `noComment`. The settings section type is `ResourceSettingsSection`, since `SettingsPageSection` already names the layout `SettingsPage`'s.

Features: resource-workspace
