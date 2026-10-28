---
"@marktiderman/genesis-core": minor
---

The Supabase provider reads and writes resources named `schema.table` (as generated contracts name them): `public` through `client.from(table)`, any other schema through `client.schema(name).from(table)`. The name splits on the first dot outside double quotes (`"my.s"."we.ird"`); a bare name still means `public`. A client without `schema()` gets the name as given for other schemas, but a `public.x` resource now reaches it as `from("x")` (it used to get `from("public.x")`). A `public` resource's config, `binTables` and `realtime` match either spelling: the key spelled as the caller names the resource wins, the other is used only when it's absent, and a `binTables` or `realtime` test is asked with the bare name, then `public.name`.

`defineView` makes plurals that invert its singulars (entry → entries, person → people) instead of adding "s", and with only a derived noun takes the contract's label as the plural when it reads as one ("People"). `ViewCopy` gains `form` (create and edit titles) and `count` (the count's words). `plural` and `singular` are exported from `genesis-core/resource-view`.
