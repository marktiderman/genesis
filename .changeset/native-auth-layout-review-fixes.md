---
"@marktiderman/genesis-ui-native": minor
---

From review: `AuthForm`'s return key on the email field moves focus to the password field (React Native doesn't do it by itself) and keeps the keyboard open, and both fields carry AutoFill hints (`textContentType`, `autoComplete`). `AuthScreen` keeps the form above the keyboard and, in development on iOS, warns when a third-party provider is offered without Sign in with Apple (App Store Review Guideline 4.8). `SettingsPage` takes its colors from theme roles: on iOS, inset rounded cells on the grouped background, like the Settings app. `ScreenContainer` takes a `style`. `NotificationsPage` no longer builds a new separator component on every render.
