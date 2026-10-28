---
"@marktiderman/genesis-core": minor
---

The Supabase provider reads and writes resources named `schema.table` (as generated contracts name them): `public` through `client.from(table)`, any other schema through `client.schema(name).from(table)`. Bare names still mean `public`, and a client without `schema()` gets the name as given. Per-resource config, `binTables` and `realtime` lists match either spelling. `useResourceForm` sends an input left empty as no value: left out of a create (so the column's default applies) and null on an edit; only a text field that isn't `nullable` keeps `""`. `ResourceFormFieldDef` gains `nullable` and `hasDefault`, and `ViewCopy` gains `form` (create and edit titles) and `count` (the count's words).
