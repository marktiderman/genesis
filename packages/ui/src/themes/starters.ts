/**
 * The starter themes Genesis ships: each is its starter style of the same name
 * and a layout made for its kind of work. They leave the brand unset, so an
 * app wears them in its own colours; `pairsWith` names the starter brand each
 * was designed with, for a picker.
 */
import { getStarterBrand, getStarterStyle, type AppBrand, type AppStyle } from "@marktiderman/genesis-design-system/app-styles";
import { defineAppTheme, type AppTheme, type AppThemeLayout } from "./define";

function starter(id: string, layout: AppThemeLayout): AppTheme {
  const style = getStarterStyle(id) as AppStyle;
  return defineAppTheme({
    name: id,
    label: style.label,
    description: style.description,
    feel: style.feel,
    suits: style.suits,
    style,
    layout,
  });
}

export const trackerTheme: AppTheme = starter("tracker", { density: "compact" });
export const repositoryTheme: AppTheme = starter("repository", { density: "compact" });
export const checklistTheme: AppTheme = starter("checklist", { density: "comfortable" });
export const notebookTheme: AppTheme = starter("notebook", { density: "comfortable" });
export const pressTheme: AppTheme = starter("press", { density: "compact" });
export const journalTheme: AppTheme = starter("journal", { density: "comfortable" });
export const arenaTheme: AppTheme = starter("arena", { density: "comfortable" });

/** Every starter theme Genesis ships, in picker order. */
export const STARTER_THEMES: readonly AppTheme[] = Object.freeze([
  trackerTheme,
  repositoryTheme,
  checklistTheme,
  notebookTheme,
  pressTheme,
  journalTheme,
  arenaTheme,
]);

/** A starter theme by id, or undefined. */
export function getStarterTheme(id: string): AppTheme | undefined {
  return STARTER_THEMES.find((theme) => theme.id === id);
}

/** A starter theme worn in the starter brand it was designed with: for a preview or a picker. */
export function withPairedBrand(theme: AppTheme): AppTheme {
  const brand: AppBrand | undefined = theme.style?.pairsWith ? getStarterBrand(theme.style.pairsWith) : undefined;
  if (!brand) return theme;
  const { id, ...input } = theme;
  return defineAppTheme({ ...input, name: id, brand });
}
