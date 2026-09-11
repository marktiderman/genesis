# Genesis

A shadcn-based, brand-agnostic design system and data-provider layer for building React (and React Native) apps fast — without hand-rolling a component library or a CRUD data layer for every new project.

```bash
npm install @marktiderman/genesis-ui @marktiderman/genesis-core @marktiderman/genesis-design-system
```

Or pull in the whole system as one pinned coordinate:

```bash
npm install @marktiderman/genesis
```

```tsx
import {
  GenesisProvider,
  createSupabaseProvider,
} from "@marktiderman/genesis-core";
import { ResourcePage } from "@marktiderman/genesis-ui/data";
import { Button } from "@marktiderman/genesis-ui";

<GenesisProvider provider={createSupabaseProvider(supabase)}>
  <ResourcePage
    resource="orders"
    title="Orders"
    columns={["customer", "email", "status", "total"]}
    allowCreate
    allowEdit
    formFields={[
      { key: "customer", required: true },
      { key: "email", type: "email" },
    ]}
  />
</GenesisProvider>;
```

## Extending

Genesis is a starting point. If it ever becomes a ceiling, that is a bug in genesis, not a reason to fork it — **REUSE > EXTEND > INVENT** only holds if extending is actually available.

Every pattern component offers a **ladder**. When a rung stops fitting you step _down one rung_, never off it:

| Rung                      | What it is                                                               | Reach for it when                             |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| 1 · The pattern           | `<ResourcePage resource="orders" … />` — the whole page, wired           | it fits                                       |
| 2 · `slots` / `slotProps` | swap one interior part, or pass it more props; `className` on the root   | one part is wrong and the rest is right       |
| 3 · The primitives        | `DataPageShell`, `DataTable`, `DataFilters`, … across 75 subpath exports | you need a different page layout              |
| 4 · The hooks             | `useResourcePage()` and eight others under `/hooks`                      | you want the behaviour and none of the markup |

Rung 2 is the one that keeps you on the ladder. Each pattern names every part it composes in a slot map (`ResourcePageSlotMap`), your replacement receives exactly the props genesis would have passed the default, and `slotProps` **wins** over genesis's own value:

```tsx
<ResourcePage
  resource="orders"
  slots={{ filters: MyFilters }} // swap a part
  slotProps={{ table: { className: "text-xs" } }} // or just feed it
/>
```

The **eject button** is `null` — `slots={{ bulkBar: null }}` drops a part entirely. A pattern is a default, not a mandate.

Dropping to rung 3 because one part was wrong means re-deriving all the wiring that was already correct, and that re-derivation is where forks come from. **When a downstream app hand-builds something genesis nearly had, that is the bug report.**

Full detail, plus the rules that keep this true: [`packages/ui/EXTENDING.md`](./packages/ui/EXTENDING.md).

## Packages

| Package                                                            | What it is                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@marktiderman/genesis-ui`](./packages/ui)                        | Shadcn/Radix-based web components — primitives, forms, overlays, layout, and a `/data` subpath (`ResourcePage`, `ResourceForm`, `DetailPanel`, `DataGrid`, ...) that turns a `DataProvider` into a working CRUD page in a few lines of config.                                           |
| [`@marktiderman/genesis-core`](./packages/core)                    | Platform-agnostic foundation: the `DataProvider` contract, `GenesisProvider`/context, `useResource`/`useOne`/`useResourceForm`/`useWizard` hooks, a Supabase provider, a mock provider for tests.                                                                                        |
| [`@marktiderman/genesis-design-system`](./packages/design-system)  | Brand-agnostic design tokens (DTCG-style), a `CanonicalBrand` schema, and factories (`tailwindFromBrand`, `themeFromBrand`) that turn your brand into a Tailwind preset or a NativeWind theme.                                                                                           |
| [`@marktiderman/genesis-ui-native`](./packages/ui-native)          | The React Native (NativeWind v5) counterpart to `genesis-ui` — same component vocabulary, native primitives.                                                                                                                                                                             |
| [`@marktiderman/genesis-switchboard`](./packages/data-switchboard) | A `DataProvider` implementation for the case where a resource's backend is migrating — bind a resource to two backends at once during a cutover, verify they agree (`driftReport`), then bind it fully to the new one. Ships adapters for Supabase, Airtable, and Notion out of the box. |
| [`@marktiderman/genesis-cli`](./packages/genesis-cli)              | Scaffolds a new consumer: brand package, Tailwind/NativeWind config, token imports.                                                                                                                                                                                                      |
| [`@marktiderman/genesis`](./packages/genesis)                      | One-install umbrella — re-exports everything above under one version coordinate, via subpath exports. Holds no code of its own.                                                                                                                                                          |

## Reference apps

- [`apps/sample`](./apps/sample) — a web app consuming every package, including a live sandbox for `ResourcePage` configuration.
- [`apps/sample-native`](./apps/sample-native) — the Expo/React Native counterpart.

Start here if you want to see the packages used together before wiring them into your own app.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The short version: `pnpm install`, `pnpm build:packages`, `pnpm test`, `pnpm lint:genesis`.

## Versioning & releases

[Changesets](https://github.com/changesets/changesets)-driven. **Publish with `pnpm publish`, never `npm publish`** — npm ships the `workspace:^` protocol into the tarball verbatim, and the published version is then uninstallable; pnpm rewrites it to a real range at pack time (`pnpm pack` then reading the packed `package.json` is the check). Every PR that changes a package's public behavior needs a changeset (`pnpm changeset`); merging to `main` opens or updates a "chore: version packages" PR, and merging _that_ publishes to npm. Breaking changes: minor on 0.x, major on 1.x+ (each package's own `CHANGELOG.md` is the record of what changed and why).

## License

[MIT](./LICENSE)
