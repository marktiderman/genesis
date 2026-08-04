# Maestro Visual Regression — sample-native

Maestro flows that capture light, dark, and reduced-motion screenshots of every primitive in `@marktiderman/genesis-ui-native`. CI diffs new captures against committed baselines.

> **First-run mode:** until DG-2 commits seed baseline PNGs, the visual-regression workflow runs in non-blocking mode — diffs are reported in the PR comment but do not fail the job. Blocking starts once baselines are committed, the `|| true` guards are removed, and `continue-on-error: true` is removed from both jobs in `.github/workflows/visual-regression.yml`.

PRD-07 Phase D-VR (DVR.1, DVR.2). Owner: Genesis framework team.

## Layout

```text
apps/sample-native/.maestro/
  config.yaml                          # appId default
  flows/
    portfolio-tour.yaml                # Phase G — full portfolio walk (no baselines)
    screenshot-light.yaml              # light mode capture (iOS + Android)
    screenshot-dark.yaml               # dark mode capture
    screenshot-reduced-motion.yaml     # reduce-motion capture
  screenshots/
    light/                             # baseline PNGs (committed)
    dark/
    reduced-motion/
```

## Phase G — portfolio tour (no baselines)

`flows/portfolio-tour.yaml` walks the entire Genesis Showcase portfolio
(tokens, primitives, components-showcase, layouts placeholders, standards)
end-to-end. It does NOT bake in screenshots — D-VR adds the snapshot
capture pass once portfolio routes have stabilized.

```bash
maestro test apps/sample-native/.maestro/flows/portfolio-tour.yaml
```

## Running locally

You need a working Maestro install — see https://maestro.mobile.dev — and a running iOS simulator or Android emulator with the sample-native app installed.

### 1. Build + install the app

```bash
# iOS simulator (one-time per machine; Maestro reuses the install)
pnpm --filter sample-native ios

# OR Android emulator
pnpm --filter sample-native android
```

### 2. Set system appearance per flow

Maestro itself does not flip OS-level light/dark or reduce-motion. Set state up front, then run the matching flow.

#### Light mode (default)

```bash
xcrun simctl ui booted appearance light                      # iOS
adb shell "cmd uimode night no"                              # Android
maestro test apps/sample-native/.maestro/flows/screenshot-light.yaml
```

#### Dark mode

```bash
xcrun simctl ui booted appearance dark                       # iOS
adb shell "cmd uimode night yes"                             # Android
maestro test apps/sample-native/.maestro/flows/screenshot-dark.yaml
```

#### Reduced-motion

```bash
# iOS
xcrun simctl spawn booted defaults write -g com.apple.UIKit.reduce-motion 1
xcrun simctl ui booted appearance light

# Android
adb shell settings put global animator_duration_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global window_animation_scale 0
adb shell "cmd uimode night no"

maestro test apps/sample-native/.maestro/flows/screenshot-reduced-motion.yaml
```

To clear reduced-motion afterward:

```bash
xcrun simctl spawn booted defaults delete -g com.apple.UIKit.reduce-motion
adb shell settings put global animator_duration_scale 1
adb shell settings put global transition_animation_scale 1
adb shell settings put global window_animation_scale 1
```

## Updating the baseline

Baselines live committed in `screenshots/`. To update after an intentional visual change:

1. Run the relevant flow on a clean simulator + emulator.
2. Inspect the new PNGs visually — `git diff` only tells you _files_ changed; review with an image viewer.
3. Commit the updated PNGs in the same PR as the source change. Reviewers see the diff inline.

Recommendation: regenerate baselines on a single canonical simulator / emulator (e.g., iPhone 16 Pro / Pixel 8) to keep noise low. CI uses the same configuration — see `.github/workflows/visual-regression.yml`.

## Coverage report

```bash
node scripts/visual-coverage.mjs
```

Generates `coverage/visual-coverage.json` + a markdown summary. Each primitive should have at least 3 screenshots (one per mode). Coverage is informational on first run — no baselines yet means 0%, which is expected.

## Showcase screens

`apps/sample-native/app/components-showcase/*` renders each primitive in a stable, content-deterministic layout. Screens are reachable by deep link only:

```text
genesis-sample://components-showcase             # index
genesis-sample://components-showcase/buttons
genesis-sample://components-showcase/cards
genesis-sample://components-showcase/inputs
genesis-sample://components-showcase/badges
genesis-sample://components-showcase/dialogs
genesis-sample://components-showcase/alerts
genesis-sample://components-showcase/progress
```

These screens are not linked from the main tab UI — they exist purely to give Maestro a deterministic surface.

## Coverage gaps

Documented gaps as of D-VR.1 baseline (PRD-07 phase_d_vr):

- The 7 stub showcase screens cover the primitives most likely to regress on theme or platform change: Button, Card, Input, Badge, Dialog, Alert, Progress + Skeleton.
- Not yet covered: Avatar, Checkbox, DropdownMenu, Label, RadioGroup, Select, Separator, Switch, Tabs, Textarea, Toggle, Tooltip, Text presets. These compose either trivially or through one of the covered primitives; D-VR.3 coverage report flags them.
- Per-platform variance (Android Material vs iOS Cupertino specific affordances) not yet captured — same flow runs on both platforms.

To extend: add a new file in `app/components-showcase/<primitive>.tsx`, register it in `_layout.tsx`, and add three `takeScreenshot` steps to the three flows.
