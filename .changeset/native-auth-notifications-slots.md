---
"@marktiderman/genesis-ui-native": minor
---

`AuthScreen`: a whole sign-in screen from props, assembling `AuthBranding`, `SocialAuthRow`, `AuthForm` and `ForgotPasswordLink` (shown for password sign-in when `onForgotPassword` is set), plus a footer. Each part (`branding`, `social`, `form`, `footer`) is a slot. `NotificationsPage` takes `slots` and `slotProps` for `sectionHeader`, `row` and `empty`; the `emptyState` prop still works. Defaults render as before.

Features: native-components
