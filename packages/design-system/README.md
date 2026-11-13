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

## App brands and app styles

How an app looks is two independent choices here (ADR 0018), each set with
its own attribute on `<html>` (the whole app, menus and dialogs included) or
on any element:

- An **app brand** (`data-app-brand`) is colours and typefaces: a
  `CanonicalBrand` (colours and status, light and dark, solved for contrast),
  colour `roles` set by hand (the sidebar, a card apart from the page) and
  `fonts`.
- An **app style** (`data-app-style`) is every component's size and shape,
  with no colours of its own: component tokens, part styles and raw CSS. Its
  colours come from whatever brand is set, so any brand goes with any style:
  your own brand with the `tracker` style, the Genesis brand with `press`.

Neither changes what a component does, what it shows or who may see it. An
**app theme**, which bundles a brand, a style and a layout under one name, is
genesis-ui's (`@marktiderman/genesis-ui/themes`), because a layout is the
components'. Light, dark or system is the person's **appearance**
(`GenesisThemeProvider`, `data-theme`), which neither sets.

| Piece | Layer | What it changes | Example |
|---|---|---|---|
| brand | `brand` | colours and status, solved for contrast | `accent: { DEFAULT: "#5753d6" }` |
| brand | `roles` | any colour role by hand, per mode | `{ light: { "sidebar-background": "#1d2327" } }` |
| brand | `fonts` | `--font-sans`, `--font-display`, `--font-mono` | `{ display: '"Lora", Georgia, serif' }` |
| style | `tokens`, `darkTokens` | component tokens: sizes, corners, type sizes and weights | `{ radius: "0.25rem", "control-height": "2rem" }` |
| style | `parts`, `darkParts` | CSS declarations for any part, colours from roles | `{ "shell-nav-item[active]": { "box-shadow": "inset 3px 0 0 hsl(var(--primary))" } }` |
| style | `css` | raw CSS nested in the style's scope | `` `[data-slot="button"]:active { transform: translateY(1px); }` `` |

**Component tokens** (`COMPONENT_TOKENS`) are CSS variables genesis-ui reads in
place of fixed classes: `radius` (the base every corner scales from),
`--control-height` (and `-sm`, `-lg`), `--control-padding-x`,
`--control-radius`, `--control-font-weight`, `--control-text-transform`,
`--control-letter-spacing`, `--control-shadow`, `--input-padding-x`,
`--input-border-width`, `--input-shadow`, `--focus-ring-width`,
`--focus-ring-offset`, `--card-radius`, `--card-border-width`, `--card-shadow`,
`--card-padding`, `--popover-radius`, `--popover-shadow`, `--overlay-shadow`,
`--badge-*`, `--table-*`, `--title-*`, `--page-title-*` and
`--sidebar-item-*`. `themes/genesis.css` declares each at what the component's
class said before, so an app that sets none looks as it did, and a
`className` on one instance still wins over a token. A brand leaves `--radius`
to the style unless it names a radius itself.

**Parts** (`THEME_PARTS`) are genesis-ui's named pieces: every one renders
`data-slot="<name>"` with the attributes listed for it, and genesis-ui's tests
hold it to the list. A part selector is a part name, `[attribute]` or
`[attribute=value]` filters, one state (`:hover`, `:focus-visible`,
`:active`, `:disabled`, …), and up to three of those nested with spaces:
`button[variant=outline][size=sm]:hover`, `shell-sidebar shell-nav-item[active]`.
`root` is the styled element itself. Name an app's own parts `app-<name>`.
In a style, colour properties (`color`, `background`, `border`, …) take
colours from roles only (`hsl(var(--primary))`), which `defineAppStyle`
checks. A part style beats the component's own classes, and a `className` on
one instance too, so scope it when one instance must differ.

Seven of each ship as **starters**, in matching pairs (`style.pairsWith`);
genesis-ui's starter themes add a layout to each:

| Name | Brand (colours, typefaces) | Style (size and shape) |
|---|---|---|
| `tracker` | cool greys, a sparing indigo, Inter | 32px controls, flat cards, tight tables |
| `repository` | green actions, blue links, system type and mono | crisp controls, grey outlined buttons, shaded headings, a marked active item |
| `checklist` | warm white, a confident red, a red-tinted open list | firm controls, soft cards, round checkboxes |
| `notebook` | white page, warm grey ink, a warm sidebar, a calm blue | borderless cards, ruled tables, square-ish tags |
| `press` | a dark rail, a grey canvas with white cards, a steady blue | square cards, a filled active item, outlined buttons |
| `journal` | paper ground, sage, serif headings over a soft sans | pill buttons and fields, soft lifted cards, serif titles |
| `arena` | a black rail, hot orange, condensed headings | capitals, tight corners, a marked active item, a press that sinks |

Every starter brand reaches WCAG AA on every pair genesis-ui draws
(`APP_BRAND_PAIRS`, the sidebar's active item included), light and dark, and
passes the brand contrast check.

**Use them:** import the stylesheet unlayered, after `genesis.css` and the
Tailwind bridge, then set either attribute or both. Dark mode follows the
`.dark` class. Load the fonts the brand names (each stack falls back to
system fonts).

```css
@import "@marktiderman/genesis-design-system/themes/genesis.css";
@import "@marktiderman/genesis-design-system/themes/genesis-tailwind4.css";
@import "@marktiderman/genesis-design-system/themes/starter.css";
```

```ts
import { appBrandContrastProblems, getStarterBrand, getStarterStyle } from "@marktiderman/genesis-design-system/app-styles";

document.documentElement.dataset.appStyle = getStarterStyle("press")?.id; // size and shape
document.documentElement.dataset.appBrand = getStarterBrand("notebook")?.id; // colours and typefaces
appBrandContrastProblems(getStarterBrand("notebook")!); // [] for every starter brand
```

**Make your own:** `defineAppBrand` and `defineAppStyle` check every layer
and throw with every problem. `appBrandCss` and `appStyleCss` render each
scoped to its attribute; `appBrandVariables` and `appStyleVariables` give the
variable maps.

```ts
import { appStyleCss, defineAppStyle, notebookStyle } from "@marktiderman/genesis-design-system/app-styles";

export const ledger = defineAppStyle({
  ...notebookStyle,
  name: "ledger",
  label: "Ledger",
  description: "Quiet and exact, for finance screens.",
  feel: "accounting tools",
  suits: ["invoices", "reports"],
  tokens: { ...notebookStyle.tokens, "table-cell-padding-y": "0.25rem", "table-head-text-transform": "uppercase" },
  parts: { "table-cell": { "font-variant-numeric": "tabular-nums" } },
});
const css = appStyleCss(ledger); // [data-app-style="ledger"] { … }, in any brand's colours
```

Brands and styles are code an app ships and reviews; `css` is trusted as
written, so never build either from what a user types.

### A brand's name, logo and mark

An app brand also carries what people call the app and how it looks in the
corner: `appName` (the shell's title), `logo` (the full wordmark) and `mark`
(the square icon for the collapsed rail, a tab, a phone's header). Each image
is an `https:` URL, a path from the site's root or an inline `data:image/…`,
with `alt` text (empty for a mark beside the name) and, if it doesn't read on
a dark ground, a `darkSrc`. `defineAppBrand` checks them. genesis-ui's
`appShellBrandProps(brand)` gives `AppShell` its `appName` and `logo`.

```ts
import { defineAppBrand, getStarterBrand } from "@marktiderman/genesis-design-system/app-styles";

export const acme = defineAppBrand({
  name: "acme",
  label: "Acme",
  description: "Acme's colours, type and logo.",
  brand: { ...getStarterBrand("tracker")!.brand, name: "acme" },
  appName: "Acme Studio",
  logo: { src: "/brand/acme.svg", alt: "Acme Studio", darkSrc: "/brand/acme-dark.svg" },
  mark: { src: "/brand/acme-mark.svg", alt: "" },
});
```

### How the brand shapes relate

Genesis has four shapes that hold a brand. One is the source; the others are
read from it or name it:

| Shape | Where | What it is | Relation |
|---|---|---|---|
| `CanonicalBrand` | design-system (`schema/brand`) | colours, status, radius, typography: the colour engine's input | the source of colour |
| `AppBrand` | design-system (`app-styles`) | a named brand an app wears with `data-app-brand`: a `CanonicalBrand` plus hand-set `roles`, `fonts`, `appName`, `logo`, `mark` | wraps a `CanonicalBrand` (`appBrand.brand`) |
| `PublicBrand` | genesis-ui (`layout/brand-theme`) | a public page's accent and images (`logoUrl`, `headerImageUrl`), often typed in by an organization | a page-level override, painted with `brandThemeStyle`; never an app brand |
| `WorkspaceTheme` | genesis-core (`workspaces`) | an organization's `accent`, its app brand by id (`brand`) and its appearance defaults | names an `AppBrand` by id (`resolveWorkspaceBrand`); its `accent` recolours the workspace's own tile |

No converters ship between them: an `AppBrand`'s `brand` is already its
`CanonicalBrand`, and a `PublicBrand` or a `WorkspaceTheme.accent` comes from
what people type, which never becomes an app brand (brands are code an app
ships). Light, dark or system is none of these: it is the person's
appearance (`GenesisThemeProvider`; `Appearance` is its `ThemeMode`).

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
