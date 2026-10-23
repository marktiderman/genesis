---
"@marktiderman/genesis-forms-studio": patch
---

Review fixes. `summarizeResponses` counts a rating in one pass (no spread of every answer, which overflowed the stack near 120,000 answers) and keeps the newest version's scale: answers given on an older version's different scale are moved onto it in proportion (`ScaleSummary.rescaled`), answers outside their own scale are left out (`excluded`), and the question card says so. A rating's `max` is read as 1–100. `formAvailability` keeps a form closed when its opening or closing time doesn't parse or has no `Z` or offset (`parseInstant`). `prefilledUrl` keeps a relative link relative instead of throwing. The Low ratings headline honours `skip`, like `needsFollowUp` (`hasLowRatingExcept`). `FollowUpList`'s score has an accessible name.
