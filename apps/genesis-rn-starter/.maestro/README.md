# Maestro flows

End-to-end flows for the starter, run against a development build on a simulator or emulator.
No workflow runs them in CI yet.

| Flow | What it checks |
| --- | --- |
| `flows/sign-in-screen.yaml` | A fresh install boots past the splash (every boot step, the session read) to the sign-in screen. |

## Running

You need [Maestro](https://maestro.mobile.dev), `.env` filled in (see the starter's README), and the
development variant installed:

```bash
APP_VARIANT=development pnpm --filter genesis-rn-starter ios   # or android
maestro test apps/genesis-rn-starter/.maestro/flows/sign-in-screen.yaml
```

`config.yaml` and each flow name the development variant's bundle id
(`com.example.genesisstarter.dev`); change it with `app.bundleId` in `starter.config.ts`.

The component showcase and its screenshot flows lived here while this app was `apps/sample-native`;
they were removed when it became the starter and are in git history.
