---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
---

Links are editable in view forms, with a picker. A `defineView` field with `references` is no longer read-only: forms edit it unless it's server-owned (generated, `@genesis readonly`, `permissions.update: false`) or the view marks it `readOnly`. Scope (tenant) links still never appear in a form, and a link the screen's `filter` pins is filled hidden on create and never sent on edit. A derived form now includes a link a new row can't do without (no default, never empty).

- **genesis-core:** `fields.<link>.link` (`view`, `preset`, `filter`, `searchFields`) narrows the picker to the linked view's scope, its default preset's filter and the link's own filter (fixed or from the form's values). Every resolved form field for a link carries `link` (`ResolvedLink`: `resource`, `field`, `labelField`, `searchFields`, `filters(scope, values)`). `useLinkOptions(target, { filters, search })` lists the linked rows through the provider, searched and paged on the server. `filterParams` and `relationNamingField` are exported; `ViewDefinitionError` moved to its own module (still exported from the same places). A `relation` form field accepts a number key and null, and its `relation.labelField` is optional (the provider's `describe` names the rows).
- **genesis-ui:** `RelationField` lists through `useLinkOptions`: nothing until it opens, server search, Show more, None for an optional link (saves null), the chosen row's words when it isn't loaded, and copy from the UI catalogue (`link.*`). ResourceView maps each link in a view's form to it.
- **genesis-ui-native:** the form sheet draws a writable link as `NativeLinkPicker` (`kind: "link"`): the list opens in place with search, None and Show more. `formFieldsFor(view, mode, { pinned })` keeps links the screen's filter pins read-only. The messages catalogue gains an optional `link` block.

Features: resource-view-links
