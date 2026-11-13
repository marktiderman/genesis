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
