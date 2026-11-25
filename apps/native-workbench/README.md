# Genesis (the native showcase and workbench)

The Genesis native showcase: a real Genesis app that shows off every native feature, and where
each one is built, checked on a simulator and proven. It opens straight into the features, with
no sign-in and no backend: every screen runs on sample data.

It's a full Genesis app, made the way any app is (`genesis init native-workbench --template
native`), so it has what every Genesis app has: GenesisNativeApp and its modules, app updates,
deep links, EAS and Maestro. Inside this workspace it stays linked to the packages
(`workspace:^`), so a package change shows here with nothing published. The features that need a
signed-in person or a server (notifications, push, support, chat sync) are off in
`starter.config.ts`; their UI is shown on sample data in the showcase's screens. Its local Supabase
stack (ports 5442x) is optional and nothing in the showcase needs it: `supabase/` stays so a
showcase screen that needs a real backend (chat sync, push) can run against a local one later.

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
sources), installs it on its own simulator ("Genesis Proof") and runs the flows; no
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

Two guards keep it from running half set up. On EAS, `postinstall` (`scripts/eas-build-packages.mjs`)
builds the workspace packages the app depends on, since their git-ignored `dist/` is what the app's
config loads. And the lane's `source` check stops a release before anything is built while
`eas.json`'s `submit.production.ios` still has a `REPLACE_WITH_…` placeholder (step 1 below), so
no merge builds anything until the App Store record exists.

The app is "Genesis", bundle id `com.streamlineddigital.genesis` (the
development variant adds `.dev`, the preview `.preview`), slug `genesis`, Apple team
97HZA3D7W4. The EAS project is `@streamlined-digital/genesis` (`starter.config.ts` `app.easProjectId`), linked to GitHub `marktiderman/genesis` with base directory `/apps/native-workbench`.

The one-time setup, in order. Each is an account action and the maintainer's; no agent runs them:

1. **Create the App Store Connect app record** (App Store Connect → Apps → + → New App): platform
   iOS, name "Genesis" (if the name is taken on the App Store, "Genesis by Streamlined"), primary language English (U.S.), bundle id
   `com.streamlineddigital.genesis` (register it first under Certificates, Identifiers &
   Profiles → Identifiers if it isn't listed), SKU `genesis`, full access. Apple's API can't
   create the record. Put its Apple ID (the number under App Information) in `eas.json`
   `submit.production.ios.ascAppId`.
2. **iOS credentials**: `eas credentials -p ios`, production profile, once, signed in with the
   team's Apple account. It makes the distribution certificate and profile for the new bundle id;
   after that, EAS builds and submits with the App Store Connect key it holds.
3. **Add `EXPO_TOKEN`** (an Expo robot token) to the EAS environment `production`, and say where a
   failed release goes (`release.failureEmails` here, or `RELEASE_FAILURE_WEBHOOK`).
4. **TestFlight testers**: in App Store Connect → TestFlight, add an internal group with the testers.

The next merge to `main` that changes the app then builds and submits the first TestFlight build.
