---
"@marktiderman/genesis-cli": minor
---

Local packages: list an app's own workspace packages in genesis.config.json `localPackages` (`["packages/*"]`) and Genesis treats them like its own. They declare blocks and migrations that `genesis add` and `genesis migrate` copy (nothing is installed), every doctor rule scans their source, and the new `packages` doctor pack holds each one to a package's standard: `package-app-import`, `package-undeclared-dependency`, `package-migration-test`, `package-migration-number`, `package-migration-edited`, `package-unregistered`, and `package-unversioned-change`, the gate that fails a change with neither a version bump nor a changeset naming the package.
