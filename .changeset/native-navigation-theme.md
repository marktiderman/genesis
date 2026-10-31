---
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-ui-native": minor
---

`GenesisNativeApp` themes React Navigation. Before, nothing set a dark navigation theme, so in dark mode a header showed black text on a light strip.

- ui-native: `GenesisModules` takes `navigation`: `{ ThemeProvider, DefaultTheme, DarkTheme }` from `expo-router` in an Expo Router app (it bundles its own React Navigation), or from `@react-navigation/native` otherwise. The new types are `GenesisNavigationModule` and `GenesisNavigationTheme`. The starter passes it.
- native: with `modules.navigation`, the shell wraps the app in React Navigation's `ThemeProvider`, with a theme for the current mode. The theme takes React Navigation's own light or dark theme, keeps its fonts, and replaces primary, background, card, text, border and notification with the app's role colors. Those are `brandRoleVariables(brand)`, with the app's `brandVariables` map over them when it passes one. `navigationTheme` takes a theme of your own (or `{ light, dark }`); `false` sets none.
