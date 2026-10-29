# Genesis glossary

- Status: draft (written by hand from the 2026-10-29 taxonomy audit; to be generated from a
  `glossary.json` later)
- Date: 2026-10-29
- Related: [ADR 0005](./adr/0005-package-layers.md) (layers), [REFERENCES.md](./REFERENCES.md)

One word per concept, in code, docs and package metadata. Each term has its definition and the
synonyms not to use for it in Genesis exports and docs. A *scoped* exception is allowed only inside
the package it names. Until a glossary lint exists (planned in warn mode first), reviewers check
new names against this page.

## Structure (the layer model)

| Term | Definition | Don't use |
|---|---|---|
| **package** | one published `@marktiderman/genesis-*` npm package. | library, lib (as a noun), kit. |
| **layer** | a package's dependency rank: `foundation \| primitive \| module \| tooling`. It is used only for packages. | tier (for packages), level. |
| **group** | a package's catalog category: core, data, ai, forms, collaboration, shells, modules. | "Domain blocks", "Platform services", "App shells" (the retired group names), and `category` (as a package field). |
| **foundation** | the layer every app needs (design-system, core, ui, ui-native, features). |  |
| **primitive** | a package in the primitive layer, a reusable capability that apps and modules compose. | service (as a kind), capability (as a layer), and "primitive" for UI atoms or catalog entries. |
| **module** | an installable mini app (schema, screens, nav, settings) built from the layers below it. | plugin, app (for this), domain block. |
| **block** | the install unit, a `defineBlock` declaration that `genesis add` applies at any layer. Scoped exception: `genesis-forms` "form block" for a definition's items, kept because the definition format is serialized. | extension, add-on. |
| **tooling** | CLI and agent packages. No runtime package imports them. |  |

## UI tiers (inside foundation UI)

| Term | Definition | Don't use |
|---|---|---|
| **tier** | a UI rank inside `genesis-ui` and `genesis-ui-native`: token → element → pattern → layout → data-bound. |  |
| **token** | a design value. | variable, design constant. |
| **element** | one interaction with no domain words (Button, Tooltip). It was the "primitive" tier. | primitive (for UI), atom. |
| **pattern** | two or more elements in a recurring shape, with no data. | molecule, organism, composite. |
| **layout** | positions content without knowing what it is (AppShell, DetailPage). | template, frame, chrome. |
| **data-bound** | a component that needs a resource contract (ResourceView, RecordView). | smart component, connected component. |
| **component** | any React component, whatever its tier. A generic word, never a tier name. |  |
| **slot / variant** | the two extension points. A slot is a named fill. A variant is a named style or behavior option. | render prop (in docs), flavour, mode (for variants). |

## Data

| Term | Definition | Don't use |
|---|---|---|
| **resource** | the typed contract for one data source a view reads and writes (`defineResource`). | entity, model, collection, schema (for this). |
| **record** | one item of a resource. Use "row" only inside grid and sheet UIs. | entity, item (in APIs), document. |
| **view** | the description of how a resource's list shows (`defineView`). | list config, table config. Data Studio's saved grids are **saved views**. |
| **record view** | the description of one record's page (`defineRecordView`). | resource workspace (removed earlier; `m.workspace.*` message keys and the `native-resource-workspace-menu` testID still carry it), detail panel. |
| **table** | a Postgres table. Never used for a resource. |  |
| **data provider** | the implementation behind resources (`DataProvider`, `createSupabaseProvider`). |  |
| **adapter** | an implementation of a Genesis interface for an outside system: a switchboard backend, a storage backend or an AI vendor. | driver, connector (for this), and provider (for AI vendors). |
| **vendor** | an AI model company (Anthropic, OpenAI). It is already used in `genesis-ai` prose. |  |
| **connector** | an outside account linked through `genesis-connect` (OAuth plus secrets). | integration (as a type name). |
| **`*Provider` (component)** | a React context component. The suffix is exempt because it is React's convention. |  |

## Tenancy, people, access

| Term | Definition | Don't use |
|---|---|---|
| **tenant** | the isolation boundary that owns rows (`tenant_id`, 178 uses) and that the feature gate scopes to. "Organization" is allowed only as a user-facing label an app chooses. | practice, account (for this), team (for this), organisation (British spelling, 5 files). |
| **workspace** | where the viewer is working: one tenant, a roll-up of several, or personal (ADR 0004, `defineWorkspace`, `WorkspaceScope`). | workspace for the Data Studio UI, for forms-studio's page, or for a pnpm workspace in public API docs. |
| **scope** | the row filter a workspace gives views (`ResourceScope`, `{ orgId }`, `{ personId }`). | context (for this). Always qualify OAuth scopes as "OAuth scope". |
| **space** | a collab sharing unit with a subject, an audience, roles and visibility (`genesis-collab`, `space_id`). | room, workspace (for this). |
| **user** | an auth login (`userId`, 388 uses). | account (for the login), principal, actor (outside audit logs). |
| **person** | a human record in app data, with or without a login (`personId`). | contact, client, member (as a type). |
| **viewer** | the user currently looking, with their scope (`Viewer`). | current user, me (in APIs). |
| **member** | a person's role-bearing membership in a tenant or space. |  |
| **profile** | a user's own presentational record (name, avatar). |  |
| **account** | a login's credentials and lifecycle (sign-in, deletion) only. |  |
| **feature** | an entry in `features.ts`: a capability with a status, an owner and acceptance criteria. | capability (as a type), module (for this). |
| **flag** | an exposure switch with an expiry, never authorization. | toggle (as a type), experiment (outside flag kinds). |
| **entitlement** | a record that someone paid for a feature. | license, subscription (as a type). |
| **plan** | an app-defined commercial bundle (`access: { plan }`). | tier (for this). |
| **gate** | the one on/off answer for a feature (`featureOn`, ADR 0001). |  |
| **tenant feature** | a tenant switching off a shipped feature. |  |

## Surfaces and work

| Term | Definition | Don't use |
|---|---|---|
| **page** | what a web route renders inside the shell. **screen**: the same on native. | view (for a page), panel (for a page). |
| **route** | a URL pattern and its file. |  |
| **nav item** | an entry in the navigation tree (`NavItem`, `BlockNavItem`). | destination (for navigation, which apps use). In Genesis, "destination" means only where a forms submission goes (`genesis-forms/destinations`). |
| **zone** | a navigation area (ADR 0003). Time zones are always written `timeZone`. | bare `zone` for a time zone in new APIs. `dayIn(zone)` and `resolveZone("scope")` predate this rule. |
| **section** | a titled region of a page: a sites section, a RecordView section, the layout `Section`. They are compatible meanings, so the word is kept. |  |
| **AI task** | a versioned prompt with typed input and output (`defineTask`). Prose always says "AI task", because apps have their own to-do "tasks". |  |
| **job** | background work queued with `enqueueJob`. |  |
| **runner** | a process that drains a queue (jobs, notifications, chat). | worker (except `createOutboxWorker`), daemon. |
| **action** | a user-invoked operation on a record (RecordView `actions`, `runAction`). |  |
| **step** | always qualified: boot step, install step, form step. |  |
| **status vs stability** | a *feature* has a `status` (idea … retired). An exported *symbol* has a `@stability` (Experimental, Beta, Stable, Deprecated). Never mix the two. |  |
