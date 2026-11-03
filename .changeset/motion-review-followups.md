---
"@marktiderman/genesis-ui-native": patch
---

Motion tokens, following triage's review.
- Drawer, Toast and Skeleton read their durations and Reduce Motion through `useMotion`, the same path every other motion takes.
- Toast's entrance uses the `decelerate` easing token (the same cubic ease-out curve as before).
- The `motion-uses-tokens` doctor rule checks every file: mentioning a motion helper no longer exempts a file. Its pattern is held to test fixtures.

The public `GenesisReanimatedModule` type (what an app passes as `GenesisModules.reanimated`) gains two optional members, `withSpring` and `Easing.bezier`. Both are optional, so an app passing an older module, or a test fake, still type-checks.
