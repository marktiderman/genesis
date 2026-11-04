---
"@marktiderman/genesis-ui-native": minor
---

New `NativeTabBar` (on NativeTabs; past five tabs the fifth slot is "More", a NativeSheet with the rest; it splits with genesis-core's `splitTabBarItems` and names a badged tab with its count), `NativeBulkBar` (the twin of the web `DataBulkBar`), `NativeShareSheet` (the twin of `ShareDialog`: link, Copy through `onCopy`, the system share sheet with the link sent once per platform, and the host's `renderQr`; no new dependency) and `NativeWhatsNewSheet` (the one "what's new" sheet genesis-native and genesis-product now render). `NativeTabsTrigger` takes `accessibilityLabel`.
