---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-design-system": minor
---

Features: ui-twins
`@marktiderman/genesis-core/headless`: the behaviour genesis-ui's controls and their genesis-ui-native twins share, written once with no React and no DOM. `clampNumber`, `snapToStep`, `stepNumber`, `canStepNumber`, `parseNumberInput` ("1,5" reads as 1.5 and "1,234" as 1234; pass `locale` to read a locale's own marks, as strictly: a group mark only between whole groups, one decimal mark), `readNumberDraft` (whether a number being typed is ready to pass on), `commitNumberDraft` (what's typed, rounded to the precision and clamped) and `clampRange`; `matchesQuery` and `filterOptions` (every word typed, ignoring case and Latin accents); `moveItem`, `dropIndex` and `movedAnnouncement`; `parseTimeOfDay` ("2:30 pm", "14:30", "1430"), `formatTimeOfDay`, `timeToValue`, `timeOfDate`, `withTimeOfDay` and `timeSlots`; `chartSeriesColor`, `chartTokenOf`, `defaultChartToken`, `chartDomain` (a stack's positive and negative values apart), `chartPosition` and `chartSummary` (what a screen reader hears for a chart); `OTP_PATTERN_DIGITS`, `stripOtpSeparators`, `sanitizeOtp` (the pattern tested against the whole code, as input-otp does), `otpSlots` and `otpComplete`; `fieldArrayLimits`, `fieldArrayAddLabel`, `wizardStepFields`, `wizardProgressLabel`, `formatFileSize`, `fileProblem` and `fieldAccept`; `formatTrend`, `STATUS_BADGE_TONES`, `statusBadgeLabel`, `stepState`, `NOTIFICATION_DAY_BUCKETS`, `notificationDayBucket`, `groupNotificationsByDay` (Upcoming, Today, Yesterday and Earlier, counted on a given `now` and `timeZone`) and `customViewStatus`; `carouselIndex` and `carouselOffset`; and a month grid's days (`monthWeeks`, `dayOfDate`, `dateOfDay`, `dayInRange`, `pickRangeDay`, `weekdayDays`; weeks start on Monday by default, as genesis-core's dates do).

A repeating group's field takes `arrayItemLabel`, its one item's name for the add button ("Add Person").

`@marktiderman/genesis-core/workspaces` adds `WORKSPACE_SWITCHER_SEARCH_THRESHOLD`, `DEFAULT_WORKSPACE_KIND_LABELS`, `hasWorkspaceBadge` and `workspaceBadgeLabel` (genesis-ui's WorkspaceSwitcher re-exports the first two, unchanged), and `filterWorkspaces` matches through `matchesQuery`, with the same results.

`@marktiderman/genesis-design-system/tokens` exports `nativeThemeLight` and `nativeThemeDark`, each scheme's colours as hex, for what a class can't reach on a phone (a chart's SVG strokes).
