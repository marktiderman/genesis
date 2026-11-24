# Genesis Workbench

The Genesis native showcase: a real Genesis app that shows off every native feature, and where
each one is built, checked on a simulator and proven. It opens straight into the features, with
no sign-in and no backend: every screen runs on sample data.

It's a full Genesis app, made the way any app is (`genesis init native-workbench --template
native`), so it has what every Genesis app has: GenesisNativeApp and its modules, app updates,
deep links, EAS and Maestro. Inside this workspace it stays linked to the packages
(`workspace:^`), so a package change shows here with nothing published. The features that need a
signed-in person or a server (notifications, push, support, chat sync) are off in
`starter.config.ts`; their UI is shown on sample data in the showcase's screens. Its local Supabase
stack (ports 5442x) is optional and nothing in the showcase needs it.

## The showcase

One tab per section: **Standards** (how every Genesis app behaves on iOS: the native header, the
tab bar, a row's actions, the way back), **Components**, **Layouts** and **Messages**. Each tab
lists its screens by the package that ships them; each screen says what it demonstrates.

The registry is `src/workbench/registry.ts`. Each screen is in `src/workbench/screens/` with its
`id`, `title`, `summary`, `section`, `package` and `covers` (the exports it shows); its route is
`/<section>/<id>` and its testIDs are `workbench-<id>-…`.

## Proving a change

```bash
pnpm --filter native-workbench workbench:prove                 # every flow in .maestro/workbench
pnpm --filter native-workbench workbench:prove --flow header   # one flow
pnpm --filter native-workbench prove:ios                       # the smoke flows (.maestro/flows)
```

It builds the development variant for the Simulator (cached by its sources and the packages'
sources), installs it on its own simulator ("Genesis Workbench Proof") and runs the flows; no
stack, no login (`--no-stack`). The evidence is `.e2e/artifacts/<run>/`: `summary.md`, each flow's
screenshots and Maestro's logs. Link it in the pull request.

Swipes and drags that Maestro can't make are checked with real gestures through Argent
(`gesture-swipe` on the same simulator) and noted in the PR.

## Adding a package's screens

A pull request that changes a native package (AGENTS.md):

1. adds or updates its screen in `src/workbench/screens/` and its line in the registry;
2. adds or updates its flow in `.maestro/workbench/`;
3. removes what it covers from `workbench-coverage.json` (`pnpm check:workbench-coverage`, part of
   `lint:genesis`, fails on a native component with no screen and no `notYet` line);
4. runs `workbench:prove` and links the evidence.

## TestFlight

The showcase ships to TestFlight (iOS only) through Genesis's own release lane
(`genesis add template release`; `genesis.config.json` `appFolder` and `release`). On a merge to
Genesis `main` that changes this app (`apps/native-workbench/**`) or the packages it reads
(`packages/**`), `.eas/workflows/deploy-production.yml` runs on EAS: when the fingerprint changed it
builds and submits to TestFlight, otherwise it publishes an update to the builds already out. Docs,
Markdown, `.maestro/` and CI files never start it. Nobody builds or submits by hand.

The one-time setup, in order (only the maintainer can do these; none needs code):

1. **Confirm the name and bundle id** (proposed: "Genesis Showcase", `com.streamlineddigital.genesis.showcase`).
   An agent then sets them in `starter.config.ts`.
2. **Create the EAS project** under `streamlined-digital` (`eas init` in this folder, or an agent
   with the go-ahead), and put its id in `starter.config.ts` `app.easProjectId`.
3. **Create the App Store Connect app record** for that bundle id (App Store Connect → Apps → +):
   Apple's API can't. Put its Apple ID (the number) in `eas.json` `submit.production.ios.ascAppId`.
4. **iOS credentials**: `eas credentials -p ios` (production profile) once, which uses the team's
   App Store Connect API key EAS already holds to make the distribution profile.
5. **Link GitHub on expo.dev** (project settings → GitHub), base directory `apps/native-workbench`.
6. **Add `EXPO_TOKEN`** (an Expo robot token) to the EAS environment `production`, and say where a
   failed release goes (`release.failureEmails` here, or `RELEASE_FAILURE_WEBHOOK`).

The next merge to `main` that changes the app then builds and submits the first TestFlight build.
