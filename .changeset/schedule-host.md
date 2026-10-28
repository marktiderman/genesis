---
"@marktiderman/genesis-sites": minor
---

The `schedule` section's sessions take `host` (shown as "with …"). `coach` is still accepted and still rendered when `host` is left out, but it is deprecated: the editor no longer shows it, and the section is now version 2, whose migration moves a session's `coach` into `host` (when `host` is empty) on read, in the editor and on publish. A node saved at version 2 can't be read by an older genesis-sites, which reports it as newer.

The editor hides any prop marked `.meta({ deprecated: true })`, and opens a node at its section's current version (the section's migrations run first), so an edit saves today's fields.

Behaviour change: the default `emptyText` is "Nothing scheduled" (was "No classes"); a site that set its own keeps it.

Features: sites-sections
