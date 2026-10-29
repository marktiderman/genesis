---
"@marktiderman/genesis-sites": minor
---

The core is neutral: no section, preset, default, example or doc names an industry. The team presets show a person and their role, the timetable's presets a session and its host, and the timetable reads "sessions" where it said "classes" (its table caption, the type legend's name "Session types", the phone day picker's legend). `exampleBrands` are now "Riverside Works" and "Hilltop Collective". Industry flavour moves to a new `/templates` entry: `industryTemplates` and a first `fitness` template, plain data on the sections' own preset shape (presets per section, a sample brand and message), with no code paths. Stored timetables are unchanged: the older host key still renders and still moves into `host`.
