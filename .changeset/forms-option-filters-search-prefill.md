---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-react": minor
"@marktiderman/genesis-forms-web": minor
"@marktiderman/genesis-forms-builder": minor
---

Lists filtered by another answer, search for long lists, and preselecting from a link. Every
decision lives in genesis-forms, pure, so web and native renderers, the engine and the server
agree.

- **Filtered lists:** `props.optionsFrom.filter: { attribute, field }` shows only the options
  whose attribute matches an earlier question's answer (`visibleOptions`, `optionMatches`,
  `answersOnPath`). The engine clears a pick that stops matching (`clearFilteredAnswers`), and the
  engine and `validateSubmission` refuse one outside the filter (`filteredChoiceError`).
  `parseForm` checks the question it reads exists and comes earlier.
- **Search:** `isSearchable(field, count)` (more than `SEARCHABLE_OPTION_COUNT`, 10, unless
  `props.searchable` says) and `searchOptions(options, query)`. genesis-forms-web draws such a
  question as an in-page searchable list (genesis-ui `Command`), in classic and focus layouts.
- **Link prefill:** `props.prefill: { param, hideWhenPrefilled? }`, `createForm`'s `linkParams`
  and `<Form linkParams>` preselect an option from `?param=value` when it is offered
  (`prefillFromLink`); with `hideWhenPrefilled` the engine steps over it (`hiddenByPrefill`,
  `respondentPath`) and still stores the answer, which the server checks like any other.
- genesis-forms-react: `useChoiceOptions(engine, id)` and `useRespondentPath(engine)`.
- genesis-forms-builder: "Only show options matching" under a list from the app
  (`setOptionsFilter`, `HostOptionList.attributes`, `hostListAttributes`), and per choice
  question a Search box setting and "Fill in from the link" (`setPrefill`). Renaming, moving or
  removing the question a filter reads keeps the definition valid.

Features: option-lists
