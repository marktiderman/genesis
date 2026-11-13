/**
 * App brands (colours and fonts) and app themes (every component's size,
 * shape and parts, and the shell's layout), chosen independently. Seven of
 * each ship as starters. See `define.ts` and the package README.
 *
 * @packageDocumentation
 */
export {
  THEME_FONTS,
  THEME_ROLES,
  THEME_TOKEN_NAMES,
  defineAppBrand,
  defineAppTheme,
  parsePartSelector,
  validateAppBrand,
  validateAppTheme,
  type AppBrand,
  type AppBrandInput,
  type AppTheme,
  type AppThemeInput,
  type AppThemeShell,
  type ThemeDeclarations,
  type ThemeFont,
  type ThemePartStyles,
  type ThemeRoleColors,
  type ThemeTokenValues,
} from "./define";
export {
  APP_BRAND_PAIRS,
  appBrandContrastProblems,
  appBrandCss,
  appBrandVariables,
  appThemeCss,
  appThemeVariables,
  renderAppThemesCss,
  type AppBrandContrastProblem,
  type AppThemeCssOptions,
  type AppThemeVariables,
} from "./render";
export {
  STARTER_BRANDS,
  STARTER_THEMES,
  arenaBrand,
  arenaTheme,
  checklistBrand,
  checklistTheme,
  getStarterBrand,
  getStarterTheme,
  journalBrand,
  journalTheme,
  notebookBrand,
  notebookTheme,
  pressBrand,
  pressTheme,
  repositoryBrand,
  repositoryTheme,
  trackerBrand,
  trackerTheme,
} from "./themes";
export {
  COMPONENT_TOKENS,
  NO_SHADOW,
  componentTokenCss,
  componentTokenProblem,
  getComponentToken,
  type ComponentTokenInfo,
  type ComponentTokenKind,
} from "../tokens/component-tokens";
export { THEME_PARTS, getThemePart, type ThemePartInfo } from "../tokens/theme-parts";
