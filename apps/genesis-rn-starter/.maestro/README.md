# Maestro flows

Smoke flows for the starter, run against the development variant on a simulator or emulator.
`.eas/workflows/e2e.yml` runs them on EAS for each pull request.

| Flow | Tags | What it checks |
| --- | --- | --- |
| `flows/launch.yaml` | smoke | A fresh install runs every boot step and leaves the splash, with no fatal screen. |
| `flows/sign-in-screen.yaml` | smoke | It lands on the sign-in screen: the email form and the sign-in / create-account switch. |
| `flows/settings-version.yaml` | smoke, account | Signs in with email, opens the Settings tab, and finds the About row (`settings-row-version`) showing a version signature (`1.0.0 (1) · …`), and sign-out. `e2e.yml` leaves it out until its secrets exist. |

`subflows/sign-in.yaml` is the sign-in steps `settings-version.yaml` runs; it isn't a flow of its
own, so it lives outside `flows/`.

## Running

You need [Maestro](https://maestro.mobile.dev), `.env` filled in (see the starter's README), and the
development variant installed:

```bash
APP_VARIANT=development pnpm --filter genesis-rn-starter ios --configuration Release
pnpm --filter genesis-rn-starter e2e                       # every flow in flows/
maestro test --exclude-tags account .maestro/flows          # the ones that don't sign in
```

The `account` flow signs in with `MAESTRO_TEST_EMAIL` and `MAESTRO_TEST_PASSWORD` from the
environment (Maestro reads `MAESTRO_*` variables): an account that can sign in with email and
password on the Supabase project the build points at. On EAS they are secret variables of the
development environment.

`config.yaml` and each flow name the development variant's bundle id
(`com.example.genesisstarter.dev`); change them with `app.bundleId` in `starter.config.ts` (a test
checks they agree). The flows find screens by the testIDs the Genesis layouts set (`auth-screen`,
`home`, `settings`, `settings-row-<id>`, `genesis-boot`, `genesis-fatal`).

These files are copies of [`templates/maestro/`](../../../templates/maestro); a test fails if they
drift.
