---
"@marktiderman/genesis-core": minor
---

Form fields can say which keyboard and autofill a phone should offer.

- `FieldType` gains `tel` (a phone number, stored as text). It is also a contract's `widget`, so declare `widget: "tel"` on a phone column. **If you keep an exhaustive `Record<FieldType, …>` (or a `switch` with an exhaustive check), add a `tel` entry**, or it stops type-checking.
- `ResourceFormFieldDef` gains `autoComplete`, `inputMode` and `enterKeyHint`. None of them is set for you except `inputMode` from the type; autofill is never a type default.
- A view field takes `autoComplete` (`fields: { email: { autoComplete: "email" } }`), and `view.form()` carries it. Set it only on forms about the viewer: on a form about someone else, autofill fills in the person at the keyboard.
- `blankValues` treats an emptied `tel` input like any text input: a column that can't be null keeps `""`.
