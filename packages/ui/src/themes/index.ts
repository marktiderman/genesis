/**
 * App themes: a brand, a style and a layout in one named bundle (ADR 0018).
 * Brands and styles themselves are design-system's
 * (`@marktiderman/genesis-design-system/app-styles`).
 *
 * @packageDocumentation
 */
export {
  appThemeAttributes,
  defineAppTheme,
  validateAppTheme,
  type AppTheme,
  type AppThemeInput,
  type AppThemeLayout,
} from "./define";
export { appShellOptionsFromTheme } from "./layout";
// An app brand's name, logo and mark in AppShell; the person's appearance from their preferences.
export { appShellBrandProps, type AppShellBrandProps } from "./brand";
export { AppearanceProvider, type AppearanceProviderProps } from "./appearance";
export {
  STARTER_THEMES,
  arenaTheme,
  checklistTheme,
  getStarterTheme,
  journalTheme,
  notebookTheme,
  pressTheme,
  repositoryTheme,
  trackerTheme,
  withPairedBrand,
} from "./starters";
