---
"@marktiderman/genesis-supabase": minor
---

New migration `0012_genesis_sessions.sql` and the `sessions` block, for sessions of any kind: a meeting, workshop, presentation, coaching call, one-on-one, class or planning day.
- **Session types** are reusable formats with a kind and an agenda.
- **Sessions** have a kind, a schedule and calendar event, the live step, a facilitator and scribe, notes, a recording and a transcript. Starting a session copies its type's agenda, so later edits to the type never change it.
- **Attendees** have presence and a 1-to-10 rating with a note. Each attendee rates only their own row.
- **Links** point to pre-work, worksheets and collaboration spaces.
- **`session_ratings`** averages the ratings.
- **`private.genesis_session_members(session)`** lists the attendees, for a collaboration audience.

Access uses the pursuits block's owner-access contract, and attendees can read the sessions they attend. A pgTAP test sits beside the migration.

Features: sessions
