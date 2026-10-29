# Genesis

**Business apps on React and Supabase, built for your coding agent.** Genesis is a framework for
multi-tenant business apps: workspaces, lists, record pages, forms, chat, sites and AI, on web and
React Native, from one design system. Row-level security keeps each tenant's data apart, and
`genesis doctor` keeps every screen on the system, whoever wrote it.

**See it running: [genesisone.dev](https://genesisone.dev)** — a [live demo app](https://genesisone.dev/demo)
with three tenants and three roles, every [package](https://genesisone.dev/packages) and
[component](https://genesisone.dev/showcase/primitives), [Storybook](https://genesisone.dev/storybook/),
and [llms.txt](https://genesisone.dev/llms.txt) for agents.

```bash
npx @marktiderman/genesis-cli init my-app          # a web app
npx @marktiderman/genesis-cli init my-app --template native   # an Expo app
```

Or add it to an app you have: `npm install @marktiderman/genesis`, the umbrella that pins the
foundation (`core`, `ui`, `ui-native`, `design-system`, `features`), the native app shell,
`switchboard` and forms at one version. Other primitives (`supabase`, `connect`, `notifications`,
`ai`, `chat`, …) and the modules (`sites`, `support`, `product`) install on their own.

## A screen is a description

Describe a resource once; a list is one line and a record page another, on web and on the phone
([docs/RESOURCE-VIEW.md](./docs/RESOURCE-VIEW.md)):

```tsx
import { defineView, defineRecordView } from "@marktiderman/genesis-core/resource-view";
import { ResourceView, RecordView } from "@marktiderman/genesis-ui/data";
import { contracts } from "./resources.genesis"; // written by `genesis introspect`

export const clientsView = defineView(contracts["public.clients"], {
  scope: ["org_id"], // follows the workspace switcher
  fields: { status: { tones: { active: "success", paused: "warning" } } },
  columns: { default: ["name", "status", "plan", "email"] },
  form: ["name", "email", "status", "plan"],
  can: { delete: (_row, viewer) => (viewer.roles?.orgRole === "owner" ? true : "Only an owner removes a client.") },
});

export const clientRecord = defineRecordView(clientsView, {
  sections: [
    { id: "bookings", label: "Bookings", list: { view: bookingsView, filter: (c) => ({ client_id: c.id }) } },
    { id: "details", label: "Details", settings: ["name", "email", "status"] },
  ],
});

<ResourceView view={clientsView} />;                       // the list screen
<RecordView view={clientRecord} row={client} section={section} sectionHref={(s) => `/clients/${client.id}/${s}`} />;
```

Inside `WorkspaceScope` (the current organization, read from the URL) every view with
`scope: ["org_id"]` follows the `WorkspaceSwitcher` in the app shell with no screen code
([ADR 0004](./docs/adr/0004-workspaces.md)). The guards narrow what the page offers; the database's
row-level security is the boundary.

<!-- genesis-features:marketing:start -->
## Features

- **Design tokens and brands** — Bring your brand once; every component follows it.
- **ResourcePage** — A working list, detail and edit page from a few lines of config.
- **Data Studio** — A spreadsheet over your own database, as the signed-in user.
- **Forms engine** — Forms as data: logic, validation and a server check that can't be tampered with.

### Design system

- **UI elements** — Accessible, themeable components you don't have to hand-roll.
- **Page layouts** — Pages that look consistent without a designer on every screen.
- **AppShell navigation** — One navigation tree drives the sidebar, mobile nav and command palette.
- **React Native components** — The same components on iOS and Android.
- **Optional native modules** (beta) — Native lists, images, motion, glass and symbols when the app has them.

### Data

- **Data views** — Tables, cards, boards and filters that share one set of conventions.
- **DataProvider and hooks** — One data contract for every backend, with hooks for lists, records and forms.
- **Supabase provider** — Supabase under row-level security, with honest write results.
- **Query keys** (beta) — Invalidation that never misses, and no data across people.
- **Switchboard** — Move a resource between backends without a rewrite.

### Forms

- **Form renderer** — Beautiful, accessible forms, one question at a time or all at once.
- **Form builder** — Build forms visually, with logic, and see problems as you go.
- **Form destinations** — Send every response to email, Google Sheets or your own webhook.
- **Forms on native** (beta) — The same forms, one question at a time, native on iOS and Android.

### Tooling

- **genesis doctor** — Your app stays on the design system, checked on every build.
- **Chrome extension kit** — Chrome extensions with the same components and tests as your app.

<sub>Generated from `features.ts`.</sub>
<!-- genesis-features:marketing:end -->

## Extending

Genesis is a starting point. If it ever becomes a ceiling, that is a bug in genesis, not a reason to fork it — **REUSE > EXTEND > INVENT** only holds if extending is actually available. Why, and how to decide where code goes: [The Genesis Way](./docs/FRAMEWORK.md).

Every pattern component offers a **ladder**. When a rung stops fitting you step _down one rung_, never off it:

| Rung                      | What it is                                                               | Reach for it when                             |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| 1 · The pattern           | `<ResourceView view={ordersView} />` — the whole page, from the view      | it fits                                       |
| 2 · `slots` / `slotProps` | swap one interior part, or pass it more props; `className` on the root   | one part is wrong and the rest is right       |
| 3 · The primitives        | `DataPageShell`, `DataTable`, `DataFilters`, … in `genesis-ui`'s subpaths | you need a different page layout             |
| 4 · The hooks             | `useResourcePage()` and eight others under `/hooks`                      | you want the behaviour and none of the markup |

Rung 2 is the one that keeps you on the ladder. `ResourceView` draws through `ResourcePage`, which names every part it composes in a slot map (`ResourcePageSlotMap`), your replacement receives exactly the props genesis would have passed the default, and `slotProps` **wins** over genesis's own value:

```tsx
<ResourcePage
  resource="orders"
  slots={{ filters: MyFilters }} // swap a part
  slotProps={{ table: { className: "text-xs" } }} // or just feed it
/>
```

The **eject button** is `null` — `slots={{ bulkBar: null }}` drops a part entirely. A pattern is a default, not a mandate.

Dropping to rung 3 because one part was wrong means re-deriving all the wiring that was already correct, and that re-derivation is where forks come from. **When a downstream app hand-builds something genesis nearly had, that is the bug report.**

Full detail, plus the rules that keep this true: [`packages/ui/EXTENDING.md`](./packages/ui/EXTENDING.md). Agents building on Genesis load [`packages/ui/SKILL.md`](./packages/ui/SKILL.md), which ships in the `genesis-ui` tarball.

## Staying on Genesis

`genesis doctor` checks an app against the Genesis it has installed: no local primitive folder,
no direct Radix imports, no raw `<button>` where Genesis ships `Button`, no literal palette or hex
colors, no `var(--token)` the theme doesn't define, no export that shadows a Genesis one. Every
rule is read from the installed `genesis-ui` declarations and theme CSS, so upgrading Genesis
upgrades the checks. Apps add their own rules in config or as plugin modules.

```bash
npx @marktiderman/genesis-cli doctor            # in CI: exit 1 on errors
```

```ts
// vite.config.ts: fail production builds, show the overlay in dev
import { genesisDoctor } from "@marktiderman/genesis-cli/vite";
export default defineConfig({ plugins: [genesisDoctor()] });
```

Details, config and the plugin API: [`packages/genesis-cli`](./packages/genesis-cli#genesis-doctor).

## Packages

All published packages, with their entry points and exports, are listed at
[genesisone.dev/packages](https://genesisone.dev/packages) (generated from this repository on every
deploy) and in [docs/component-reference.md](./docs/component-reference.md).

Packages sit in layers, and dependencies only point down (CI checks it,
[PACKAGE-STRATEGY.md](./docs/PACKAGE-STRATEGY.md#layers)). Level 1 is the foundation and the
primitives; level 2 is the modules built from them. Each package's `genesis.layer` and
`genesis.group` in its package.json say where it sits.

| Layer | Group | Packages |
| --- | --- | --- |
| Foundation | Core | [`genesis-core`](./packages/core) (data contract, providers, hooks, views, workspaces) · [`genesis-ui`](./packages/ui) (web components, layouts, `ResourceView`, `RecordView`, `AppShell`) · [`genesis-ui-native`](./packages/ui-native) (React Native components, `NativeResourceView`) · [`genesis-design-system`](./packages/design-system) (tokens, brand schema, themes) · [`genesis-features`](./packages/features) (feature registry, flags, the gate, blocks). All five are essential: every app starts with them. |
| Primitives | Core | [`genesis`](./packages/genesis), the umbrella: one version coordinate for the foundation, the native shell, switchboard and forms. It holds no code of its own, and bundles primitives, never modules. |
| | Data | [`genesis-supabase`](./packages/supabase) · [`genesis-switchboard`](./packages/switchboard) · [`genesis-studio`](./packages/studio) and [`studio-server`](./packages/studio-server) (Data Studio) · [`genesis-connect`](./packages/connect) |
| | AI | [`genesis-ai`](./packages/ai) |
| | Forms | [`genesis-forms`](./packages/forms) with [`forms-react`](./packages/forms-react), [`forms-web`](./packages/forms-web), [`forms-native`](./packages/forms-native), [`forms-builder`](./packages/forms-builder), [`forms-studio`](./packages/forms-studio), [`forms-devtools`](./packages/forms-devtools) |
| | Collaboration | [`genesis-chat`](./packages/chat) · [`genesis-notifications`](./packages/notifications) · [`genesis-collab`](./packages/collab) |
| | Shells | [`genesis-native`](./packages/native) (the Expo app shell) · [`genesis-extension`](./packages/extension) (Chrome extensions) |
| Modules | Modules | [`genesis-sites`](./packages/sites) (`genesis add sites`) · [`genesis-support`](./packages/support) (`genesis add support-feedback`) · [`genesis-product`](./packages/product) (`genesis add product-board`): mini apps with their own tables, screens and settings, installed as blocks and switched on per tenant |
| Tooling | Core | [`genesis-cli`](./packages/genesis-cli) (`init`, `add`, `doctor`, `introspect`, `features`, codemods) · `genesis-agents` (rules for agent sessions; not published). genesis-product's `genesis-product` bin and `/node` entry are tooling too. |

## Reference apps

- [`apps/sample`](./apps/sample) — the site at [genesisone.dev](https://genesisone.dev): the landing page, the
  demo app, the building blocks one by one, the design system and the generated package pages.
- [`apps/genesis-rn-starter`](./apps/genesis-rn-starter) — the Expo starter `genesis init --template native`
  copies: sign-in, settings, account deletion and notifications on day one, each turned off in one line.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The short version: `pnpm install`, `pnpm build:packages`, `pnpm test`, `pnpm lint:genesis`.

## Versioning & releases

[Changesets](https://github.com/changesets/changesets)-driven. **Publish with `pnpm publish`, never `npm publish`** — npm ships the `workspace:^` protocol into the tarball verbatim, and the published version is then uninstallable; pnpm rewrites it to a real range at pack time (`pnpm pack` then reading the packed `package.json` is the check). Every PR that changes a package's public behavior needs a changeset (`pnpm changeset`); merging to `main` opens or updates a "chore: version packages" PR, and merging _that_ publishes to npm. Breaking changes: minor on 0.x, major on 1.x+ (each package's own `CHANGELOG.md` is the record of what changed and why).

## License

[MIT](./LICENSE)
