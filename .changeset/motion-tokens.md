---
"@marktiderman/genesis-design-system": minor
"@marktiderman/genesis-ui-native": minor
---

Motion tokens, defined once for web and native. genesis-design-system adds `resolveMotion(level, { reducedMotion })` with the shared durations, easings and springs (also at `@marktiderman/genesis-design-system/tokens/motion`), and its design systems now emit their `--ds-dur-*` and `--ds-ease-*` variables from it (the same values, plus `--ds-dur-fast`, `--ds-dur-base` and `--ds-ease-decelerate`). genesis-ui-native adds `useMotion({ level })` and `animateMotion()` (JS thread; under Reduce Motion it returns the final value), plus the worklet-safe `motionSpring()` and `motionTiming(motion, duration, Easing)`, which build Reanimated configs (under Reduce Motion, zero durations and stiff, critically damped springs); Drawer, Toast and Skeleton read their durations from them, unchanged. A new doctor rule, `motion-uses-tokens`, warns on new code that writes a non-zero duration or spring as a number literal in an animation config (Reanimated, React Native `Animated`, and Reanimated layout animations).

Features: motion-kit
