/**
 * The starter themes Genesis ships: one per kind of work, each in the spirit
 * of a kind of product people already know how to use, and each using every
 * layer an app theme has (colours, fonts, component tokens, part styles, the
 * shell's layout; arena some raw CSS too). The palettes are Genesis's own;
 * none copies a product's brand colours.
 */
import type { BrandDarkRoles, CanonicalBrand } from "../schema/brand";
import { defineAppTheme, type AppTheme } from "./define";

const SYSTEM_SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/** Ten neutral stops, 50 to 900. */
type Ramp = [string, string, string, string, string, string, string, string, string, string];
const STOPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
const neutral = (ramp: Ramp): Record<string, string> => Object.fromEntries(ramp.map((hex, i) => [STOPS[i]!, hex]));

interface BrandParts {
  neutral: Ramp;
  page: string;
  ink: string;
  primary: string;
  primaryText?: string;
  radius: string;
  status: { success: string; warning: string; error: string; info: string };
  dark: BrandDarkRoles;
}

function brand(name: string, p: BrandParts): CanonicalBrand {
  return {
    name,
    neutral: neutral(p.neutral),
    surface: { DEFAULT: p.page },
    text: { DEFAULT: p.ink },
    accent: { DEFAULT: p.primary },
    status: {
      success: { DEFAULT: p.status.success },
      warning: { DEFAULT: p.status.warning },
      error: { DEFAULT: p.status.error },
      info: { DEFAULT: p.status.info },
    },
    radius: { lg: p.radius },
    ...(p.primaryText ? { primaryText: p.primaryText } : {}),
    dark: p.dark,
  };
}

const darkStatus = (success: string, warning: string, error: string, info: string): BrandDarkRoles["status"] => ({
  success: { DEFAULT: success },
  warning: { DEFAULT: warning },
  error: { DEFAULT: error },
  info: { DEFAULT: info },
});

/**
 * Tracker: keyboard-first and dense. Cool near-neutral greys, an indigo
 * accent used sparingly, small corners, Inter at a compact size and a
 * sidebar a step quieter than the page. Best in dark mode.
 */
export const trackerTheme: AppTheme = defineAppTheme({
  name: "tracker",
  label: "Tracker",
  description: "Keyboard-first and dense: cool greys, a sparing indigo accent, small corners and a quiet sidebar.",
  feel: "keyboard-first issue trackers",
  suits: ["issues", "projects", "roadmaps", "product"],
  brand: brand("tracker", {
    neutral: ["#f7f7f8", "#f0f0f2", "#e3e3e8", "#cfcfd6", "#9b9ba6", "#6a6a75", "#53535c", "#3a3a41", "#26262b", "#161619"],
    page: "#fcfcfd",
    ink: "#18181b",
    primary: "#5753d6",
    radius: "0.375rem",
    status: { success: "#2a8f58", warning: "#b37306", error: "#c93442", info: "#3473d6" },
    dark: {
      surface: { DEFAULT: "#0f1012" },
      text: { DEFAULT: "#e7e7ec" },
      accent: { DEFAULT: "#7d7af0" },
      primaryForeground: "#0f1012",
      neutral: { "800": "#1c1d21", "700": "#28292e", "400": "#9a9ba5" },
      status: darkStatus("#4cc488", "#f0b04a", "#f0707a", "#6aa0f5"),
    },
  }),
  roles: {
    light: {
      "sidebar-background": "#f4f4f6",
      "sidebar-foreground": "#3c3c44",
      "sidebar-accent": "#e7e7ec",
      "sidebar-accent-foreground": "#161619",
      "sidebar-border": "#e3e3e8",
    },
    dark: {
      "sidebar-background": "#0a0b0c",
      "sidebar-foreground": "#b0b1ba",
      "sidebar-accent": "#1b1c20",
      "sidebar-accent-foreground": "#f1f1f4",
      "sidebar-border": "#1c1d21",
    },
  },
  fonts: {
    sans: `"Inter", ${SYSTEM_SANS}`,
    display: `"Inter", ${SYSTEM_SANS}`,
    mono: `"JetBrains Mono", ${SYSTEM_MONO}`,
  },
  tokens: {
    "control-height": "2rem",
    "control-height-sm": "1.75rem",
    "control-height-lg": "2.25rem",
    "control-padding-x": "0.75rem",
    "control-padding-x-sm": "0.625rem",
    "card-shadow": "none",
    "card-padding": "1rem",
    "popover-shadow": "0 0 0 1px rgb(0 0 0 / 0.04), 0 8px 24px -6px rgb(0 0 0 / 0.18)",
    "table-head-height": "2rem",
    "table-cell-padding-y": "0.375rem",
    "title-letter-spacing": "-0.01em",
    "page-title-font-weight": "600",
    "page-title-letter-spacing": "-0.015em",
    "sidebar-item-radius": "0.375rem",
  },
  darkTokens: {
    "popover-shadow": "0 0 0 1px rgb(255 255 255 / 0.06), 0 8px 24px -6px rgb(0 0 0 / 0.6)",
    "overlay-shadow": "0 0 0 1px rgb(255 255 255 / 0.06), 0 16px 48px -12px rgb(0 0 0 / 0.7)",
  },
  parts: {
    "button[variant=default]": { "box-shadow": "inset 0 1px 0 rgb(255 255 255 / 0.14), 0 1px 2px rgb(0 0 0 / 0.16)" },
    "shell-nav-item": { "font-size": "0.8125rem" },
    "table-cell": { "font-size": "0.8125rem" },
  },
  shell: { density: "compact" },
});

/**
 * Repository: the code host's look. A white page on a cool grey canvas,
 * hairline borders, green for the action that commits and blue for links,
 * the system font and monospace close at hand.
 */
export const repositoryTheme: AppTheme = defineAppTheme({
  name: "repository",
  label: "Repository",
  description: "The code host's look: hairline borders, green actions, blue links, system type and monospace close at hand.",
  feel: "code hosting and developer consoles",
  suits: ["admin", "data", "settings", "platform"],
  brand: brand("repository", {
    neutral: ["#f6f8fa", "#eff2f5", "#d4dae1", "#bfc6ce", "#8b949e", "#5f6873", "#4a525b", "#343a42", "#24292f", "#1d2127"],
    page: "#ffffff",
    ink: "#1d2127",
    primary: "#1c7c3a",
    primaryText: "#0a5fc2",
    radius: "0.375rem",
    status: { success: "#1c7c3a", warning: "#9a6700", error: "#cf2330", info: "#0a5fc2" },
    dark: {
      surface: { DEFAULT: "#0e1117" },
      text: { DEFAULT: "#e3e8ee" },
      accent: { DEFAULT: "#22833b" },
      primaryForeground: "#ffffff",
      primaryText: "#4d9cf4",
      neutral: { "800": "#161b22", "700": "#2d333b", "400": "#9199a3" },
      status: darkStatus("#3fb25a", "#d29a22", "#f2554f", "#4d9cf4"),
    },
  }),
  roles: {
    light: {
      "sidebar-background": "#f6f8fa",
      "sidebar-foreground": "#1d2127",
      "sidebar-accent": "#e7ebef",
      "sidebar-accent-foreground": "#1d2127",
      "sidebar-primary": "#0a5fc2",
      "sidebar-border": "#d4dae1",
      "sidebar-ring": "#0a5fc2",
      ring: "#0a5fc2",
    },
    dark: {
      "sidebar-background": "#010409",
      "sidebar-foreground": "#c8d0d9",
      "sidebar-accent": "#1a2029",
      "sidebar-accent-foreground": "#f0f5fa",
      "sidebar-primary": "#4d9cf4",
      "sidebar-primary-foreground": "#010409",
      "sidebar-border": "#21262d",
      "sidebar-ring": "#4d9cf4",
      ring: "#4d9cf4",
    },
  },
  fonts: {
    sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`,
    display: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`,
    mono: SYSTEM_MONO,
  },
  tokens: {
    "control-height": "2rem",
    "control-height-sm": "1.75rem",
    "control-height-lg": "2.5rem",
    "control-padding-x": "0.75rem",
    "control-padding-x-sm": "0.5rem",
    "control-shadow": "0 1px 0 rgb(31 35 40 / 0.04)",
    "input-shadow": "inset 0 1px 0 rgb(208 215 222 / 0.2)",
    "card-shadow": "none",
    "card-padding": "1rem",
    "popover-shadow": "0 8px 24px rgb(140 149 159 / 0.2)",
    "overlay-shadow": "0 12px 28px rgb(140 149 159 / 0.3)",
    "table-head-font-weight": "600",
    "title-letter-spacing": "normal",
    "page-title-font-weight": "600",
    "page-title-letter-spacing": "normal",
    "sidebar-item-radius": "0.375rem",
  },
  darkTokens: {
    "control-shadow": "0 0 #0000",
    "input-shadow": "none",
    "popover-shadow": "0 8px 24px rgb(1 4 9 / 0.75)",
    "overlay-shadow": "0 12px 28px rgb(1 4 9 / 0.85)",
  },
  parts: {
    "button[variant=default]": { "border": "1px solid rgb(31 35 40 / 0.15)" },
    "button[variant=outline]": { "background-color": "hsl(var(--secondary))" },
    "table-head": { "background-color": "hsl(var(--muted))" },
    "shell-nav-item[active]": { "box-shadow": "inset 2px 0 0 hsl(var(--sidebar-ring))", "font-weight": "600" },
  },
  shell: { density: "compact" },
});

/**
 * Checklist: the to-do list. A warm white page, a confident red for adding
 * and finishing things, a warm sidebar whose open list sits on a red tint,
 * friendly corners and room to breathe.
 */
export const checklistTheme: AppTheme = defineAppTheme({
  name: "checklist",
  label: "Checklist",
  description: "The to-do list: a warm white page, a confident red, a warm sidebar with a tinted open list and friendly corners.",
  feel: "personal task managers",
  suits: ["tasks", "today", "goals", "habits"],
  brand: brand("checklist", {
    neutral: ["#fcfaf8", "#f5f1ed", "#ebe5df", "#dbd3ca", "#a79e94", "#776e64", "#5e564e", "#453f38", "#2e2a25", "#1f1c19"],
    page: "#fffdfb",
    ink: "#24211d",
    primary: "#cc3b2f",
    radius: "0.5rem",
    status: { success: "#2a8a4a", warning: "#c47f0a", error: "#cc3b2f", info: "#2f6fd1" },
    dark: {
      surface: { DEFAULT: "#1c1a18" },
      text: { DEFAULT: "#ede9e4" },
      accent: { DEFAULT: "#e8665a" },
      primaryForeground: "#1c1a18",
      neutral: { "800": "#2a2724", "700": "#3b3733", "400": "#a89f96" },
      status: darkStatus("#55b97a", "#e6a53a", "#ef7a6e", "#6c9ef0"),
    },
  }),
  roles: {
    light: {
      "sidebar-background": "#faf7f4",
      "sidebar-foreground": "#3e3933",
      "sidebar-accent": "#fbe9e5",
      "sidebar-accent-foreground": "#3e3933",
      "sidebar-primary": "#b3302a",
      "sidebar-border": "#ede7e1",
    },
    dark: {
      "sidebar-background": "#22201e",
      "sidebar-foreground": "#cbc4bb",
      "sidebar-accent": "#3a2522",
      "sidebar-accent-foreground": "#f3eeea",
      "sidebar-primary": "#ff9a8e",
      "sidebar-primary-foreground": "#22201e",
      "sidebar-border": "#2e2b28",
    },
  },
  fonts: { sans: SYSTEM_SANS, display: SYSTEM_SANS },
  tokens: {
    "control-height": "2.25rem",
    "control-padding-x": "0.875rem",
    "control-font-weight": "600",
    "control-radius": "calc(var(--radius) * 0.7)",
    "card-shadow": "0 1px 2px rgb(37 34 30 / 0.06)",
    "popover-shadow": "0 1px 8px rgb(37 34 30 / 0.12), 0 0 0 1px rgb(37 34 30 / 0.05)",
    "page-title-letter-spacing": "-0.01em",
    "sidebar-item-radius": "calc(var(--radius) * 0.7)",
    "sidebar-item-font-weight": "400",
  },
  darkTokens: {
    "card-shadow": "0 0 0 1px rgb(255 255 255 / 0.04)",
    "popover-shadow": "0 1px 8px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.06)",
  },
  parts: {
    checkbox: { "border-radius": "9999px" },
    "shell-nav-item[active]": { "font-weight": "500" },
  },
  shell: { density: "comfortable" },
});

/**
 * Notebook: the all-in-one workspace. A plain white page and warm grey ink,
 * a sidebar a shade warmer than the page, borders you barely notice, a calm
 * blue, and content first: the chrome stays out of the way.
 */
export const notebookTheme: AppTheme = defineAppTheme({
  name: "notebook",
  label: "Notebook",
  description: "The all-in-one workspace: a white page, warm grey ink, a warm sidebar, faint borders and a calm blue.",
  feel: "document and wiki workspaces",
  suits: ["docs", "meetings", "team", "learning", "clients"],
  brand: brand("notebook", {
    neutral: ["#fbfbfa", "#f3f2f0", "#e8e7e4", "#d5d3ce", "#a4a19a", "#73716a", "#5d5b55", "#46443e", "#2f2e2a", "#1f1e1b"],
    page: "#ffffff",
    ink: "#37352f",
    primary: "#1f6fc6",
    radius: "0.375rem",
    status: { success: "#3c7f5d", warning: "#b5731b", error: "#c13a30", info: "#1f6fc6" },
    dark: {
      surface: { DEFAULT: "#191919" },
      text: { DEFAULT: "#e4e3e0" },
      accent: { DEFAULT: "#5aa1ec" },
      primaryForeground: "#191919",
      neutral: { "800": "#262626", "700": "#363636", "400": "#9e9d99" },
      status: darkStatus("#5fb38a", "#e0a253", "#ef7b70", "#5aa1ec"),
    },
  }),
  roles: {
    light: {
      "sidebar-background": "#f8f8f7",
      "sidebar-foreground": "#5a5852",
      "sidebar-accent": "#ececea",
      "sidebar-accent-foreground": "#37352f",
      "sidebar-primary": "#37352f",
      "sidebar-primary-foreground": "#ffffff",
      "sidebar-border": "#ecebe8",
    },
    dark: {
      "sidebar-background": "#202020",
      "sidebar-foreground": "#a3a29e",
      "sidebar-accent": "#2c2c2c",
      "sidebar-accent-foreground": "#e4e3e0",
      "sidebar-primary": "#e4e3e0",
      "sidebar-primary-foreground": "#202020",
      "sidebar-border": "#2a2a2a",
    },
  },
  fonts: {
    sans: `"Inter", ${SYSTEM_SANS}`,
    display: `"Inter", ${SYSTEM_SANS}`,
    mono: SYSTEM_MONO,
  },
  tokens: {
    "control-height": "2rem",
    "control-height-sm": "1.75rem",
    "control-padding-x": "0.625rem",
    "card-border-width": "0",
    "card-shadow": "0 0 0 1px rgb(15 15 15 / 0.08), 0 2px 4px rgb(15 15 15 / 0.06)",
    "card-padding": "1.25rem",
    "popover-shadow": "0 0 0 1px rgb(15 15 15 / 0.05), 0 3px 6px rgb(15 15 15 / 0.1), 0 9px 24px rgb(15 15 15 / 0.2)",
    "badge-radius": "0.1875rem",
    "badge-font-weight": "400",
    "table-head-height": "2.125rem",
    "table-head-font-weight": "400",
    "title-letter-spacing": "normal",
    "page-title-letter-spacing": "-0.01em",
    "sidebar-item-radius": "0.375rem",
  },
  darkTokens: {
    "card-shadow": "0 0 0 1px rgb(255 255 255 / 0.08)",
    "popover-shadow": "0 0 0 1px rgb(255 255 255 / 0.06), 0 3px 6px rgb(0 0 0 / 0.4), 0 9px 24px rgb(0 0 0 / 0.5)",
  },
  parts: {
    "table-head": { "border-right": "1px solid hsl(var(--border))" },
    "table-cell": { "border-right": "1px solid hsl(var(--border))" },
    "table-head:last-child": { "border-right": "none" },
    "table-cell:last-child": { "border-right": "none" },
    "button[variant=outline]": { "border-color": "hsl(var(--border))" },
  },
  shell: { density: "comfortable" },
});

/**
 * Press: the publishing dashboard. A dark rail beside a light grey canvas,
 * white cards on it, a steady blue, square-ish corners and the system font:
 * built for managing pages, posts and media.
 */
export const pressTheme: AppTheme = defineAppTheme({
  name: "press",
  label: "Press",
  description: "The publishing dashboard: a dark rail, a grey canvas with white cards, a steady blue and square-ish corners.",
  feel: "website and blog dashboards",
  suits: ["website", "pages", "posts", "media", "marketing"],
  brand: brand("press", {
    neutral: ["#f6f7f7", "#e6e7e8", "#c9cacd", "#a7aaad", "#8c8f94", "#5f646b", "#50575e", "#3c434a", "#2c3338", "#1d2327"],
    page: "#f0f0f1",
    ink: "#1d2327",
    primary: "#2a6fb0",
    radius: "0.25rem",
    status: { success: "#1f7a36", warning: "#a36a00", error: "#c9252b", info: "#2a6fb0" },
    dark: {
      surface: { DEFAULT: "#15181b" },
      text: { DEFAULT: "#e8eaeb" },
      accent: { DEFAULT: "#5b9fdf" },
      primaryForeground: "#15181b",
      neutral: { "800": "#242a2f", "700": "#353c43", "400": "#a2a6ab" },
      status: darkStatus("#4fb06a", "#e0a43c", "#ef6a6e", "#5b9fdf"),
    },
  }),
  roles: {
    light: {
      card: "#ffffff",
      popover: "#ffffff",
      "sidebar-background": "#1d2327",
      "sidebar-foreground": "#e6e7e8",
      "sidebar-accent": "#2c3338",
      "sidebar-accent-foreground": "#ffffff",
      "sidebar-primary": "#72aee6",
      "sidebar-primary-foreground": "#1d2327",
      "sidebar-border": "#2c3338",
      "sidebar-ring": "#72aee6",
    },
    dark: {
      card: "#1d2226",
      popover: "#1d2226",
      "sidebar-background": "#0f1214",
      "sidebar-foreground": "#d7d9db",
      "sidebar-accent": "#22282d",
      "sidebar-accent-foreground": "#ffffff",
      "sidebar-primary": "#72aee6",
      "sidebar-primary-foreground": "#0f1214",
      "sidebar-border": "#1d2226",
      "sidebar-ring": "#72aee6",
    },
  },
  fonts: { sans: SYSTEM_SANS, display: SYSTEM_SANS, mono: SYSTEM_MONO },
  tokens: {
    "control-height": "2.25rem",
    "control-height-sm": "2rem",
    "control-padding-x": "0.75rem",
    "control-radius": "0.1875rem",
    "control-font-weight": "400",
    "card-radius": "0",
    "card-shadow": "0 1px 1px rgb(0 0 0 / 0.04)",
    "card-padding": "1rem",
    "popover-radius": "0.125rem",
    "badge-radius": "0.125rem",
    "table-head-font-weight": "400",
    "table-cell-padding-x": "0.625rem",
    "title-letter-spacing": "normal",
    "page-title-font-weight": "400",
    "page-title-letter-spacing": "normal",
    "sidebar-item-radius": "0",
    "sidebar-item-font-weight": "400",
  },
  parts: {
    "button[variant=outline]": { color: "hsl(var(--primary-text))", "border-color": "hsl(var(--primary))" },
    "shell-nav-item[active]": { "background-color": "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" },
  },
  shell: { density: "compact" },
});

/**
 * Journal: slow and reflective. A paper ground, ink-brown text, a sage
 * accent, serif headings over a soft sans, round corners and generous room.
 * For journaling, habits and reading.
 */
export const journalTheme: AppTheme = defineAppTheme({
  name: "journal",
  label: "Journal",
  description: "Slow and reflective: a paper ground, serif headings, a sage accent, round corners and generous room.",
  feel: "journaling, habit and reading apps",
  suits: ["journal", "habits", "growth", "reading", "learning"],
  brand: brand("journal", {
    neutral: ["#f8f4ee", "#f1ebe2", "#e3dbce", "#d1c6b5", "#a89c8a", "#6f6553", "#5b5143", "#453d32", "#2f2a23", "#201c17"],
    page: "#fbf8f3",
    ink: "#2b2722",
    primary: "#46694f",
    radius: "0.875rem",
    status: { success: "#3d7a4e", warning: "#a8701a", error: "#b5443a", info: "#3d6c94" },
    dark: {
      surface: { DEFAULT: "#1a1815" },
      text: { DEFAULT: "#ece6dc" },
      accent: { DEFAULT: "#93bb9d" },
      primaryForeground: "#1a1815",
      neutral: { "800": "#27241f", "700": "#38332c", "400": "#aca291" },
      status: darkStatus("#7cbf8e", "#e2b065", "#e88a7f", "#86b2d8"),
    },
  }),
  roles: {
    light: {
      "sidebar-background": "#f4efe7",
      "sidebar-foreground": "#4a4237",
      "sidebar-accent": "#e9e1d4",
      "sidebar-accent-foreground": "#201c17",
      "sidebar-primary": "#3d5e45",
      "sidebar-border": "#e3dbce",
    },
    dark: {
      "sidebar-background": "#15130f",
      "sidebar-foreground": "#c8c0b3",
      "sidebar-accent": "#2a2621",
      "sidebar-accent-foreground": "#ece6dc",
      "sidebar-primary": "#93bb9d",
      "sidebar-primary-foreground": "#15130f",
      "sidebar-border": "#26231f",
    },
  },
  fonts: {
    sans: `"DM Sans", ${SYSTEM_SANS}`,
    display: `"Lora", "Source Serif 4", "Source Serif Pro", Georgia, serif`,
  },
  tokens: {
    "control-height": "2.75rem",
    "control-height-sm": "2.25rem",
    "control-height-lg": "3.25rem",
    "control-padding-x": "1.25rem",
    "control-radius": "9999px",
    "input-padding-x": "1rem",
    "card-shadow": "0 1px 2px rgb(43 39 34 / 0.04), 0 8px 24px -12px rgb(43 39 34 / 0.18)",
    "card-padding": "1.75rem",
    "popover-radius": "var(--radius)",
    "popover-shadow": "0 12px 32px -8px rgb(43 39 34 / 0.25)",
    "title-font-weight": "500",
    "title-letter-spacing": "-0.005em",
    "page-title-font-weight": "500",
    "page-title-letter-spacing": "-0.01em",
    "sidebar-item-radius": "9999px",
    "sidebar-item-font-weight": "400",
  },
  darkTokens: {
    "card-shadow": "0 0 0 1px rgb(255 255 255 / 0.04)",
    "popover-shadow": "0 12px 32px -8px rgb(0 0 0 / 0.6)",
  },
  parts: {
    "card-title": { "font-family": "var(--font-display)" },
    "dialog-title": { "font-family": "var(--font-display)" },
    "dashboard-page-title": { "font-family": "var(--font-display)" },
    "detail-page-title": { "font-family": "var(--font-display)" },
    "form-page-title": { "font-family": "var(--font-display)" },
    "settings-page-title": { "font-family": "var(--font-display)" },
  },
  shell: { density: "comfortable" },
});

/**
 * Arena: athletic and loud. A black rail, a hot orange with dark text on it,
 * condensed headings, tight corners and high contrast. For training,
 * workouts and leaderboards. Best in dark mode.
 */
export const arenaTheme: AppTheme = defineAppTheme({
  name: "arena",
  label: "Arena",
  description: "Athletic and loud: a black rail, hot orange with dark text, condensed headings, tight corners, high contrast.",
  feel: "training and fitness trackers",
  suits: ["training", "workouts", "classes", "leaderboards"],
  brand: brand("arena", {
    neutral: ["#f5f5f5", "#ececec", "#dcdcdc", "#c4c4c4", "#9a9a9a", "#666666", "#525252", "#3a3a3a", "#242424", "#121212"],
    page: "#fafafa",
    ink: "#0f0f10",
    primary: "#f04e17",
    primaryText: "#b83a0c",
    radius: "0.25rem",
    status: { success: "#1d8a45", warning: "#b77700", error: "#d42a2a", info: "#2668d6" },
    dark: {
      surface: { DEFAULT: "#0b0b0c" },
      text: { DEFAULT: "#f2f2f2" },
      accent: { DEFAULT: "#ff6a2b" },
      primaryForeground: "#0b0b0c",
      neutral: { "800": "#18181a", "700": "#2a2a2d", "400": "#a0a0a6" },
      status: darkStatus("#3ec46d", "#f2b233", "#ff6060", "#5c95f2"),
    },
  }),
  roles: {
    light: {
      "sidebar-background": "#111112",
      "sidebar-foreground": "#e3e3e3",
      "sidebar-accent": "#232325",
      "sidebar-accent-foreground": "#ffffff",
      "sidebar-primary": "#ff6a2b",
      "sidebar-primary-foreground": "#111112",
      "sidebar-border": "#232325",
      "sidebar-ring": "#ff6a2b",
    },
    dark: {
      "sidebar-background": "#060607",
      "sidebar-foreground": "#cfcfd4",
      "sidebar-accent": "#19191b",
      "sidebar-accent-foreground": "#ffffff",
      "sidebar-primary": "#ff6a2b",
      "sidebar-primary-foreground": "#060607",
      "sidebar-border": "#19191b",
      "sidebar-ring": "#ff6a2b",
    },
  },
  fonts: {
    sans: `"Barlow", "Inter", ${SYSTEM_SANS}`,
    display: `"Barlow Condensed", "Oswald", "Arial Narrow", ${SYSTEM_SANS}`,
  },
  tokens: {
    "control-height": "2.75rem",
    "control-padding-x": "1.25rem",
    "control-radius": "calc(var(--radius) * 0.6)",
    "control-font-weight": "700",
    "control-text-transform": "uppercase",
    "control-letter-spacing": "0.06em",
    "card-radius": "var(--radius)",
    "card-shadow": "none",
    "badge-radius": "0.125rem",
    "badge-font-weight": "700",
    "badge-text-transform": "uppercase",
    "badge-letter-spacing": "0.06em",
    "table-head-font-weight": "600",
    "table-head-text-transform": "uppercase",
    "table-head-letter-spacing": "0.08em",
    "title-font-weight": "700",
    "title-text-transform": "uppercase",
    "title-letter-spacing": "0.01em",
    "page-title-text-transform": "uppercase",
    "page-title-letter-spacing": "0.01em",
    "sidebar-item-radius": "calc(var(--radius) * 0.6)",
    "sidebar-item-font-weight": "600",
  },
  parts: {
    "card-title": { "font-family": "var(--font-display)" },
    "dashboard-page-title": { "font-family": "var(--font-display)" },
    "detail-page-title": { "font-family": "var(--font-display)" },
    "form-page-title": { "font-family": "var(--font-display)" },
    "settings-page-title": { "font-family": "var(--font-display)" },
    "table-head": { "font-size": "0.75rem" },
    "shell-nav-item[active]": { "box-shadow": "inset 3px 0 0 hsl(var(--sidebar-primary))" },
  },
  // A press that sinks under the thumb: raw CSS for what a part style can't say.
  css: `[data-slot="button"]:active:not(:disabled) {
  transform: translateY(1px);
}`,
  shell: { density: "comfortable" },
});

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
  return STARTER_THEMES.find((t) => t.id === id);
}
