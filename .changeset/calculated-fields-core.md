---
"@marktiderman/genesis-forms": minor
---

A `calculated` field type: a value worked out from other answers and shown read-only, such as a total or a score. Its props are `{ formula, format?: "number" | "percent" | "text", decimals? }`. The formula language is small and parsed here, never evaluated as code: answer keys (`hours`), one table column (`plan.cost`), numbers, text in quotes, `+ - * /` (also `− × ÷`), parentheses, comparisons (`== != < <= > >=`, also `= ≠ ≤ ≥`), `test ? a : b`, and `sum`, `avg`, `min`, `max` over numbers, lists and table columns. A blank answer makes arithmetic blank, so a total stays empty until its answers are in; `sum` skips blanks.

The engine works the values out from the answers on the path, again whenever an answer a formula reads changes, and stores them with the answers, so a submission carries them. A replay (and so `validateSubmission`) and prefilled answers work them out once before each step, not once per event, so a large submission stays fast. A list or table of more than `MAX_FORMULA_ITEMS` (10,000) items reads as blank in a formula, and a number literal too large to hold is a parse error. Nesting is counted per parenthesis, call, sign or `? :`, up to 64 levels. `setValue` on a calculated field does nothing, and `validateSubmission` works the values out itself and ignores the client's. A calculated field is never required. Logic may compare a calculated value.

`parseForm` checks the formula: it must parse, every key must be a question of the form, a table must be read by one of its columns, and a calculated field may only read calculated fields before it. Each problem is an issue on `props.formula` with the character it is at. `format` and `decimals` are checked too, and `required: true` is a warning.

New exports: `parseFormula`, `evaluateFormula`, `formulaRefs`, `renameFormulaKey`, `formulaNumber`, `FORMULA_FUNCTIONS`, `MAX_FORMULA_LENGTH`, `calculatedProps`, `calculatedValue`, `formatCalculated`, `formulaInput`, `MAX_FORMULA_ITEMS`, `CALCULATED_TYPE`, `COMPUTED_FIELD_TYPES`, `MAX_CALCULATED_DECIMALS` and their types, and `f.calculated` for `defineForm`.
