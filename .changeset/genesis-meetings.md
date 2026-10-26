---
"@marktiderman/genesis-supabase": minor
---

New migration `0012_genesis_meetings.sql` and the `meetings` block.
- **Meeting types** are reusable formats with an agenda.
- **Meetings** have a schedule and calendar event, the live step, a facilitator and scribe, notes, a recording and a transcript. Starting a meeting copies its type's agenda, so later edits to the type never change it.
- **Attendees** have presence and a 1-to-10 rating with a note. Each attendee rates only their own row.
- **Links** point to pre-work, worksheets and collaboration spaces.
- **`meeting_ratings`** averages the ratings.
- **`private.genesis_meeting_members(meeting)`** lists the attendees, for a collaboration audience.

Access goes through the same hooks as the pursuits block, and attendees can read the meetings they attend. A pgTAP test sits beside the migration.

Features: meetings
