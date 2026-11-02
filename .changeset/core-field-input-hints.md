---
"@marktiderman/genesis-core": minor
---

Form fields can say which keyboard and autofill a phone should offer.

- `FieldType` gains `tel` (a phone number, stored as text). It is also a contract's `widget`, so declare `widget: "tel"` on a phone column. **If you keep an exhaustive `Record<FieldType, …>` (or a `switch` with an exhaustive check), add a `tel` entry**, or it stops type-checking.
- `ResourceFormFieldDef` gains `autoComplete`, `inputMode` and `enterKeyHint`. None of them is set for you except `inputMode` from the type; autofill is never a type default.
- A view field takes `autoComplete` (`fields: { email: { autoComplete: "email" } }`), `inputMode` and `enterKeyHint`, and `view.form()` carries them. Unset, no token is set, which leaves the browser to its own heuristics (it may still autofill); set a token on forms about the viewer, and `"off"` on a form about someone else, where autofill would fill in the person at the keyboard.
- `blankValues` treats an emptied `tel` input like any text input: a column that can't be null keeps `""`.
