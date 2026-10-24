---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-builder": minor
"@marktiderman/genesis-forms-web": minor
"@marktiderman/genesis-forms-studio": minor
---

An "Other" answer on choice questions: `props.other: true` (or `{ label }`) adds an Other option with a text box to a single choice, multiple choice or dropdown question. The typed text is the answer (one more item on a multiple choice), checked on the server (blank or over 200 characters is refused, and so is text on a question without Other). The builder has an "Allow an Other answer" switch, and response summaries count typed answers together under Other.
