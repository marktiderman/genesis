---
"@marktiderman/genesis-ui": minor
---

Print a calendar per person: `PrintableAgenda` prints one sheet per lane for a week (each lane's own events by day, every day listed, the app's `sections` under each week, a page break per sheet), and `PrintButton` opens the browser's print dialog and hides itself on the page. `lanes` is required and titles each sheet (a lane's key is an id, never a title); `headingLevel` sets the sheet's heading. Each event shows its start and end ("9:00 – 10:30 AM", in the locale's range form), "until 2:00 AM" on the last day of an overnight one, and the zone when the clock shows a time twice. No blank page after the last sheet. `PrintButtonProps` is exported. A calendar view prints these sheets from its own rows with `calendar={{ print: { sections } }}`, and AppShell leaves its navigation off printed pages and stops clipping the content to the screen. Messages `calendar.print` and `calendar.weekOf`.

Features: resource-view-calendar
