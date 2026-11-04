# The Genesis design library

How Figma and the code stay one system: one Figma library whose variables are the design
system's CSS variables and whose components are genesis-ui-native's exports, a Brand collection
with one mode per consumer app, and Code Connect templates that show a designer the Genesis
call for the component they selected. Feature: `figma-design-library` in `features.ts`.

Working practice for agents (app files, gaps, publishing, the MCP) is in [FIGMA-GUIDELINES.md](FIGMA-GUIDELINES.md).

## One library file

The library is a single Figma file, **Genesis**. It holds two kinds of things.

**Foundations** are variable collections named after the CSS variables in
`packages/design-system`, so a token has the same name in Figma, in the theme CSS and in
Tailwind or NativeWind:

| Collection | Variables | Code |
| --- | --- | --- |
| Colour roles | `background`, `foreground`, `card`, `primary`, `primary-foreground`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `success`, `warning`, `info`, the `sidebar-*` set | the roles `renderThemeCss` writes as `--<name>` in `themes/*.css` |
| Radius | `radius` (with the `sm`/`md`/`lg` steps) | `--radius` |
| Spacing | the space scale | `--spacing-*` |
| Typography | `font-sans`, `font-display`, `font-mono`, the size and weight steps | `--font-*`, `--text-*`, `--font-weight-*` |

A role has a light and a dark mode in Figma, as it has in the CSS. A variable with no CSS
counterpart does not go in the library: add the token to `packages/design-system` first, then
mirror it.

**Components** are named after genesis-ui-native exports: `NativeButton`, `NativeCard`,
`SettingsPage`, `AuthScreen`. A component's React props are its Figma properties, with the same
names and the same values (`variant`: `default`, `outline`, `ghost`; `size`: `sm`, `md`, `lg`).
Sub-parts (`NativeCardHeader`, `NativeDialogTitle`) are layers inside the parent component, not
components of their own. The list of components the library is expected to cover is what
`pnpm check:code-connect` prints (below).

## Brands: one mode per consumer app

Every app on Genesis has a `CanonicalBrand` (`packages/design-system/src/schema/brand.ts`):
neutral, surface, text and accent scales, status colours, typography, spacing, radius, shadows.
The factories turn it into the app's theme (`tailwindFromBrand` for the web, `themeFromBrand`
for NativeWind, `brandRoleVariables` for the role values a theme provider sets at runtime).

The library has one **Brand** collection with one mode per consumer app, named after the app's
brand. It holds only the roles a brand drives (`brand/primary`, `brand/primary-foreground`,
`brand/primary-dark`, `brand/signal`, `brand/link`, the chat bubble roles, `brand/font-sans`,
`brand/font-display`), each aliased to a primitive in the **Primitives** collection
(`<brand>/<colour>`). The **Color** collection's roles alias into Brand where a role is
brand-driven and stay on the Genesis neutrals where it is not, so a mode switch recolours every
component without a second set of role variables. Light and dark are modes of Color; brand is a
mode of Brand; a page sets both. `primary` follows `brandRoleVariables`: the Light mode aliases
`brand/primary`, the dark modes alias `brand/primary-dark`, which is the accent when it reads at
4.5:1 on the dark background and the Genesis dark primary otherwise.

A mode's values come from the brand file, by the same mapping the factories use:

```sh
npx tsx scripts/figma-brand-modes.mts path/to/brand.ts > brand-modes.json
```

prints, per brand, the value of every Brand variable for that brand's mode (worked out by
`brandRoleVariables`; the signal, link and bubble roles default to the primary), the base radius
in px, and the full light and dark role maps for reference. Add the primitives and the mode in
Figma from the `brand` entries; when a brand changes in code, regenerate and update the mode. The mode is derived; the
brand file is the source, as it is for the theme CSS.

An app's Figma file **subscribes** to the Genesis library and sets its pages to its Brand mode.
Nothing is copied: a change to a component or a token in the library reaches every app's file as
a library update, and a brand change is a change to one mode. Designing a new app means a new
mode generated from its brand, not a new library.

The Professional plan allows ten modes per collection (see Plan limits), so ten brands at a
time; the eleventh needs Organization.

## Code Connect

Code Connect maps a Figma component to the code that renders it, so Dev Mode shows
`<NativeAvatar fallback="MT" size={40} />` instead of generic React Native. Genesis uses the
CLI v2 "parserless" templates: one file per component in `packages/ui-native/figma/`,
`<Name>.figma.ts`, and `figma.config.json` at the repo root points the CLI at that folder.

A template starts with three directives, then the mapping:

```
// url=https://www.figma.com/design/<file>/Genesis?node-id=<node>
// source=packages/ui-native/src/components/avatar.tsx
// component=NativeAvatar
```

`url` is the library node the template maps; `source` is the component's file from the repo
root (it must exist); `component` is the export, and equals the file name. The body reads the
selected instance's properties (`figma.selectedInstance`) and returns the example, its imports
and an id. `packages/ui-native/figma/NativeAvatar.figma.ts` is the reference template.

Publish from the repo root:

```sh
FIGMA_ACCESS_TOKEN=… npx @figma/code-connect connect publish --label React
```

The token is a Figma personal access token with the scopes `file_content:read` and
`file_code_connect:write`. It is never committed; put it in the shell for the publish, or in
the CI secret the publish job reads. `--label React` is required: a raw template publishes under
the label "Code" by default, and the label is the framework Figma's plan setting checks (see Plan
limits), which the admin picker cannot set to "Code". `npx @figma/code-connect connect unpublish`
removes a mapping; `connect parse` checks the templates without publishing.

The templates folder is not shipped: `packages/ui-native/package.json` `files` lists `dist`,
`src` and `README.md`, so a template change needs no changeset.

### The ratchet: `pnpm check:code-connect`

`scripts/check-code-connect.mjs` covers genesis-ui-native, genesis-ui, genesis-chat, and the
genesis-native, genesis-notifications, genesis-product, genesis-forms-native, genesis-forms-web,
genesis-sites and genesis-studio packages below. The first three: genesis-ui-native (the `Native*`
components and the page layouts), genesis-ui for the web (its PascalCase exports, minus
sub-parts, typography, auto-layout primitives and cell formatters), and genesis-chat (the
PascalCase exports of `/native` and `/web`, minus hooks, providers and the non-visual
`ChatAutoRetry` and `ChatErrorBoundary`). Each keeps its own allowlist beside its templates:
`packages/ui-native/figma/code-connect.json`, `packages/ui/figma/code-connect.json`, and for chat
one per entry point, `packages/chat/figma/native/` and `packages/chat/figma/web/` (both export a
`ChatComposer`, a `ChatTopicBar` and more under the same name, so each is checked as its own
package: `chat-native`, `chat-web`). `--list <package>` prints the discovered names.

Chat's components are on the library pages **Chat · Native** and **Chat · Web**. The native ones
nest the Messages page's primitives (`Msg/Bubble`, `Msg/Tapback`, `Msg/TapbackBar`,
`Msg/RecordCard`, `NativeComposerBar`, `NativeZoomablePhoto`) as exposed instances rather than
redrawing them. Chat's screens, sheets of library parts and dispatchers (`ChatInboxScreen`,
`ChatPanel`, `ChatDock`, `MessageAttachments` on the web) are `composed`.

Three more packages follow the same pattern, each with its own allowlist:

- **genesis-native** (`native`, `packages/native/figma/`), page **Native · App**: the PascalCase
  exports of `.`, `/push` and `/updates`, minus the app plumbing (roots, boundaries, gates, error
  classes, `GenesisNativeApp` and its trivial `BootScreen`). The three error fallbacks are one
  component set, `FatalScreen`, with a `kind` variant (`app`, `screen`, `plain`); the templates
  for `FatalScreen`, `ScreenErrorScreen` and `PlainFatalScreen` each point at their variant.
  `NotificationSettings` is `composed` (a SettingsPage of library rows).
- **genesis-notifications** (`notifications-web`, `notifications-native`,
  `packages/notifications/figma/{web,native}/`), page **Notifications**, grouped by platform. Its
  entry points declare their components in the index itself, so the check reads
  `export function Name(` there. `NotificationRowView` and `NotificationBell` are library
  components; the feeds, preference tables and admin tables are `composed`. The React Email parts
  (`./email`) are not app UI and are not read.
- **genesis-product** (`product`, `packages/product/figma/`), page **Product**: `VoteButton`,
  `ProductWhatsNewSheet` (separate from genesis-native's `WhatsNewSheet`: product notes, with a
  Learn more per note) and `RoadmapDetailSheet`; the screens and the store wrapper are `composed`.

Four more cover the forms, sites and the data studio:

- **genesis-forms-native** (`forms-native`, `packages/forms-native/figma/`), page **Forms · Native**:
  its PascalCase exports minus contexts and ChoiceRow's parts (`Indicator`, `OptionImage`). The
  package draws with genesis-ui-native's primitives (`NativeButton`, `NativeText`, `NativeInput`,
  `NativeProgress`), colored from its own form theme, so its components are drawn to its own
  styles (bound to the Color variables). Its `Button` and `FieldChrome` are named `FormsNative/Button` and
  `FormsNative/FieldChrome` in Figma, apart from genesis-ui's `Button` and forms-web's
  `FieldChrome`. `FormFocus` (the whole screen), `NativeFieldRenderer` and `ContentStep`
  (dispatchers) are `composed`.
- **genesis-forms-web** (`forms-web`, `packages/forms-web/figma/`), page **Forms · Web**: `FieldChrome`,
  the header, brand, progress, navigation, ending and error-summary slots (`FormsWeb/…` in Figma)
  and the field renderers are library components with templates; `Form` is `composed`.
- **genesis-sites** (`sites`, `packages/sites/figma/`), page **Sites**: a section is a
  `defineSection` constant (data in a page document), not a component export, so the ratchet
  keys on the section's `type` string, read from the file each `*Section` in
  `src/sections/index.ts` is imported from: `hero`, `rich-text`… with templates `hero.figma.ts`.
  Each section is one 1440-wide component set with its variants as the `variant` option and a
  preset as sample content. Its template emits the `SectionNode` an app writes into a page
  (`{ id, type, v, variant, props }`), not JSX, since that is how sites use sections. Beside
  them, the shared parts the index re-exports (`SectionBand`, `SectionIntro`, `SectionTitle`,
  `ItemTitle`, `ButtonLink`, `TextLink`, `SiteImage`, `SiteFormHeader`) have JSX templates; the
  zod schemas exported under PascalCase names (`Anchor`, `IconName`) and the screen-reader-only
  `HiddenTitle` are excluded.
- **genesis-studio** (`studio`, `packages/studio/figma/`), page **Studio**: the toolbar parts,
  panels, views, record panel, dialogs, `FieldIcon` and `Pill` (`Studio/…` in Figma) have
  templates; `DataStudio` is `composed`.

Except forms-web's `DefaultEnding` (its title and description), these templates are a fixed
example, a bare `<X {...props} />` or sample values: they clear the ratchet but map no Figma
properties yet, so Dev Mode shows the import and not the props. "Required" means a template
exists, not that its properties are mapped.

```json
{ "required": ["NativeAvatar"], "notYet": ["NativeRangeSlider", "…"], "composed": ["SettingsPage", "…"] }
```

- A **required** component must have a template with the three directives, a `source` that
  exists and a `component` equal to the file name; otherwise the check fails.
- A **notYet** component is listed in the output and does not fail. The library does not have
  its node yet, so no template is written for it.
- A **composed** export is a screen assembled from library components (a settings page, an
  auth form, a sign-in button row) rather than a component of its own: a designer builds it in
  Figma from the components' instances, and Dev Mode already shows each instance's Genesis
  call, so it has no node and no template by design. It is counted apart in the output
  ("N composed, no template by design") and is not debt. Move a name out of `composed` when
  the library gives it a component of its own (into `notYet` until its template exists) or when
  a template is written for it anyway (into `required`): a `composed` name with a template fails.
- Every component is in exactly one list, and a name that is no longer exported fails: the
  allowlist only shrinks towards `required` and `composed`.

To promote a component once its Figma node exists: write `packages/ui-native/figma/<Name>.figma.ts`
with the three directives (the `url` is the node's link from Figma), publish it, run
`pnpm check:code-connect` (a `notYet` component with a template fails until it is moved), and
move the name from `notYet` to `required`. It runs in `pnpm lint:genesis` and in `ci.yml`.

## Plan limits

On Figma's Professional plan, Code Connect has one active library and one active framework
(ours is the Genesis · Design System library and React; the templates are React Native, so one
framework is enough). The framework is the label on the published docs, so the publish passes
`--label React`. A plan admin sets both in Figma's Admin → Settings → Code Connect; the CLI only
sets them when the slot is empty, and reports which library or framework is active when it
refuses. Other connections are kept but deactivated. A variable collection has 10 modes, so the
Brand collection holds up to ten consumer apps. Organization raises modes to 20 and lifts the
one-active-library limit (a second library would split foundations from components, which we do
not need yet), and adds library analytics, branching with review and shared fonts; Enterprise
has unlimited modes through extended collections. Nothing in this setup depends on
Organization; move when the eleventh brand arrives. (Figma's Code Connect help page and pricing
table, read 2026-11-02.)
