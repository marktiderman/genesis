---
"@marktiderman/genesis-cli": minor
---

genesis.config.json takes `preset` (`max`, `standard` or `min`) and `settings` (`"namespace.key":
value`, or `{ "value": …, "locked": true }`), checked strictly when the config is read. The doctor's
new `invalid-setting` rule checks them against the settings the installed Genesis packages declare
(package.json `genesis.settings`): an unknown key or a value that doesn't fit is an error, a key on
while one it requires is off is a warning, and a package declaration that can't be used is an error. It reads every Genesis package
installed, transitive ones too. `genesis-config-unknown-key` (warn) flags a top-level key in
genesis.config.json that nothing reads, naming the one probably meant.
