---
"@marktiderman/genesis-cli": minor
---

`genesis upgrade` and `genesis doctor`: fewer stops on the way through a release.

- **A new export the app builds by hand.** The upgrade compares the component package before and after the install and names each swap, ahead of the doctor's `shadowed-export`, whose message now names the package.
- **An app in a sub-folder of its repository.** A new `genesis.config.json` setting, `"appFolder": "mobile"`: the upgrade writes the EAS workflows' `paths` from the repository root, so an edit on every line no longer conflicts with each template change, and leaves `.github/workflows` to the repository. Without it, a conflict in a workflow says to set it.
- **The next release after a resolved conflict.** Once a `.genesis-next` is worked into the file and deleted, with no run in between, the next release merges against that version instead of writing another `.genesis-next`. A file that hasn't changed since isn't taken as resolved.
- **`--pr` and gitignored files.** A changed file the repository ignores stays out of the commit and is named in the summary, instead of `git add` stopping the run on a new branch.
- **The app-folder substitution** takes a relative path (`mobile/src`, `apps/web`, as the docs say to use), not only one folder name.
- **Generated files.** The upgrade regenerates the agent guide (when the app has it) and runs `features build` (when it has a registry), and the pull request carries them. `--no-agents` and `--no-features-build` turn them off.
- **Dependencies not installed.** The upgrade stops before changing anything and gives the install command; the doctor tells a missing install from a package the app doesn't use; the summary says why the doctor couldn't run.
- **`Available but unused`** is a count unless you pass `genesis doctor --verbose` (`--json` still lists it).
- **Major moves with no codemod** link each package's changelog and list its major changes, or say it has none of its own and moved with its dependencies. A codemod declared at a minor no longer hides a major move across it.
- **Two new codemods** for the doctor rules with a mechanical fix: `genesis-ui-overlays-fit-the-phone` and `genesis-ui-native-haptics`. docs/MIGRATION.md covers these and the two findings with no mechanical fix (`shadowed-export`, the `persistQueries` deprecation).
