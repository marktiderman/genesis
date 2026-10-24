---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-web": minor
"@marktiderman/genesis-forms-builder": minor
---

Options carry more than a value and a label: `ChoiceOption` gains optional `description`,
`image` (an `https://` link) and `attributes` (`Record<string, string | string[]>`, for filters
and recall). `readOption` keeps each detail only when it is well formed and within
`OPTION_LIMITS`; `choiceOptions` and `withHostOptions` keep them, `parseForm` reports a
definition's malformed ones (`isHttpsUrl`, `optionJson` are exported too). Existing options and
`hostOptions` work unchanged.

genesis-forms-web shows an option's description as a muted line under its label and its image as
a small picture beside it. In genesis-forms-builder, `setOptions` keeps an option's details when
its label changes, and a host list's `sample` options show theirs in the preview.

Features: option-lists
