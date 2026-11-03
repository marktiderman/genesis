---
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-ui-native": minor
---

Motion tokens, defined once for web and native. genesis-design-system adds `resolveMotion(level, { reducedMotion })` with the shared durations, easings and springs (also at `@marktiderman/genesis-design-system/tokens/motion`), and its design systems now emit their `--ds-dur-*` and `--ds-ease-*` variables from it (the same values, plus `--ds-dur-fast`, `--ds-dur-base` and `--ds-ease-decelerate`). genesis-ui-native adds `useMotion({ level })` and `animateMotion()` (JS thread), plus the worklet-safe `motionSpring()` and `motionTiming()`, which turn the tokens into Reanimated animations and hold still under Reduce Motion; Drawer, Toast and Skeleton read their durations from them, unchanged. A new doctor rule, `motion-uses-tokens`, warns on new code that writes a duration or a spring as a number literal (Reanimated, React Native `Animated`, and layout animations).

Features: motion-kit
