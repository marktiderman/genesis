---
"@marktiderman/genesis-forms-builder": minor
---

`<OptionListEditor list onChange>` edits a named option list a host keeps (rename; add, remove and
reorder options; each one's label, description, picture and attributes; CSV paste or file import
with a preview; CSV export). The pure pieces are in `ops` too: `parseOptionListCsv` (flags
duplicates, blank rows, over-long values and bad image links), `mergeOptions` (upsert by value),
`optionListCsv`, `parseCsvRows`, `slugOptionValue`, `hostOptionsOf` and the `OptionList` type.
Persistence stays with the host.

Features: option-lists
