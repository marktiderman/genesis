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
| `./schema/brand`, `./schema/brand.schema.json` | `CanonicalBrand`, `validateBrand`, and the JSON Schema. |
| `./themes/genesis.css`, `./themes/genesis-tailwind4.css` | The default theme and the Tailwind v4 bridge. |
| `./tokens`, `./tokens/native`, `./presets/*`, `./theme`, `./providers/native` | Tokens, presets and the theme provider. |

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
| `motion` | `none`, `calm`, `lively`, `bold` (CSS only; reduced motion means none) |

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
| `surfaces` | `--ds-ground`, `--ds-ground-raised`, `--ds-ground-sunk`, `--ds-ink`, `--ds-ink-quiet`, `--ds-border`, `--ds-input-border`, `--ds-accent-{fill,text,edge,tint}`, `--ds-on-{accent,tint,inverse}`, `--ds-inverse`, `--ds-focus`, `--ds-scrim-full`, `--ds-secondary-*`, and genesis-ui's roles (`--background`, `--primary`, `--muted-foreground`, … as HSL triplets) |
| `image` | `--ds-image-filter`, `--ds-image-grain` |
| `motion` | `--ds-ease-{out,swift,in-out}`, `--ds-dur-{press,hover,ui,reveal,media}`, `--ds-reveal` and `--ds-reveal-phone` (the keyframes to run, `ds-rise` or `ds-clip`, which the host's stylesheet defines), `--ds-reveal-distance`, `--ds-reveal-range`, `--ds-hover-lift` |

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
