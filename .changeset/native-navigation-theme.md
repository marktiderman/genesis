---
"@marktiderman/genesis-native": minor
"@marktiderman/genesis-ui-native": minor
---

`GenesisNativeApp` themes React Navigation. Before, nothing set a dark navigation theme, so in dark mode a header showed black text on a light strip.

- ui-native: `GenesisModules` takes `navigation`: `{ ThemeProvider, DefaultTheme, DarkTheme }` from `expo-router` (or `@react-navigation/native`). The new types are `GenesisNavigationModule` and `GenesisNavigationTheme`. The starter passes it.
- native: with `modules.navigation`, the shell wraps the app in React Navigation's `ThemeProvider`, with a theme for the current mode. The theme takes React Navigation's own light or dark theme, keeps its fonts, and replaces primary, background, card, text, border and notification with the app's role colors. Those are the `brandVariables` map when the app passes one, `brandRoleVariables(brand)` otherwise. `navigationTheme` takes a theme of your own (or `{ light, dark }`); `false` sets none.
