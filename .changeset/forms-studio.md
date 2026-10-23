---
"@marktiderman/genesis-forms-studio": patch
---

New package: the workspace around a form builder. `ResourceHeader` (breadcrumb, title once, status and save-state chips, undo and redo, Preview, Share, Publish), `formNavItems` and `ReadinessChip` for the page's child navigation (genesis-ui's `useAppShellSubNav` and `AppShellSubNavEnd`), the Responses tab (`ResponsesToolbar`, `ResponsesFilters`, `HeadlineNumbers` with `headlineNumbers`/`headlineCards`, `QuestionSummaryCards`, `FollowUpList` with `needsFollowUp`), the Settings layout (`ResourceSettingsPage`, `SettingsSection` around genesis-ui `SettingsRow`/`ToggleRow`) and `ShareDialog`. The pure rules (`summarizeResponses`, filters and presets, `answerColumns`/`toCsv`, `formAvailability`, `prefilledUrl`/`embedSnippet`) are also at `@marktiderman/genesis-forms-studio/rules`. Moved up from Breakthrough. The pieces in `src/generic/` aren't about forms and are meant to move to genesis-ui later.
