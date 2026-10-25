---
"@marktiderman/genesis-forms-builder": patch
"@marktiderman/genesis-cli": patch
---

Built with TypeScript 6 (Expo SDK 58 expects `typescript ~6.0.3`).

- `genesis-forms-builder`: the only change in any package's published declarations. `FlowMap` is now typed `MemoExoticComponent<(props) => JSX.Element>` (TypeScript 5.9 wrote `NamedExoticComponent<props>`); it is the same component and takes the same props.
- `genesis-cli`: `genesis init --template native` makes an app on TypeScript 6, with the starter's component tests (jest-expo and React Native Testing Library: sign-in, Settings, account deletion, the tabs and the root layout's boot) run by its `test` script beside the vitest file checks. The app's `pnpm-workspace.yaml` leaves out the monorepo's `patchedDependencies`, whose patch files an app doesn't have.
