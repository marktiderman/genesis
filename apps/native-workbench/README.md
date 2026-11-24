# Genesis native workbench

Where every Genesis native feature is built, checked on a simulator and proven. It's a full
Genesis app, made the way any app is (`genesis init native-workbench --template native`), so it
inherits everything a Genesis app has: GenesisNativeApp and its modules, the blocks (account,
settings, notifications, push, chat, support, app updates), its own local Supabase stack, EAS and
Maestro. Inside this workspace it stays linked to the packages (`workspace:^`), so a package
change shows here with nothing published.

## The workbench tab

Signed in, the **Workbench** tab lists every registered screen by section (Standards, Components,
Layouts). The registry is `src/workbench/registry.ts`; each screen is a file in
`src/workbench/screens/` with its `id`, `title`, `summary`, `package` and `covers` (the exports it
shows), and its testIDs are `workbench-<id>-…`.

## Proving a change

```bash
pnpm --filter native-workbench workbench:prove            # every flow in .maestro/workbench
pnpm --filter native-workbench workbench:prove --flow header   # one flow
pnpm --filter native-workbench prove:ios                  # the starter's own flows (.maestro/flows)
```

It starts this app's local stack (Docker; ports 5442x, never the default 5432x), makes a test
login (`prove@example.test`, a new password each run), builds the development variant for the
Simulator (cached by its sources and the packages' sources), installs it on its own simulator
("Genesis Workbench Proof") and runs the flows. The evidence is `.e2e/artifacts/<run>/`:
`summary.md`, each flow's screenshots and Maestro's logs. Link it in the pull request.

Swipes and drags that Maestro can't make are checked with real gestures through Argent
(`gesture-swipe` on the same simulator) and noted in the PR.

## Adding a package's screens

A pull request that changes a native package (AGENTS.md, "Native work"):

1. adds or updates its screen in `src/workbench/screens/` and its line in the registry;
2. adds or updates its flow in `.maestro/workbench/`;
3. removes what it covers from `workbench-coverage.json` (`pnpm check:workbench-coverage`, part of
   `lint:genesis`, fails on a native component with no screen and no `notYet` line);
4. runs `workbench:prove` and links the evidence.

The App Store and Play fields in `eas.json` stay placeholders: the workbench is never released.
