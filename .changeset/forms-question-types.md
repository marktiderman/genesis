---
"@marktiderman/genesis-forms": minor
---

Four new field types, and end labels and stars for ratings.

- `dropdown` (`f.dropdown(key, { options })`): one option from a compact menu. Validated, summarized and compared like single choice.
- `number` (`f.number(key, { min, max, step })`): a number within optional limits, on an optional step counted from `min` (else 0). Supports `lt`/`gt` logic. `numberLimits(field)`.
- `date` (`f.date(key, { min, max })`): a real calendar day stored as `YYYY-MM-DD`, within optional limits. `isIsoDate`, `dateLimits(field)`.
- `consent` (`f.consent(key, { text })`): one checkbox. Checked stores `true`; unchecked is unanswered, so a required consent must be checked. Summarized as "Agreed".
- `rating` takes `lowLabel`, `highLabel` and `display: "numbers" | "stars"`; `nps` takes the labels. `summarizeValue` adds an end's label (`"5/5 (Great)"`). `scaleLabels(field)`, `ratingDisplay(field)`.

`parseForm` checks the new props (numbers for number limits, a step above 0, real dates, min not above max, a known rating display, text labels), warns when logic compares a dropdown with a value that is not an option, and `coverage()` finds valid answers for every new type. `validateSubmission` and `publicDefinition` handle them like the other built-in types.

Later, not in this release: time, a grid of rows by columns, file upload and ranking.

Features: forms-engine
