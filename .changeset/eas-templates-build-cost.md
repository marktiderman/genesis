---
"@marktiderman/genesis-cli": patch
---

The EAS workflow templates build less by default. `pr-preview.yml` runs only for pull requests into `main` that change the app's folder (`REPLACE_WITH_APP_FOLDER`, to replace) or the config a build reads (`app.json`, `app.config.*`, `eas.json`, `package.json`, `pnpm-lock.yaml`), or when a pull request is labeled `Preview`; its iOS jobs run only once the preview EAS environment sets `PREVIEW_IOS=true`, since an ad hoc iOS build installs only on registered devices. `e2e.yml` runs only by hand (`workflow_dispatch`), since Maestro needs a paid EAS plan; its header shows the pull request trigger to add. `docs/NATIVE-RELEASE.md` has a new "Build cost" section. Apps refresh their copies with `genesis upgrade`.
