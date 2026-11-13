---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-design-system": minor
---

Features: ui-twins
`@marktiderman/genesis-core/headless`: the behaviour genesis-ui's controls and their genesis-ui-native twins share, written once with no React and no DOM. `clampNumber`, `snapToStep`, `stepNumber`, `canStepNumber`, `parseNumberInput` ("1,5" reads as 1.5), `clampRange` and `rangeRatio`; `foldText`, `matchesQuery` and `filterOptions` (every word typed, ignoring case and accents); `moveItem`, `moveTarget`, `dropIndex` and `movedAnnouncement`; `parseTimeOfDay` ("2:30 pm", "14:30", "1430"), `formatTimeOfDay`, `timeToValue`, `timeOfDate`, `withTimeOfDay` and `timeSlots`; `chartSeriesColor`, `chartTokenOf`, `defaultChartToken`, `chartDomain`, `niceTicks`, `chartPosition` and `chartSummary` (what a screen reader hears for a chart); `sanitizeOtp`, `otpSlots`, `otpComplete` and the OTP patterns; `fieldArrayLimits`, `fieldArrayAddLabel`, `wizardStepFields`, `wizardProgressLabel`, `formatFileSize`, `fileAccepted`, `fileProblem` and `fieldAccept`; `formatTrend`, `STATUS_BADGE_TONES`, `statusBadgeLabel`, `stepState`, `notificationDayBucket`, `groupNotificationsByDay` and `customViewStatus`; `carouselIndex` and `carouselOffset`; and a month grid's days (`monthWeeks`, `dayOfDate`, `dateOfDay`, `dayInRange`, `pickRangeDay`, `weekdayDays`).

`@marktiderman/genesis-core/workspaces` adds `WORKSPACE_SWITCHER_SEARCH_THRESHOLD`, `DEFAULT_WORKSPACE_KIND_LABELS`, `hasWorkspaceBadge` and `workspaceBadgeLabel` (genesis-ui's WorkspaceSwitcher re-exports the first two, unchanged), and `filterWorkspaces` matches through `matchesQuery`, with the same results.

`@marktiderman/genesis-design-system/tokens` exports `nativeThemeLight` and `nativeThemeDark`, each scheme's colours as hex, for what a class can't reach on a phone (a chart's SVG strokes).
