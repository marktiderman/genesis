---
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-core": minor
---

Record and display additions, all opt-in except the fixes marked below.

- `RecordView` takes `sectionIcons` (an icon per section id for the shell's tab row and the phone's bottom bar) and `settingsLocked(sectionId, row)` (a screen's own reason to make a settings section read-only; it only narrows the view's update guard).
- `ResourceHeader` takes `chips` (more chips after the status) and `subtitle` (a muted line under the title).
- Relative times have one wording, `relativeTime` (exported from `@marktiderman/genesis-ui/utils` and `/data`): "just now", "3 min ago", "2 hours ago", "yesterday", "in 5 min", then the date past a week, with days counted on the viewer's calendar, and a `style: "compact"` for dense lists ("now", "5m", the clock time, "Yesterday", the weekday, "12 Mar"). Its words are the catalogue's `time` group, and hours, days and dates are formatted in `time.locale`, so a translation gets its own language. Opt in with `relativeDatetimeRenderer` (and the `RelativeTime` component, which reads the messages in effect and shares one clock across the page) under `DisplayRenderersProvider` (`renderers={{ datetime: relativeDatetimeRenderer }}`), `formatRelativeTime(date, { style: "short", words })` or `DateCell({ relative: "short", words })`. The defaults keep date-fns' wording; switching the default is planned for 3.0. New messages: `time.locale`, `time.justNow`, `time.minutesAgo`, `time.inMinutes`, `time.now`, `time.minutesShort`, `time.yesterday`.
- `UserAvatar` takes `distinct`: a stable chart-colour wash per name behind foreground text (14:1 or better in light and dark), and two letters for a one-word name ("Pr", "Po") so names that share an initial differ. The letters come from genesis-core's `initialsOf`, which takes `{ distinct: true }` for the same.

Fixes, which change what existing screens show:

- `RecordView` now passes every summary chip after the first, and the summary's `subtitle`, to its header. It used to drop them.
- `RecordView` settings send only the fields the person edited. The other fields follow the live row, so a stale draft can't overwrite someone else's change, and an edit back to the stored value (2 and "2", null and "") isn't a change.
- A settings field with options that can be empty, and that the view doesn't require, gets a "None" choice that sets it back to empty (the catalogue's `link.none`, the same words and value as the link picker's). Before, a value once chosen couldn't be cleared.
- `Textarea` wraps a long unbroken run (`overflow-wrap: anywhere`). Before, a long URL or a pasted token set the textarea's minimum width, which pushed a dialog wider than the screen.
