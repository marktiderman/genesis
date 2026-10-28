---
"@marktiderman/genesis-ui": minor
---

ResourceView names records with the view's noun, so the count reads "1 goal" / "3 goals" and the form "New goal" / "Edit goal". Words override in steps: the resource name, the contract's `noun`, the view's `copy` (now with `form.createTitle`, `form.editTitle` and `count`), then the screen's props. New props: ResourcePage `noun`, `nounPlural`, `countFormat`, `formTitles`; ResourceForm `noun`; DataPageShell and PageHeader `entityNamePlural`, `countFormat`. New catalogue entries `page.countOne`, `page.countOther`, `page.countFiltered` and `form.*`. ResourceView passes each field's `nullable` and `hasDefault` to the form, and a `filter` value may be a list, sent as `in` and never used to start a new row.

A screen `noun` without `nounPlural` gets that noun's plural, and a screen's `formTitles` and `countFormat` replace only the entries they name, keeping the view's others.
