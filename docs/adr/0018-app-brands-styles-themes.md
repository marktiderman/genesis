# ADR 0018: App brands, app styles and app themes

- Status: proposed
- Date: 2026-11-13
- Features: `app-themes`
- Related: ADR 0013 (the customization layer), ADR 0005 (package layers), ADR 0003 (navigation
  zones), packages/design-system README ("App brands and app styles"), packages/ui README
  ("App themes"), docs/GLOSSARY.md

## Context

A Genesis app can change its colours, radius and fonts (a brand, ADR 0013 level 2), and nothing
else about how its components look. Every other value is fixed in genesis-ui's classes: a button
is `h-10 px-4 rounded-md font-medium`, a card `rounded-xl border shadow-sm p-6`, a column heading
`h-10 font-medium`. So every Genesis app looks like every other one with a different accent, and
an app that wants a dense issue tracker, a calm journal and a loud training screen has no way to
get them short of copying components, which ADR 0013 rule 3 forbids (no eject).

Site themes on publishing platforms show what's wanted: one package that changes the colours,
the type, every component's shape and the page layout, without touching the content or the code
that runs it. `pnpm features find theme` finds `design-systems` (sites' look rules, `--ds-*`
tokens that genesis-ui's app chrome doesn't read) and `design-tokens` (the colour roles); neither
reaches a component's size or shape.

How an app looks is several separate choices, and different people make them: an organization
picks its colours, the app picks how each area is laid out, and each person picks light or dark.
Keeping them in one object would mean every pairing is a new object to make. This ADR splits the
look into pieces that combine freely and names each one, so the docs, the code and the design
library use the same words.

## Decision

1. **Component tokens.** genesis-design-system declares `COMPONENT_TOKENS`
   (`src/tokens/component-tokens.ts`): CSS variables for what a component draws other than colour,
   in groups: controls (`--control-height`, `-padding-x`, `-radius`, `-font-weight`,
   `-text-transform`, `-letter-spacing`, `-shadow`, the `-sm`/`-lg` sizes), fields
   (`--input-padding-x`, `-border-width`, `-shadow`), focus (`--focus-ring-width`, `-offset`),
   surfaces (`--card-*`, `--popover-*`, `--overlay-shadow`), badges, tables, titles, page titles
   and sidebar items. `themes/genesis.css` declares each at the value genesis-ui's class had, and
   genesis-ui reads the variable in its place (`h-[var(--control-height)]`), so an app that sets
   none looks exactly as before. A caller's `className` still wins (tailwind-merge resolves the
   token class like the fixed one).
2. **Parts.** genesis-design-system declares `THEME_PARTS` (`src/tokens/theme-parts.ts`): the named
   pieces of genesis-ui a style may change, each an element with `data-slot="<name>"` and the
   `data-*` attributes listed (`button` with `data-variant` and `data-size`, `shell-nav-item` with
   `data-active`, `shell` with `data-density`…). The list is a public contract: genesis-ui's test
   fails a part that isn't rendered, a token no component reads and a token a component reads
   that isn't declared. A renamed part is a breaking change. An app's own parts are named
   `app-<name>`.
3. **Brand and style, in design-system.** Two independent choices, each with its own attribute,
   so any brand goes with any style. Both are presentation only, so both live in the foundation
   package that holds the tokens (`@marktiderman/genesis-design-system/app-styles`):
   - an **app brand** (`defineAppBrand`, `[data-app-brand="<id>"]`): colours and typefaces. A
     `CanonicalBrand`, `roles` (colour roles by hand, per mode) and `fonts`.
     `appBrandContrastProblems` checks the pairs genesis-ui draws, sidebar included.
   - an **app style** (`defineAppStyle`, `[data-app-style="<id>"]`): every component's size and
     shape. `tokens` / `darkTokens` (the base `radius` among them: corners are shape; type sizes
     and weights too), `parts` / `darkParts` (declarations per part selector: `card`,
     `button[variant=outline]:hover`, `shell-sidebar shell-nav-item[active]`) and raw `css` nested
     in its scope. It holds no colours: in its part styles, colour properties take colours from
     roles only (`hsl(var(--primary))`), which `defineAppStyle` checks, so a style recolours with
     whatever brand is set.

   The seam: typefaces are the brand's, type sizes and weights are the style's. Seven starter
   brands and seven starter styles ship in matching pairs (`pairsWith`), in
   `themes/starter.css`, brands first.
4. **The theme bundles them, in genesis-ui.** An **app theme** (`defineAppTheme`,
   `@marktiderman/genesis-ui/themes`) is a named bundle: a `brand`, a `style` and a `layout` (the
   `AppShell` options it starts from: density, rail width, a collapsed rail, sub-navigation).
   Each is optional; a piece left out keeps the app's own. A layout is the components', so the
   bundle sits a layer above design-system: design-system never imports genesis-ui, and the
   brand and the style stay presentation only. `appThemeAttributes(theme)` gives the attributes
   to set and `appShellOptionsFromTheme(theme)` the shell options. Seven starter themes ship, one
   per starter style, with no brand, so an app wears them in its own colours
   (`withPairedBrand` wears one in the brand it was designed with). The later look pieces (the
   default view types, how a record opens, widgets) join the bundle as they ship, each with its
   own ADR.
5. **A theme sets defaults; the person decides.** A theme's layout is a starting point. Density
   and the rail are the person's to change wherever `AppShell` is `configurable`, and their stored
   choice wins over the theme; an app keeps one fixed with `lockedOptions`. Light, dark or system
   is the person's **appearance** (`GenesisThemeProvider`, `data-theme`), which no brand, style or
   theme sets.
6. **Precedence.** Variables first (a style's selectors outrank `:root` and `.dark`), then part
   styles, then `css`. Brands render before styles, so a style's corners win where both are on
   one element. The stylesheet is imported unlayered, so part styles beat the components' utility
   classes, which sit in Tailwind's layers; that is what lets a part style change anything. A
   style reaches for the lowest layer that does the job: tokens before parts, parts before `css`.
7. **The attributes are `data-app-brand` and `data-app-style`**, not `data-theme`, which
   `GenesisThemeProvider` already uses for the appearance (and the tooltip mirrors onto its
   portal). A theme has no attribute of its own: it is what sets the other two.
8. **Presentation only, for brand and style.** Neither changes what a component does, what data it
   shows or who may see it. Both are code an app ships and reviews; `css` is trusted as written,
   and neither is built from what a user types. Validation refuses values that could end a
   declaration or a rule, `@import`, `url(` in tokens, and CSS whose braces don't balance.

## Glossary

- **app brand**: an app's colours and typefaces (`defineAppBrand`, `data-app-brand`). Don't use
  for corners or spacing; those are the style's.
- **app style**: every component's size and shape: component tokens, part styles and raw CSS, with
  no colours of its own (`defineAppStyle`, `data-app-style`). Don't use: skin, design system
  (that's sites' look rules).
- **app theme**: the bundle of a brand, a style and a layout (`defineAppTheme`, genesis-ui).
  Don't use for light and dark.
- **appearance**: light, dark or system, the person's choice (`GenesisThemeProvider`). Don't use:
  theme, mode.
- **layout**: how an app is navigated and framed, and its page templates; in a theme, the shell
  options it starts from.
- **component token**: a token a component reads for its size, shape or type (`COMPONENT_TOKENS`).
- **part**: a named piece of a component a style can change, marked `data-slot="<name>"`
  (`THEME_PARTS`). Don't use: slot (a slot is a fill), selector.

## Alternatives

- **A component-override registry** (`components: { Card: MyCard }`, as some UI kits offer): lets
  a theme replace markup, which is an eject by another name (ADR 0013 rule 3) and breaks
  behaviour, accessibility and the phone twin. Markup changes stay slots and composition.
- **Per-component class overrides in a React provider** (variants and classNames from context):
  needs every component to read context, doesn't reach portalled or third-party parts, and can't
  be scoped to part of a page. Part styles do the same in CSS and scope by attribute.
- **One object holding colours, shape and layout together** (this ADR's first draft): an app could
  only take a starter's look whole; keeping its own brand with another style meant copying it.
- **The bundle in design-system:** a theme that picks a layout (and later view types and widgets)
  names genesis-ui's options, and genesis-ui depends on design-system, so the two packages would
  depend on each other. It would also make a design-system object change behaviour.
- **Only tokens, no part styles:** every new need would be a new token in Genesis first. Tokens
  cover the common dimensions; parts and `css` cover the rest without a release.
- **Putting the styles in a cascade layer** below utilities: a caller's className would win, but
  so would the component's own classes, so a part style could change nothing they set.

## Consequences

- genesis-ui's core components (button, fields, select, card, badge, popover, menus, tooltip,
  dialog, sheet, table, tabs, checkbox, switch, label, page titles, the AppShell) read component
  tokens and carry their parts. Rendering is unchanged at the defaults (the suite passes as it
  was).
- A part style also beats a `className` on one instance. A style that changes a part changes it
  everywhere; an app that needs one instance different scopes the part (`card[variant=…]`, an
  `app-` part around it) or uses a token.
- ADR 0013's level 2 ("Brand") now holds two pieces: brand and style. The theme sits across
  levels 1 (the layout's options) and 2.
- Native (genesis-ui-native) reads none of this yet: tokens map naturally to NativeWind
  variables, parts don't. Planned with its own feature when a native app needs it.
- Menus and dialogs portal to `body`, so a brand or style set on part of a page doesn't reach
  them; set them on `<html>` for a whole app. A theme per area of an app (a zone, ADR 0003) is set
  on `<html>` while that area is open, for the same reason.
