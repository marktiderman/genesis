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
import { GenesisProvider, createSupabaseProvider } from "@marktiderman/genesis-core";
import { ResourcePage } from "@marktiderman/genesis-ui/data";
import { Button } from "@marktiderman/genesis-ui";

<GenesisProvider provider={createSupabaseProvider(supabase)}>
  <ResourcePage
    resource="orders"
    title="Orders"
    columns={["customer", "email", "status", "total"]}
    allowCreate
    allowEdit
    formFields={[{ key: "customer", required: true }, { key: "email", type: "email" }]}
  />
</GenesisProvider>
```

## Packages

| Package | What it is |
| --- | --- |
| [`@marktiderman/genesis-ui`](./packages/ui) | Shadcn/Radix-based web components — primitives, forms, overlays, layout, and a `/data` subpath (`ResourcePage`, `ResourceForm`, `DetailPanel`, `DataGrid`, ...) that turns a `DataProvider` into a working CRUD page in a few lines of config. |
| [`@marktiderman/genesis-core`](./packages/core) | Platform-agnostic foundation: the `DataProvider` contract, `GenesisProvider`/context, `useResource`/`useOne`/`useResourceForm`/`useWizard` hooks, a Supabase provider, a mock provider for tests. |
| [`@marktiderman/genesis-design-system`](./packages/design-system) | Brand-agnostic design tokens (DTCG-style), a `CanonicalBrand` schema, and factories (`tailwindFromBrand`, `themeFromBrand`) that turn your brand into a Tailwind preset or a NativeWind theme. |
| [`@marktiderman/genesis-ui-native`](./packages/ui-native) | The React Native (NativeWind v5) counterpart to `genesis-ui` — same component vocabulary, native primitives. |
| [`@marktiderman/genesis-switchboard`](./packages/data-switchboard) | A `DataProvider` implementation for the case where a resource's backend is migrating — bind a resource to two backends at once during a cutover, verify they agree (`driftReport`), then bind it fully to the new one. Ships adapters for Supabase, Airtable, and Notion out of the box. |
| [`@marktiderman/genesis-cli`](./packages/genesis-cli) | Scaffolds a new consumer: brand package, Tailwind/NativeWind config, token imports. |
| [`@marktiderman/genesis`](./packages/genesis) | One-install umbrella — re-exports everything above under one version coordinate, via subpath exports. Holds no code of its own. |

## Reference apps

- [`apps/sample`](./apps/sample) — a web app consuming every package, including a live sandbox for `ResourcePage` configuration.
- [`apps/sample-native`](./apps/sample-native) — the Expo/React Native counterpart.

Start here if you want to see the packages used together before wiring them into your own app.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The short version: `pnpm install`, `pnpm build:packages`, `pnpm test`, `pnpm lint:genesis`.

## Versioning & releases

[Changesets](https://github.com/changesets/changesets)-driven. Every PR that changes a package's public behavior needs a changeset (`pnpm changeset`); merging to `main` opens or updates a "chore: version packages" PR, and merging *that* publishes to npm. Breaking changes: minor on 0.x, major on 1.x+ (each package's own `CHANGELOG.md` is the record of what changed and why).

## License

[MIT](./LICENSE)
