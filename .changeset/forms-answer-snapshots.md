---
"@marktiderman/genesis-forms": minor
---

Answer snapshots for options from the app: `answerSnapshots(definition, answers)` pairs each
answer with its label as of now (`{ value, label }`, or a list), so a host stores the id for
reports and the name for history; `answersFromSnapshots(definition, snapshots)` finds each pick
again for an edit link (by value, else by label) and reports what is gone in `missing`. Exported
from `@marktiderman/genesis-forms/server` (with `withHostOptions`) and the main entry.

Features: option-lists
