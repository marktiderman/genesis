---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
"@marktiderman/genesis-ui-native": minor
---

- **Relation labels:** a link cell (`relation` hint) shows the linked row's words instead of its id, on web and native, including native's read-only link in the form sheet. The ids on a page go out as one `in` query per linked resource, never one per cell.
- **`ViewField.labelField`:** names the linked row's field to show. Default: the linked resource's `labelField` (`describe`), else a `name`/`title`-like field. `defineView` refuses it on a field that isn't a link.
- **A link never shows its raw id:** a linked row the viewer can't see, one that's gone, or a failed read shows `ViewField.missingLabel`, else the new catalogue word `common.hiddenLink` ("Not available") on web and native.
- **`useRelationLabel(reference, id, { labelField })`** and `loadRelationLabel` in genesis-core, for any screen that shows a link: `undefined` while loading, `null` when there are no words.
