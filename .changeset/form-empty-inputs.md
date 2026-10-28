---
"@marktiderman/genesis-core": minor
---

Behaviour change in `useResourceForm`: an input left empty (`""`) is no value, for fields whose column the form knows about. `ResourceFormFieldDef` gains `nullable` and `hasDefault` (ResourceView fills them from the contract). For such a field, a create leaves an empty input out, so the column's default applies (for example `created_by default auth.uid()`), and an edit sends null when the person emptied it. A text field that isn't nullable keeps `""` (on a create, only without a default), and a value the screen started the field at (a `filter` or `defaults` value) is kept. A field without `nullable`, and an edit of a field nobody touched, send exactly what they did before. A `create` rule that forwards every value as named function arguments no longer receives the left-out keys. `blankValues` is exported for custom forms.
