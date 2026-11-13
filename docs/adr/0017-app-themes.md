# ADR 0017: App themes: component tokens, parts and the shell, in one theme

- Status: proposed
- Date: 2026-11-13
- Features: `app-themes`
- Related: ADR 0013 (the customization layer), ADR 0003 (navigation zones), packages/design-system README ("App themes"), docs/GLOSSARY.md

## Context

A Genesis app can change its colours, radius and fonts (a brand, ADR 0013 level 2), and nothing
else about how its components look. Every other value is fixed in genesis-ui's classes: a button
is `h-10 px-4 rounded-md font-medium`, a card `rounded-xl border shadow-sm p-6`, a column heading
`h-10 font-medium`. So every Genesis app looks like every other one with a different accent, and
an app that wants a dense issue tracker, a calm journal and a loud training screen has no way to
get them short of copying components, which ADR 0013 rule 3 forbids (no eject).

Site themes on publishing platforms show what's wanted: one package that changes the colours,
the type, every component's shape and the page layout, without touching the content or the
code that runs it. `pnpm features find theme` finds `design-systems` (sites' look rules,
`--ds-*` tokens that genesis-ui's app chrome doesn't read) and `design-tokens` (the colour roles);
neither reaches a component's size or shape.

## Decision

1. **Component tokens.** genesis-design-system declares `COMPONENT_TOKENS`
   (`src/tokens/component-tokens.ts`): CSS variables for what a component draws other than
   colour, in groups: controls (`--control-height`, `-padding-x`, `-radius`, `-font-weight`,
   `-text-transform`, `-letter-spacing`, `-shadow`, the `-sm`/`-lg` sizes), fields
   (`--input-padding-x`, `-border-width`, `-shadow`), focus (`--focus-ring-width`, `-offset`),
   surfaces (`--card-*`, `--popover-*`, `--overlay-shadow`), badges, tables, titles, page titles
   and sidebar items. `themes/genesis.css` declares each at the value genesis-ui's class had, and
   genesis-ui reads the variable in its place (`h-[var(--control-height)]`), so an app that sets
   none looks exactly as before. A caller's `className` still wins (tailwind-merge resolves the
   token class like the fixed one).
2. **Parts.** genesis-design-system declares `THEME_PARTS` (`src/tokens/theme-parts.ts`): the
   named pieces of genesis-ui a theme may style, each an element with `data-slot="<name>"` and
   the `data-*` attributes listed (`button` with `data-variant` and `data-size`,
   `shell-nav-item` with `data-active`, `shell` with `data-density`…). The list is a public
   contract: genesis-ui's test fails a part that isn't rendered, a token no component reads and a
   token a component reads that isn't declared. A renamed part is a breaking change. An app's own
   parts are named `app-<name>`.
3. **App themes.** `@marktiderman/genesis-design-system/app-themes` exports `defineAppTheme`: a
   brand, plus `roles` (colour roles by hand, per mode), `fonts`, `tokens` / `darkTokens`,
   `parts` / `darkParts` (declarations per part selector: `card`,
   `button[variant=outline]:hover`, `shell-sidebar shell-nav-item[active]`), raw `css` nested in
   the theme's scope, and `shell` (AppShell's density, rail width, collapsed rail, sub-navigation).
   `appThemeCss` renders it scoped to `[data-app-theme="<id>"]`, light and `.dark`;
   `appThemeContrastProblems` checks the pairs genesis-ui draws, sidebar included. Seven starter
   themes ship, in `themes/starter.css`.
4. **Precedence.** Variables first (a theme's selectors outrank `:root` and `.dark`), then part
   styles, then `css`. The theme stylesheet is imported unlayered, so part styles beat the
   components' utility classes, which sit in Tailwind's layers; that is what lets a part style
   change anything. A theme reaches for the lowest layer that does the job: tokens before parts,
   parts before `css`.
5. **The attribute is `data-app-theme`**, not `data-theme`, which `GenesisThemeProvider` already
   uses for light and dark mode (and the tooltip mirrors onto its portal).
6. **The shell.** genesis-ui exports `appShellOptionsFromTheme(theme)`, the AppShell options the
   theme asks for, to spread under the app's own.
7. **Presentation only.** A theme never changes what a component does, what data it shows or who
   may see it. Themes are code an app ships and reviews; `css` is trusted as written, and a theme
   is never built from what a user types. Validation refuses values that could end a declaration
   or a rule, `@import`, `url(` in tokens, and CSS whose braces don't balance.

## Glossary

- **app theme**: a whole-app look: colours, fonts, component tokens, part styles and the shell's
  layout (`defineAppTheme`). Don't use: skin, template, design system (that's sites' look rules),
  brand (identity only), theme alone where light and dark mode could be meant.
- **component token**: a token a component reads for its size, shape or type (`COMPONENT_TOKENS`).
- **part**: a named piece of a component a theme can style, marked `data-slot="<name>"`
  (`THEME_PARTS`). Don't use: slot (a slot is a fill), selector.

## Alternatives

- **A component-override registry** (`components: { Card: MyCard }`, as some UI kits offer):
  lets a theme replace markup, which is an eject by another name (ADR 0013 rule 3) and breaks
  behaviour, accessibility and the phone twin. Markup changes stay slots and composition.
- **Per-component class overrides in a React provider** (variants and classNames from context):
  needs every component to read context, doesn't reach portalled or third-party parts, and can't
  be scoped to part of a page. Part styles do the same in CSS and scope by attribute.
- **Only tokens, no part styles:** every new need would be a new token in Genesis first. Tokens
  cover the common dimensions; parts and `css` cover the rest without a release.
- **Putting the theme's styles in a cascade layer** below utilities: a caller's className would
  win, but so would the component's own classes, so a part style could change nothing they set.

## Consequences

- genesis-ui's core components (button, fields, select, card, badge, popover, menus, tooltip,
  dialog, sheet, table, tabs, checkbox, switch, label, page titles, the AppShell) read component
  tokens and carry their parts. Rendering is unchanged at the defaults (the suite passes as it
  was).
- A part style also beats a `className` on one instance. A theme that styles a part takes on
  that part's look everywhere; an app that needs one instance different scopes the part
  (`card[variant=…]`, an `app-` part around it) or uses a token.
- Native (genesis-ui-native) reads none of this yet: tokens map naturally to NativeWind
  variables, parts don't. Planned with its own feature when a native app needs it.
- Menus and dialogs portal to `body`, so a theme set on part of a page doesn't reach them; set
  it on `<html>` for a whole app.
