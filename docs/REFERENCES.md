# Genesis references

- Status: living register (re-checked quarterly; see section 4)
- Last reviewed: 2026-10-29

The open-source projects, frameworks, design systems and SDKs that Genesis models itself on, what it takes from each, and where it chooses differently. Before Genesis invents a concept, a name or a structure, check whether a reference has already solved it: this page is the "reuse" step of [FRAMEWORK](./FRAMEWORK.md) G1 to G6, applied to ideas.

Each row's "Last checked" date is when its primary docs were last read. Quotes are short, and each is linked to its source. The numbering below skips section 3 (how the references name their concepts), which feeds the draft [glossary](./GLOSSARY.md) instead.

## 1. The reference set

| # | Reference | Group | What it is | Genesis borrows | Genesis does differently | Informs | Last checked |
|---|---|---|---|---|---|---|---|
| 1 | **Atlassian Design System** | Design system | Atlassian's foundations, tokens, components, patterns and content guidance | Foundations, then components, then patterns; content design as a first-class section | Its word list is internal only. Genesis publishes its own. | design-system, ui, docs | 2026-10-29 |
| 2 | **GitHub Primer** | Design system | GitHub's design system: Product UI, Brand UI, and Primitives (tokens) | A published component lifecycle with entry criteria for each stage | Primer uses "primitives" for tokens. Genesis uses it for a package layer. | ui, features (status), docs | 2026-10-29 |
| 3 | **IBM Carbon** | Design system | IBM's Core library plus extension libraries built on Core | Extensions build on Core and never replace it; "Preview" components are usable in production | Genesis checks the dependency direction in CI. Carbon relies on governance. | layer model, ui "elements" | 2026-10-29 |
| 4 | **Shopify Polaris** | Design system | Shopify's admin design system, now documented under shopify.dev | Content guidance (voice, naming, actions) sits beside the components; admin patterns | Polaris targets one platform's admin. Genesis targets many tenants' apps. | ui patterns, content style | 2026-10-29 |
| 5 | **shadcn/ui** | UI components | Components you copy into your app, plus a registry and a CLI | Open code; composition; a flat-file registry and an `add` CLI; Tailwind tokens | Components ship as versioned npm packages, not copies (see the tensions below) | ui, cli (`genesis add`), blocks | 2026-10-29 |
| 6 | **Radix Primitives** | UI components | Unstyled, accessible React primitives | Behaviour and accessibility come from Radix; the `asChild` composition prop; named parts | Genesis styles them and adds opinions. Apps never use raw Radix. | ui elements | 2026-10-29 |
| 7 | **Refine** | App framework | A headless React meta-framework for CRUD apps | Resources plus pluggable providers (data, auth, access control, live); verb-plus-noun hooks | Access is enforced in Postgres (RLS), not in an app-side access provider | core (provider, resources), ResourceView | 2026-10-29 |
| 8 | **react-admin** | App framework | A batteries-included admin framework | Ready-made list, show and edit screens; a parity checklist for Data Studio | No paid tier. The data layer is the database client under RLS, not REST. | ui/data, studio | 2026-10-18 |
| 9 | **Supabase** | Backend platform | Postgres with Auth, Storage, Realtime, Edge Functions, and PostgREST | RLS as the access model; SQL functions for privileged steps; migrations as the database's record | Genesis adds an app layer, a feature gate and modules on top | supabase, every module's schema | 2026-10-29 |
| 10 | **OpenFeature** | Standard | A vendor-neutral feature-flag API and specification | The flag-evaluation API, the provider model, and its manifest format | Flags control exposure, never authorization. Paid access is an entitlement, not a flag. | features (flags) | 2026-10-29 |
| 11 | **Rails engines** | Module ecosystem | Mountable mini apps inside a Rails app | Install copies migrations into the host app; the host mounts the engine; namespaced tables | — (this is the model Genesis follows) | blocks, `genesis add`, modules | 2026-10-29 |
| 12 | **Medusa** | Module ecosystem | A modular commerce framework | Its definition of a module ("one domain or integration") and module isolation | Modules meet through primitives and declared module dependencies, not a link DSL | modules, schema ownership | 2026-10-29 |
| 13 | **Backstage** | Module ecosystem | A developer-portal framework assembled from plugins | Extensions with typed attach points; a published glossary | No auto-discovery: the app places what a module offers | blocks, slots, navigation | 2026-10-29 |
| 14 | **Puck** | Module ecosystem (editor) | An open-source visual editor; its data is `{type, props}` nodes | The config maps each type to a component; the canvas renders the real renderer | Genesis Sites serves cached HTML and keeps its own section registry | sites, forms-builder | 2026-10-29 |
| 15 | **Expo** | Mobile | A React Native framework, SDK and cloud services | Generating native projects from config (CNG); config plugins; a glossary that lists deprecated terms | — (Genesis builds on Expo directly) | native, ui-native | 2026-10-29 |
| 16 | **Vercel AI SDK** | AI SDK | A provider-neutral TypeScript toolkit for model calls | Provider adapters; streaming; structured output; tools; the `experimental_` naming convention | The SDK sits behind Genesis's task API (`defineTask`) and is never called by apps | ai | 2026-10-29 |
| 17 | **Model Context Protocol** | AI protocol | The open protocol between LLM hosts, clients and servers | Its nouns (tools, resources, prompts); consent before any tool runs; specs versioned by date | Not yet shipped. An app's MCP server, read-only first, is the next AI build ([ADR 0006](./adr/0006-ai-direction.md)). | ai, the future `genesis-mcp` | 2026-10-29 |
| 18 | **Nx** | Dev tooling | A monorepo build system | Tag-based module-boundary rules, the model for the `package-layering` check; its glossary | Genesis uses pnpm workspaces and doctor, not Nx | doctor, cli | 2026-10-29 |
| 19 | **Changesets** | Dev tooling | Versioning and changelogs for monorepos | One changeset per change; semver per package | — | release process | 2026-10-29 |
| 20 | **Diátaxis** | Docs method | A docs framework with four kinds: tutorials, how-to guides, reference, explanation | Proposed as the information architecture for Genesis's docs (not yet adopted) | — | docs | 2026-10-29 |
| 21 | **Vale** | Docs tooling | A linter for prose | Vocabulary files: `accept.txt` and `reject.txt` | Proposed, not adopted (a glossary lint in warn mode is the first use) | docs, glossary lint | 2026-10-29 |

**Product UX references.** These are closed products, so Genesis studies their behaviour, never their code:
- **Linear**: Triage Intelligence is the model for the coach approval queue in `docs/AI.md`.
- **Notion**: an agent whose memory is an editable instructions page.
- **Airtable**: the behaviours Data Studio aims for.
- **Typeform and Tally**: the form as a flat list of blocks (`docs/FORMS.md`).
- **Slack**: chat conventions.

### Where the references pull in opposite directions

| Tension | Side A | Side B | What Genesis chose |
|---|---|---|---|
| How code reaches an app | shadcn: copy the source in, then own it | Radix, Carbon, Primer: versioned npm packages | **Both, split by artifact.** Code ships as npm packages, so doctor can enforce it and fixes reach every app. Migrations, route stubs and skills are copied in by `genesis add`, because the app's migrations folder must be the one record of its database (Rails engines). |
| Headless or batteries-included | Radix, Refine: logic only, you bring the UI | react-admin, Polaris: finished screens | **Headless underneath, opinionated on top.** Radix provides behaviour, and Genesis `ui` provides the one look. `ResourceView` and `RecordView` are finished screens driven by a view definition. |
| Where authorization lives | Refine and Medusa: an access provider or service checks in app code | Supabase: RLS in the database | **The database.** The UI rule decides what shows; row security decides what data comes back. |
| How a module joins an app | Backstage: discovered from `package.json`; Payload and Strapi: runtime plugins | Rails, Shopify: explicit install and mount | **Explicit.** `genesis add` copies the module in, the app places its nav entries, and tenants switch it on through the feature gate. |
| AI framework or AI primitives | Mastra: agents, memory and workflows in one framework | AI SDK: thin calls; MCP: a protocol | **Primitives.** Tasks on the AI SDK, with no workflow DSL. See [ADR 0006](./adr/0006-ai-direction.md). |
| Flags | Many vendors: flags also gate paid features | OpenFeature: a flag is exposure only | **OpenFeature's line.** Paid access is an entitlement. |

## 2. Notes on each reference

**Atlassian.** The site separates Foundations (tokens and styles), Components and Patterns, and gives content design its own top-level section. Its vocabulary page says the word list "has moved to go/vocab", which only Atlassian staff can open ([vocabulary](https://atlassian.design/content/vocabulary), [content design](https://atlassian.design/get-started/content-design)). The lesson is that even the strongest design systems treat a word list as core infrastructure. Genesis's list has to be public, because its contributors are outside agents. Informs: the design-system tiers and the content style guide.

**Primer.** Primer splits itself into Product UI, Brand UI and Primitives, which in Primer means "design tokens for color, spacing, and typography" ([primer.style](https://primer.style/product/primitives/)). Its lifecycle has three stages: Experimental, Ready and Deprecated. A deprecated component "should be avoided", must document its alternative, and must warn the consumer ([lifecycle](https://primer.style/guides/component-lifecycle)). Another Primer page uses an older alpha → beta → stable scale, with criteria such as "three or more instances" in production before beta ([status](https://primer.style/status)). Genesis takes the criteria-based gates and the deprecation warning. Genesis does not take Primer's meaning of "primitives": in Genesis it names a package layer ([ADR 0005](./adr/0005-package-layers.md)).

**Carbon.** Carbon Core is "a collection of pre-built, reusable assets", and its extension libraries are built on Core ([ecosystem](https://carbondesignsystem.com/all-about-carbon/the-carbon-ecosystem/)). Carbon has no glossary. Its contribution checklist defines a Preview stage that is usable in production while its API may still change ([checklist](https://carbondesignsystem.com/contributing/component-checklist)). IBM Products marks status in the export name (`preview__`, `previewCandidate__`). Genesis takes Core plus extensions as the shape of the layer model ([ADR 0005](./adr/0005-package-layers.md)), and "elements" as the word for the UI tier.

**Polaris.** The Polaris docs now live at [shopify.dev/docs/api/polaris](https://shopify.dev/docs/api/polaris), and the old polaris.shopify.com lifecycle page redirects there. Shopify's app guidance asks for plain language and calls to action that start with a strong verb ([content](https://shopify.dev/docs/apps/design/content)). Genesis takes content rules that live next to the components. It deliberately does not follow Polaris's move to platform-specific web components.

**shadcn/ui.** "This is not a component library. It is how you build your component library." Its principles are open code, composition, distribution through "a flat-file schema and command-line tool", beautiful defaults, and being AI-ready ([docs](https://ui.shadcn.com/docs)). Genesis began "shadcn-based" (its root `package.json` description) and takes the registry-plus-CLI model for blocks. It ships code as packages because Genesis has to change every app at once, which a copied component cannot do.

**Radix.** Radix is unstyled and accessible: components "adhere to the WAI-ARIA design patterns". It supports incremental adoption, and its open architecture gives "granular access to each component part" ([intro](https://www.radix-ui.com/primitives/docs/overview/introduction)). A component is a namespace of parts (`Dialog.Root`, `Dialog.Trigger`, `Dialog.Content`), and it composes through `asChild`. Genesis moved Tooltip, Tabs and ScrollArea onto Radix (the genesis-ui changelog). The rule is that Genesis never writes behaviour Radix already solves.

**Refine.** "A React meta-framework for CRUD-heavy web applications", with a headless architecture ([docs](https://refine.dev/docs/)). Its nouns are `resource` and data, auth, access-control and live providers. Its hooks are verb plus noun: `useList`, `useOne`, `useCreate`, `useTable`, `useForm`. Genesis's provider, resources and `use*` hooks follow this closely. The difference is that Genesis has no access-control provider, because the database decides access.

**react-admin.** A finished admin framework. Data Studio's parity research measures Genesis against it alongside Refine and Supabase (read 2026-10-18). Genesis takes its daily admin jobs as the checklist, and leaves out its paid tier and its REST-first data layer.

**Supabase.** The platform Genesis runs on. Its feature catalogue tags each feature GA, Public Beta, Beta or Public Alpha ([features](https://supabase.com/docs/guides/getting-started/features)), and its docs are organised by product noun: Database, Auth, Storage, Realtime, Functions. Genesis takes RLS, security-definer functions and migrations as the record of the database. It adds what Supabase leaves to apps: tenancy, features and modules.

**OpenFeature.** A vendor-neutral flag API with a published glossary of terms such as provider, evaluation context and hook ([glossary](https://openfeature.dev/specification/glossary)). Genesis evaluates flags through it and generates its CLI manifest from the registry (`toOpenFeatureManifest`).

**Rails engines.** An engine's install step copies its migrations into the host, the host mounts it, and `isolate_namespace` keeps its tables apart ([guide](https://guides.rubyonrails.org/engines.html)). This is the closest existing model for `genesis add` and for modules.

**Medusa.** "A module is a reusable package of functionalities related to a single domain or integration." Medusa uses a plugin for a package of modules plus routes and workflows ([modules](https://docs.medusajs.com/learn/fundamentals/modules)). Its names follow fixed patterns: `Module(NAME, { service })`, `<Name>ModuleService`, `createStep` and `createWorkflow`, kebab-case workflow ids, and generated `createPosts` and `retrievePost` methods. Genesis takes the single-domain definition and module isolation. Medusa's "plugin" corresponds to a Genesis module made of several blocks.

**Backstage.** An app assembled from plugins, with a reference glossary ([glossary](https://backstage.io/docs/references/glossary/)). The glossary is alphabetical, splits a term with several meanings into numbered senses, adds qualifiers such as "Component (catalog plugin)", and lists alternate names with "aka" ("Software Templates (aka Scaffolder)"). Genesis takes typed attach points (slots, nav ids) and the glossary format. It rejects auto-discovery (see the tensions above).

**Puck.** Puck's data is a tree of `{type, props}` nodes, and a config maps each type to a component, so the editor canvas renders the real renderer. Forms decision 15 and Sites cite it ([docs](https://puckeditor.com/docs)). Genesis copies none of its code.

**Expo.** Expo's glossary defines its nouns: development build, prebuild, Continuous Native Generation, config plugin, EAS Build and EAS Update ([glossary](https://docs.expo.dev/more/glossary-of-terms/)). It also keeps retired terms visible: "bare workflow" is marked deprecated, and "Expo client" is given as the former name of Expo Go. Genesis takes CNG and config plugins for `native`. It also takes this way of retiring a word without breaking old links.

**Vercel AI SDK.** The SDK "standardizes integrating artificial intelligence (AI) models across supported providers" ([overview](https://ai-sdk.dev/docs/foundations/overview)). It is organised as Core, UI, RSC, Workflow and TUI ([reference](https://ai-sdk.dev/docs/reference)). APIs prefixed `experimental_` "can change in any releases", and unprefixed APIs follow semver ([versioning](https://ai-sdk.dev/docs/migration-guides/versioning)). Genesis imports the SDK only in `genesis-ai/server` and offers tasks instead.

**MCP.** Hosts, clients and servers exchange JSON-RPC messages. Servers offer resources, prompts and tools; clients offer sampling, roots and elicitation. The spec is versioned by date and uses RFC 2119 keywords ([spec 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18)). Its principle that "hosts must obtain explicit user consent before invoking any tool" matches Genesis's rule that a coach approves every draft.

**Nx.** A glossary page defines project, application, library, target, task, executor, generator and plugin ([glossary](https://nx.dev/docs/reference/glossary)). Its `depConstraints` are the model for `package-layering` ([boundaries](https://nx.dev/docs/features/enforce-module-boundaries)).

**Changesets, Diátaxis and Vale.** Changesets is already how Genesis releases ([repo](https://github.com/changesets/changesets)). Diátaxis is "a systematic approach to technical documentation authoring" in four kinds, used by Cloudflare and Gatsby among others ([diataxis.fr](https://diataxis.fr/)). Vale lints prose against `accept.txt` and `reject.txt` vocabularies; a rejected term is flagged as an error ([vocabularies](https://docs.vale.sh/keys/vocabularies)).

## 4. Keeping this list current

- **This file is the register.** Each reference row gets a "last checked" date and links to the Genesis doc or ADR that relies on it.
- **Adding a reference.** Add it in the same PR as the design or ADR that first borrows from it, with its row and its note. One rule follows from this: a doc that cites an outside project as the model for a Genesis decision must link to its row here.
- **Removing or demoting a reference.** Remove or demote it when any of these happens:
  - the project is archived or relicensed so that Genesis can no longer study it;
  - Genesis drops what it borrowed;
  - a later ADR picks the opposite side of a tension.

  The PR moves the row to a "Former references" table with the date and the reason. A row is never deleted.
- **A change of direction is an ADR.** Moving from one side of a tension to the other (for example adopting auto-discovery, or a framework over primitives) needs an ADR under `docs/adr/` that names the references on both sides, and this page links to it.
- **Review cadence.** Every quarter, re-read each reference's primary docs for a major version, a renamed concept or a new maturity scheme. Update its "last checked" date, and open an issue for each drift that affects Genesis. The AI rows are re-checked at each AI phase gate, as `docs/AI.md` already requires for TanStack AI.
- **Public boundary.** Only open-source projects and public products appear here. No customer or consumer app is named.

## Sources

The layer and AI decisions that rely on these references are recorded in [ADR 0005](./adr/0005-package-layers.md) and [ADR 0006](./adr/0006-ai-direction.md).

- Atlassian: https://atlassian.design/content/vocabulary , https://atlassian.design/get-started/content-design , https://atlassian.design/content/language-and-grammar
- Primer: https://primer.style/guides/component-lifecycle , https://primer.style/status , https://primer.style/product/primitives/
- Carbon: https://carbondesignsystem.com/all-about-carbon/the-carbon-ecosystem/ , https://carbondesignsystem.com/contributing/component-checklist
- Polaris and Shopify: https://shopify.dev/docs/api/polaris , https://shopify.dev/docs/apps/design/content
- shadcn/ui: https://ui.shadcn.com/docs , https://ui.shadcn.com/docs/registry/registry-item-json
- Radix: https://www.radix-ui.com/primitives/docs/overview/introduction
- Refine: https://refine.dev/docs/
- Supabase: https://supabase.com/docs/guides/getting-started/features
- OpenFeature: https://openfeature.dev/specification/glossary
- Rails engines: https://guides.rubyonrails.org/engines.html
- Medusa: https://docs.medusajs.com/learn/fundamentals/modules , https://docs.medusajs.com/learn/fundamentals/plugins
- Backstage: https://backstage.io/docs/references/glossary/
- Puck: https://puckeditor.com/docs
- Expo: https://docs.expo.dev/more/glossary-of-terms/
- AI SDK: https://ai-sdk.dev/docs/foundations/overview , https://ai-sdk.dev/docs/reference , https://ai-sdk.dev/docs/migration-guides/versioning
- MCP: https://modelcontextprotocol.io/specification/2025-06-18
- Nx: https://nx.dev/docs/reference/glossary , https://nx.dev/docs/features/enforce-module-boundaries
- Changesets: https://github.com/changesets/changesets
- Diátaxis: https://diataxis.fr/
- Vale: https://docs.vale.sh/keys/vocabularies
- React: https://react.dev/reference/rules/rules-of-hooks
- Google developer style guide word list (a model for "don't use" labels): https://developers.google.com/style/word-list
