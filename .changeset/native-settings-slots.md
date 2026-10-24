---
"@marktiderman/genesis-ui-native": minor
---

`SettingsPage` takes `slots` and `slotProps`, the same contract as web patterns (from `@marktiderman/genesis-core/slots`). Replace or drop (`null`) any of `sectionHeader`, `row`, `footnote` and `dangerousActions`; your component receives exactly the props the default would (`SettingsPageSlotMap`), and `slotProps` feeds a default part more props. The rendered output and test ids are unchanged.

Features: native-components
