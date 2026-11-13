/**
 * Starter themes: whole-app looks built on a brand, one per kind of work.
 * See `define.ts` for what a theme is and the package README for how to use one.
 *
 * @packageDocumentation
 */
export {
  SHELL_DENSITIES,
  THEME_FONTS,
  THEME_ROLES,
  defineStarterTheme,
  validateStarterTheme,
  type ShellDensity,
  type StarterTheme,
  type StarterThemeInput,
  type ThemeFont,
  type ThemeRoleColors,
} from "./define";
export {
  STARTER_THEME_PAIRS,
  renderStarterThemesCss,
  starterThemeContrastProblems,
  starterThemeCss,
  starterThemeVariables,
  type StarterThemeContrastProblem,
  type StarterThemeCssOptions,
  type StarterThemeVariables,
} from "./render";
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
} from "./themes";
