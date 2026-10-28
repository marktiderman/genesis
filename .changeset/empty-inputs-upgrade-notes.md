---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
---

Upgrading: ResourceView and NativeResourceView turn on the form's empty-input handling by themselves, from each field's `nullable` and `hasDefault` in the contract. Before upgrading, (a) regenerate contracts with this release's `genesis introspect`: contracts from an older CLI mark every view column `nullable: true`, so an edit that empties a view's NOT NULL text column would send null; and (b) give defaults to the parameters of any function a `create` rule calls with the whole row as named arguments, since a create now leaves out the keys of inputs left empty.
