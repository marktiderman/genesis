---
"@marktiderman/genesis-ui": minor
---

Record and display additions, all opt-in except the fixes marked below.

- `RecordView` takes `sectionIcons` (an icon per section id for the shell's tab row and the phone's bottom bar) and `settingsLocked(sectionId, row)` (a screen's own reason to make a settings section read-only; it only narrows the view's update guard).
- `ResourceHeader` takes `chips` (more chips after the status) and `subtitle` (a muted line under the title).
- Relative times have one wording, `relativeTime` (exported from `@marktiderman/genesis-ui/utils` and `/data`): "just now", "3 min ago", "2 hours ago", "yesterday", "in 5 min", then the date past a week, with days counted on the viewer's calendar. Opt in with `relativeDatetimeRenderer` (and the `RelativeTime` component) under `DisplayRenderersProvider` (`renderers={{ datetime: relativeDatetimeRenderer }}`), `formatRelativeTime(date, { style: "short" })` or `DateCell({ relative: "short" })`. The defaults keep date-fns' wording; switching the default is planned for 3.0. New messages: `time.justNow`, `time.minutesAgo`, `time.inMinutes`.
- `UserAvatar` takes `distinct`: a stable tint per name on the initials fallback, and two letters for a one-word name ("Pr", "Po") so names that share an initial differ.

Fixes, which change what existing screens show:

- `RecordView` now passes every summary chip after the first, and the summary's `subtitle`, to its header. It used to drop them.
- `RecordView` settings send only the fields the person edited. The other fields follow the live row, so a stale draft can't overwrite someone else's change, and an edit back to the stored value (2 and "2", null and "") isn't a change.
- A nullable settings field with options gets a "None" choice that sets it back to empty (new message `common.none`). Before, a value once chosen couldn't be cleared.
- `Textarea` wraps a long unbroken run (`overflow-wrap: anywhere`). Before, a long URL or a pasted token set the textarea's minimum width, which pushed a dialog wider than the screen.
