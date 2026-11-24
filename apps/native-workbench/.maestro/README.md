# Maestro flows

Flows for the showcase, run against the development variant on a simulator. None signs in: the
app opens straight into the showcase.

| Folder | What it holds |
| --- | --- |
| `flows/` | Smoke: `launch.yaml` (a fresh install boots, no fatal screen, lands on Standards) and `deep-link.yaml` (the development scheme opens a section's tab). |
| `workbench/` | One flow per showcase screen: it opens the screen and proves what the screen demonstrates. |
| `subflows/` | Steps the flows share (`open-workbench.yaml`: a clean launch to Standards). |

## Running

```bash
pnpm --filter native-workbench workbench:prove     # build (or reuse) and run .maestro/workbench
pnpm --filter native-workbench prove:ios           # the smoke flows
```

Its options are listed at the top of `prove-ios.mjs`. With the development variant already installed you can
also run one flow directly: `maestro test .maestro/workbench/header.yaml`.
