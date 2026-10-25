---
"@marktiderman/genesis-forms-react": patch
---

`useFormDraft`: autosave now starts listening before the form is painted. An answer given between the form appearing and a passive effect running was not saved until the next change (seen with async storage, as on React Native).
