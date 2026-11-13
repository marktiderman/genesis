# @marktiderman/genesis-design-system

Brand-agnostic design tokens for Genesis apps: the canonical brand schema, the
factories that turn a brand into a Tailwind v4 preset or a NativeWind theme,
design systems, the OKLCH colour engine, the font list, theme roles and the
Genesis default brand.

```bash
pnpm add @marktiderman/genesis-design-system
```

| Entry | What |
|---|---|
| `.` | Everything below. |
| `./design-systems` | `defineDesignSystem`, the neutral design systems, the registry, the colour engine. |
| `./fonts` | `FONT_CHOICES`, `SELF_HOSTED_FONTS`, `fontForStack`. No imports, so a build script can bundle it alone. |
| `./schema/brand`, `./schema/brand.schema.json` | `CanonicalBrand`, `validateBrand`, `brandContrastProblems`, and the JSON Schema. |
| `./themes/genesis.css`, `./themes/genesis-tailwind4.css` | The default theme and the Tailwind v4 bridge. |
| `./tokens`, `./tokens/native`, `./presets/*`, `./theme`, `./providers/native` | Tokens, presets and the theme provider. |
| `./tokens/motion` | `resolveMotion`, the shared durations, easings and springs (web CSS and native alike). No runtime imports. |

## A brand

A brand is identity: a name, colour scales, fonts and, optionally, a design
system. `CanonicalBrand` is the shape; `validateBrand` checks one (the JSON
Schema says the same).

```ts
import { tailwindFromBrand, themeFromBrand, type CanonicalBrand } from "@marktiderman/genesis-design-system";

const css = tailwindFromBrand(brand).css; // a Tailwind v4 @theme body
const { variables, theme } = themeFromBrand(brand); // CSS variables per mode, and native shapes
```

Lengths (`spacing`, `radius`, `typography.fontSize`, `lineHeight`) are rem
strings, `"0"`, or a fluid size: `clamp(<rem>, <rem> + <n>vw, <rem>)`, with
nothing else in it and its minimum not above its maximum. Native reads a
clamp's minimum.

`radius.lg` (else `radius.DEFAULT`) is the brand's `--radius`, and every
corner scales from it: `rounded-sm` is 0.6×, `md` 0.8×, `lg` 1×, `xl` 1.4×
(and `xs`, bare `rounded`, `2xl`, `3xl` the same way), on web and in the
NativeWind preset. `"0"` is square everywhere.

### Primary as text

`primary` is a fill. The primary as text or an icon on the page (a link, an
active tab, a stat) is its own role, `primary-text` (`--primary-text`, the
`text-primary-text` class on web and in the NativeWind preset), declared in
both modes for every brand. It is the primary when that reads at 4.5:1 on the
mode's background (and, in light mode, on the muted fill messages and muted
rows sit on); otherwise the primary's hue, darkened in light mode or
lightened in dark mode one HSL lightness point at a time until it does (the
text colour if no step does). A gold `#FFC402` accent is 1.6:1 on white, so
its primary text is `#8a6a00` (5.07:1 on white, 4.6:1 on the muted fill);
Genesis's indigo already reads, so its primary text is the primary. Set
`primaryText` (and `dark.primaryText`, `#rgb` or `#rrggbb`) on the brand to
choose the shade yourself. Genesis components colour text with
`text-primary-text`, never `text-primary`. `themes/genesis.css` declares it as
`var(--primary)`, so an app that sets only `--primary` in its own CSS keeps
that colour for text; with a light primary, set `--primary-text` beside it.
That fallback is resolved on `:root`: an app that overrides `--primary` on a
nested element (a scoped theme: a form, a workspace, a section) must set
`--primary-text` on the same element, or text inside keeps the root's primary.

### Contrast

`validateBrand` (from the package entry) also checks contrast, against WCAG
2.2 AA: the theme role pairs the brand changes (4.5:1 for text, 3:1 for fills,
the focus ring and status marks; text on a fill only where genesis-ui draws
`*-foreground` on it), and every `extensions` color against the text drawn on
it. The Genesis brand reports nothing. A pair under its minimum is a **warning** (`warnings`;
`ok` stays true), so an existing brand keeps building. Only body text under
1.5:1 on the page is an error. `brandContrastProblems(brand)` returns the
same findings as data (pair, colors, ratio, minimum). The
`./schema/brand` entry's `validateBrand` is the shape check alone, so it stays
light; pass `{ contrast: brandContrastProblems }` to add the check.

An extension scale is checked against its `foreground` stop when it declares
one, so say which color you draw on it:

```ts
extensions: { category: { DEFAULT: "#c2410c", strength: "#d97706", foreground: "#f5ebdc" } }
```

Without one, a color only warns when neither `text.DEFAULT` nor
`surface.DEFAULT` reads on it.

Extension colors are utility classes on both platforms, under kebab-case
names: `tailwindFromBrand` emits `extensions.gameMode` as
`--color-game-mode` (`bg-game-mode`, `bg-game-mode-solo`), and
`createGenesisNativewindPreset({ brand })` adds the same classes for
NativeWind.

## Design systems

A design system is the look rules attached to a brand: the type ramp, space,
corners, surfaces, image treatment and motion. Each is versioned in code; a
brand names one, plus up to three choices from fixed lists:

```ts
const brand: CanonicalBrand = {
  ...genesisBrand,
  name: "acme",
  designSystem: { id: "soft@1", density: "generous", corners: "round", motion: "calm" },
};
const { variables, designSystem } = themeFromBrand(brand);
variables.light["--ds-text-display"]; // "clamp(2.75rem, 1.8333rem + 4.0741vw, 5.5rem)"
designSystem?.pairs; // every colour pair it draws, each solved to its WCAG minimum
```

`themeFromBrand(brand, { designSystem })` takes a definition or an id instead
of the brand's own (a preview of a swap). The brand's choices still apply.

| Fixed list | Values |
|---|---|
| `density` | `compact`, `normal`, `generous` (section padding) |
| `corners` | `square`, `crisp`, `soft`, `round`, `friendly` |
| `motion` | `none`, `calm`, `lively`, `bold` (web CSS and, through genesis-ui-native's `useMotion`, native; reduced motion means none) |

**Shipped:** `classic@1` (no tokens: the host's own look, the default),
`crisp@1` (cool ground, hairlines, small corners, flat, calm) and `soft@1`
(warm ground, generous, rounded, soft shadows, calm). Industry design systems
are template content elsewhere (genesis-sites' `/templates`).

### Defining one

```ts
import { DEFAULT_RAMP, defineDesignSystem, registerDesignSystem } from "@marktiderman/genesis-design-system";

export const quiet = defineDesignSystem({
  name: "quiet",
  version: 1,
  label: "Quiet",
  type: {
    ramp: { ...DEFAULT_RAMP, display: { min: 2.5, max: 4.75 } }, // rem at 360px and 1440px
    classes: { serif: { displayWeight: 400 } }, // over DEFAULT_FONT_CLASS_RULES
    eyebrow: { tracking: 0.16 },
  },
  space: { density: "generous" },
  shape: { corners: "round", borderWidth: 1, shadow: "soft" },
  surfaces: { ground: "paper" }, // turns on the colour engine
  image: { filter: "warm", grain: 0, scrim: "full" },
  motion: { level: "calm" },
});
registerDesignSystem(quiet); // so a brand can name "quiet@1"
```

- `defineDesignSystem` checks everything and throws with every problem at
  once; it returns the definition frozen, with `id` (`name@version`).
- Every group is optional. A group left out emits no tokens, so the host keeps
  its own value there (`classic@1` leaves them all out).
- A changed look is a new version: registering an id again with a different
  definition throws.
- `getDesignSystem(id)` and `listDesignSystems()` read the built-in and
  registered ones. An id that isn't there is logged by `themeFromBrand`, which
  then themes without a design system.

### The tokens

Every token is `--ds-*`, so none collides with Tailwind's own theme variables.
A host reads each with its own value as the fallback:
`font-size: var(--ds-text-h2, 2.25rem)`.

| Group | Tokens |
|---|---|
| `type` | `--ds-text-{eyebrow,sm,body,lead,h4,h3,h2,h1,display}` (a clamp each), `--ds-leading-*`, `--ds-display-{weight,tracking,case}`, `--ds-heading-{weight,tracking,case}`, `--ds-eyebrow-{weight,tracking,case}`. Weight, tracking and case follow the heading font's class (`FONT_CHOICES[id].class`). |
| `space` | `--ds-section-y-{sm,md,lg}` (by density), `--ds-space-1` … `--ds-space-11` (4px base), `--ds-gutter`, `--ds-collapse-top` |
| `shape` | `--ds-radius-{sm,md,lg,button,image}`, genesis-ui's `--radius` (so `rounded-xl` cards get `md`), `--radius-2xl`, `--ds-border-width`, `--ds-shadow-1…3` (ink-tinted; none in dark mode) |
| `surfaces` | `--ds-ground`, `--ds-ground-raised`, `--ds-ground-sunk`, `--ds-ink`, `--ds-ink-quiet`, `--ds-border`, `--ds-input-border`, `--ds-accent-{fill,text,edge,tint}`, `--ds-on-{accent,tint,inverse}`, `--ds-inverse`, `--ds-focus`, `--ds-scrim-full`, `--ds-secondary-*`, and genesis-ui's roles (`--background`, `--primary`, `--primary-text`, `--muted-foreground`, … as HSL triplets) |
| `image` | `--ds-image-filter`, `--ds-image-grain` |
| `motion` | `--ds-ease-{out,swift,in-out,decelerate}`, `--ds-dur-{press,fast,hover,base,ui,reveal,media}` (from `resolveMotion`; a host gates them with `prefers-reduced-motion`), `--ds-reveal` and `--ds-reveal-phone` (the keyframes to run, `ds-rise` or `ds-clip`, which the host's stylesheet defines), `--ds-reveal-distance`, `--ds-reveal-range`, `--ds-hover-lift` |

## Starter themes

A starter theme is a whole-app look built on a brand: the brand's colours,
radius and status (through `brandRoleVariables`), plus what a brand leaves at
the Genesis default and a product's character mostly lives in: the sidebar,
a card that differs from the page, the font stacks and the shell's density.
Each follows the feel of a kind of product people already know how to use,
with Genesis's own palette. Every one reaches WCAG AA on every pair
genesis-ui draws (`STARTER_THEME_PAIRS`), light and dark, and passes the brand
contrast check.

| Theme | Feel | Suits | Density |
|---|---|---|---|
| `tracker` | keyboard-first issue trackers: cool greys, a sparing indigo, small corners | issues, projects, roadmaps | compact |
| `repository` | code hosting: hairlines, green actions, blue links, system type | admin, data, settings | compact |
| `checklist` | personal task managers: warm white, a confident red, a tinted open list | tasks, today, goals | comfortable |
| `notebook` | document workspaces: white page, warm grey ink, a warm sidebar | docs, meetings, team | comfortable |
| `press` | website dashboards: a dark rail, a grey canvas with white cards | website, pages, media | compact |
| `journal` | journaling and reading: paper ground, serif headings, sage | journal, habits, reading | comfortable |
| `arena` | training trackers: a black rail, hot orange, condensed headings | training, workouts, classes | comfortable |

**As is:** import the stylesheet after `genesis.css` and the Tailwind bridge,
then set `data-theme` on `<html>` for the whole app (portalled menus and
dialogs included) or on any element for a part of it. Dark mode follows the
`.dark` class, on the same element or an ancestor, and the selectors outrank a
plain `:root` override, so an app's own brand comes back when the attribute is
removed. Pass the theme's density to `AppShell`, and load the fonts it names
(each stack falls back to system fonts).

```css
@import "@marktiderman/genesis-design-system/themes/genesis.css";
@import "@marktiderman/genesis-design-system/themes/genesis-tailwind4.css";
@import "@marktiderman/genesis-design-system/themes/starter.css";
```

```ts
import { getStarterTheme, starterThemeContrastProblems } from "@marktiderman/genesis-design-system/starter-themes";

const theme = getStarterTheme("notebook");
document.documentElement.dataset.theme = theme?.id;
const density = theme?.shell?.density ?? "comfortable"; // for AppShell
starterThemeContrastProblems(theme!); // [] for every shipped theme
```

**As a starting point:** copy one into your own with `defineStarterTheme`,
which checks it (and its brand) and throws with every problem. `roles` sets
any theme role by hand, per mode, over the brand's; `fonts` sets `--font-sans`,
`--font-display` and `--font-mono`. `starterThemeCss(theme)` renders it scoped
to `data-theme`, and `starterThemeVariables(theme)` gives the variable maps.

```ts
import { defineStarterTheme, notebookTheme, starterThemeCss } from "@marktiderman/genesis-design-system/starter-themes";

export const ledger = defineStarterTheme({
  ...notebookTheme,
  name: "ledger",
  label: "Ledger",
  description: "Quiet and exact, for finance screens.",
  feel: "accounting tools",
  suits: ["invoices", "reports"],
  brand: { ...notebookTheme.brand, name: "ledger", accent: { DEFAULT: "#0f766e" } },
  shell: { density: "compact" },
});
const css = starterThemeCss(ledger); // [data-theme="ledger"] { … }
```

A starter theme is the customization layer's Brand level (ADR 0013): no
component renders differently because of one.

## The colour engine

`palette({ primary, primaryDark?, secondary?, ground })` turns brand colours
into roles for light and dark. It works in OKLCH and emits sRGB hex, so every
contrast is measured on what is printed.

- **Ramps:** 11 steps (50 … 950) at fixed lightness; chroma follows the
  brand's, capped to the sRGB gamut and eased at both ends; the brand's own
  hex sits on its nearest step.
- **Neutrals** take the ground's hue at very low chroma: `paper` (warm),
  `chalk` (cool), `pure` (the brand's hue, near-white) or `night`. Ink is
  never black and the ground is never white (`pure` is L 0.995).
- **The accent** has a fill (the brand colour as given, for buttons and
  bands) and a text form (walked down its ramp until it reads at 4.5:1 on the
  page, a card and a sunk band). Text on the fill is the tinted ink or ground
  when one reads at 4.5:1, else white or black. A neon brand keeps its neon
  buttons, with dark text on them.
- **Solved, not just checked:** quiet text (4.5:1 on the page, cards and sunk
  bands), the focus ring (3:1 on every surface), a form field's edge (3:1),
  and the least wash over a photo that keeps text at 4.5:1 over a white or a
  black photo. The solver aims a little above each minimum, so values printed
  as HSL triplets still pass.
- **Dark mode** is its own solve on `night`, with the fill's chroma cut 12%
  (or the brand's own `primaryDark`).

`rolePairs(roles)` lists every pair with its minimum; `contrast(a, b)` is the
WCAG ratio. A test sweeps 24 hues × 5 lightnesses × 3 chromas × 4 grounds,
light and dark, with a secondary colour, and every pair passes.

## Fonts

`FONT_CHOICES` is the list a brand picks from (System, Inter, DM Sans, Work
Sans, Montserrat, Poppins, Space Grotesk, Source Serif, Merriweather,
Playfair Display, Lora, Barlow, Barlow Condensed, Oswald, Roboto Condensed,
Bebas Neue), each with its stack, weights and class. `SELF_HOSTED_FONTS`
names the `@fontsource` package behind each; genesis-sites builds and serves
the files. `fontForStack(stack)` finds the choice a font stack starts with.
A new family needs an entry here and its `@fontsource` package in
genesis-sites.

## License

MIT
