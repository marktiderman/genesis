---
"@marktiderman/genesis-cli": minor
---

Readable Sentry stack traces by default, web and native, from one switch.

- **`observability.sentry`** (genesis.config.json, new top-level key): the Sentry organization and project. With both set, `release.sentry` defaults to true, so the release workflows upload each update's source maps; an explicit `release.sentry` still wins. `pr-preview.yml` with Sentry on checks `SENTRY_AUTH_TOKEN` and the uploader before publishing and uploads each platform's preview update.
- **New rule `cli/sentry-source-maps`**, declared by genesis-cli through `genesis.doctor.plugin` so every app with the CLI runs it: in an app with an `@sentry/*` package, it flags Metro without `getSentryExpoConfig` (no Debug IDs), a missing `@sentry/react-native/expo` plugin, a workflow that publishes updates without uploading their source maps, and a web Vite build without Sentry's source maps plugin. An app with an empty `observability.sentry` gets one info.
- **New fix `cli/sentry-source-maps`** (guided, `genesis.doctor.fixes`): writes `getSentryExpoConfig` into the Metro config, the Expo plugin, `observability.sentry` adopted from the app's own plugin options and `"@sentry/cli": true` in the app's pnpm-workspace.yaml, then lists the `SENTRY_AUTH_TOKEN` step and the rest.
- `genesis init --template native` writes a Metro config that builds on `getSentryExpoConfig` when `observability.sentry` is set, and the development EAS profile sets `SENTRY_DISABLE_AUTO_UPLOAD`, so development builds need no token.
