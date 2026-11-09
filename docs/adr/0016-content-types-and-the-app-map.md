# ADR 0016: Content types, and the app map as the table of contents

- Status: proposed
- Date: 2026-11-09
- Features: `resource-contract`, `data-views`, `feature-registry`, `content-packs`, `genesis-mcp`
  (new: `content-types`, `app-map`)
- Related: ADR 0009 (one resource contract drives every surface), ADR 0013 (customization
  layer), ADR 0005 (package layers), docs/RESOURCE-VIEW.md, docs/GLOSSARY.md; Growth90's private
  ADR 0008 (shared content-type vocabulary: the family names this ADR's types use); GitDATA's
  engine / shapes / packs split (`@marktiderman/gitdata`, docs/ARCHITECTURE.md)

## Context

Many tables hold several kinds of thing in one table, told apart by a `kind` column. Growth90's
`resources` holds video, article, quote, scripture, audio, file, book, story and presentation;
its worksheets have a `subject_kind`; the product hub's items, Sites' sections and work items
(Growth90 ADR 0008: "work item, with a `kind`") do the same. Keeping them in one table is right:
one set of row-level security, visibility, binning, tags, history and views.

But nothing in Genesis knows what a kind *is*. A resource contract (ADR 0009) describes the
table, not its kinds, so every surface re-decides them by hand, and they drift. In Growth90, on
2026-11-09:

- quotes and scripture can't be created anywhere in the app (the library says "add items with
  the Resource Saver", which saves only links); only Studio's raw row editor or SQL can;
- the library's detail page never shows a quote's attribution, and never fetches scripture's
  `reference` and `translation`;
- lessons and worksheets render both properly (their own `kind` branches);
- the home feed and the extension's new tab show quotes and never scripture (`kind = 'quote'`
  in SQL);
- the kind list is written out four times: the SQL check constraint, `src/lib/library.ts`, the
  generated `resources.genesis.ts` and the extension.

There is also no single place to see what an app *has*: its features (`features.ts`), its tables
(the generated contracts), its kinds, its vocabulary (the glossary, Growth90 ADR 0008), its
blocks and packs. Each lives in its own file with its own check, and none links to the others.
Asked "where do quotes show, and which feature owns that?", people and agents have to grep.

`pnpm features find` hits, and why each falls short (G1, G2):

- `resource-contract` / `data-views`: describe a table and how it is shown, not the kinds
  inside it. This ADR extends them.
- `feature-registry`: the inventory of what the product does; it doesn't know tables or kinds.
  This ADR makes it one part of a larger map.
- `content-packs`: versioned *data* (sections, labels) that fills installed blocks; not a
  *type* definition. A content type's starter rows can ship as a pack.

What others do, briefly: WordPress (one `posts` table, `register_post_type` with `supports`),
Salesforce record types (one object, a layout and picklists per type), Drupal bundles with view
modes and form modes, Shopify metaobjects with capabilities that switch platform features on,
SharePoint content types with site columns and a hub that publishes them, Sanity, Payload and
Meta's Ent (schema in code; admin, API and types generated from it), Backstage (a typed catalog
of everything, generated and owned in git). GitDATA, our own, splits an engine that names
nothing from packs that carry a consumer's vocabulary, and checks drift in CI.

## Decision

### 1. Genesis owns the meta-schema and the engine; each app owns its schema

The GitDATA line: **Genesis owns the mechanics, the app owns the naming.**

| Layer | Owns | Lives in |
| --- | --- | --- |
| **Engine** (Genesis) | `defineContentTypes`, the declaration's shape, generation, the checks, the surfaces' hooks | `genesis-core` (definitions), `genesis-cli` (generate, check) |
| **Shapes** (Genesis) | reusable field groups and their view modes: text with attribution, media with clips, a link with a preview, a file | `genesis-core`, rendered by `genesis-ui` and `ui-native` |
| **Schema** (each app) | the app's content types: names, fields, rules, view modes, capabilities | the app's `content-types.ts`, next to `features.ts` |

Genesis ships no app's types. It may ship optional **starter packs** (a "library" pack with
video, article and quote), copied into an app and owned by it from then on, never linked.

### 2. A content type is a declared kind of a resource

```ts
// content-types.ts (the app's)
export const contentTypes = defineContentTypes({
  quote: {
    resource: "public.resources",      // the contract it is a kind of
    kind: "quote",                     // the discriminator value
    family: "resource",                // Growth90 ADR 0008's family
    label: "Quote", icon: "quote.bubble",
    fields: { text: { required: true, as: "longText" }, attribution: {} },
    shape: "attributedText",           // a Genesis shape: its card, detail and form
    capabilities: ["feedable", "pinnable", "themeable", "taggable", "worksheetSubject"],
    schemaOrg: "Quotation",
  },
  scripture: {
    resource: "public.resources", kind: "scripture", family: "resource",
    label: "Scripture", icon: "book.closed",
    fields: { text: { required: true, as: "longText" }, reference: { required: true }, translation: {} },
    shape: "attributedText",
    capabilities: ["taggable", "worksheetSubject"],
  },
});
```

- **At most one level of inheritance** (`extends: "quote"`). SharePoint's deep trees are the
  thing not to copy.
- **Fields are the contract's columns.** A type picks which it uses and which it requires; it
  never invents a column. A field the table lacks is a migration first.
- **Capabilities, not kind checks.** A surface subscribes to a capability ("everything
  `feedable`"), never to a list of kinds, so a new type that declares `feedable` reaches the feed
  without new code. The package that offers a surface registers the capabilities it consumes,
  so the set stays open.
- **View modes.** A surface asks for a mode (`card`, `detail`, `form`, `feed`, or one a package
  registers, such as `tv`, `newTab` or `widget`). A type gives each mode from its shape or from
  its own component (levels 3 and 5 of ADR 0013).

### 3. One declaration, everything generated

From `content-types.ts` the CLI generates, and `genesis content-types check` keeps honest:

- the table's `kind` check constraint and each kind's required-field checks, as a migration the
  app reviews and commits (the database stays the enforcement, as everywhere in Genesis);
- the TypeScript union, per-type row types and their zod schemas;
- the forms (by type) and the "New…" menu of any view whose resource has types;
- the AI and MCP tools (ADR 0009), such as `create_quote` and `find_scripture`, with each type's
  rules in their descriptions, and a line per type in `llms.txt`;
- per-type schema.org data on Sites pages;
- the type's entry in the app map (point 5).

### 4. The checks (Genesis guides; CI enforces)

`genesis content-types check`, run by `genesis doctor` and the app's CI:

- every value of a typed table's `kind` constraint has a declaration, and every declaration's
  kind is in the constraint;
- every declared field exists on the contract, and every required field is required in the
  database too;
- every surface that subscribes to a capability renders the view mode it asks for, for every
  type with that capability (the coverage matrix, point 5);
- a screen that branches on a typed `kind` by hand (`r.kind === "quote"`) is a finding: the
  registry is missing a capability or a view mode. (GitDATA's rule: a consumer writing SQL means
  a shape is missing.)

### 5. The app map is the formal table of contents

One generated map of what an app has and how it connects. The feature registry becomes one part
of it, not a separate list.

| Node | Source | Generated today |
| --- | --- | --- |
| **Feature** | `features.ts` | yes (`genesis features build`) |
| **Resource** (table) | contracts from `genesis introspect` | yes |
| **Content type** | `content-types.ts` | this ADR |
| **Term** (vocabulary, taxonomy) | the glossary, and types' term sets | partly (`docs/GLOSSARY.md`) |
| **Block / pack** | block manifests, content packs | yes |
| **Surface** (a route, view, tool, widget, extension page) | views, routes, MCP tools | partly |

Edges are declared once, where each already lives: a feature `uses` resources and content types
(`features.ts` gains `links.contentTypes` and `links.resources`); a content type `isKindOf` a
resource and `hasCapability`; a surface `shows` capabilities in view modes; a term `tags`
content types.

- **`genesis map build`** writes `map.json` (and AGENTS.md lines, as the feature registry does).
  **`genesis map check`** fails on drift, a dangling edge, a feature claiming a type that doesn't
  exist, or a hole in the coverage matrix.
- **A Map page**, extending `FeatureList`: browse by feature, table, content type or term; the
  coverage matrix (type × surface × mode) with its holes marked; the owner of each node.
- **Managing it.** The map is read-only in the app. Content types, features and the app's terms
  change in code, by PR, with their checks. A tenant's own term sets (a practice's topics) are
  data, edited in the app, and shown on the map beside the app's.
- **The product hub** mirrors the map (`feature-mirror` extends to content types), so the hub and
  Claude read the same table of contents.

### 6. Taxonomy: governed terms beside free tags

A content type may declare `terms: ["topic"]`: a governed term set (the app's own, plus each
tenant's additions), distinct from free tags (Growth90 ADR 0008: a tag is a tenant's free label).
Pickers (themes, pins) filter by term. Term sets are data, shipped as content packs.

## Glossary

- **content type**: a declared kind of a resource, with its fields, rules, view modes and
  capabilities. Not: subtype, record type, post type, model.
- **capability**: something a content type can take part in (`feedable`, `pinnable`), declared
  by the type and consumed by a surface. Not: trait, feature (a feature is a product capability
  in `features.ts`).
- **view mode**: a named way a surface shows a content type (`card`, `detail`, `form`, `feed`).
  Not: display, template, variant (a variant is a component prop).
- **app map**: the generated table of contents of an app's features, resources, content types,
  terms, blocks and surfaces, and the edges between them. Not: catalog (Studio's schema
  catalog), inventory (the component reference), sitemap.
- **term set**: a governed list of terms a content type is tagged with. Not: category, tag.

## Alternatives

- **A table per kind** (`quotes`, `scriptures`): rejected. It duplicates RLS, visibility,
  binning, tags, history and every view: the custom code G5 removes.
- **Database-first types** (kinds described in `@genesis` comments, like contracts): rejected for
  types. Types carry view modes, capabilities and shapes, which are code. The database still
  enforces what it can: the constraints are generated from the declaration and checked against
  it. Contracts stay database-first.
- **Each app hand-rolls its kinds** (today): rejected. It is how quotes lost their attribution
  and scripture never reached the feed.
- **A hand-written table of contents:** rejected. It drifts; GitDATA's rule 4 (generated
  artifacts are never hand-edited) applies.
- **A full CMS** (Sanity, Payload) as a dependency: rejected. Their schema-as-code idea is what
  this borrows.

## Consequences

- **Phase 0, Genesis:** `defineContentTypes` and the declaration's types in `genesis-core`;
  `genesis content-types check` (constraint ↔ declarations, fields ↔ contract). Additive.
- **Phase 1, Growth90 as the first app:** `content-types.ts` for `resources`' nine kinds; quote
  and scripture get create forms, cards and detail views from the `attributedText` shape; the
  library's "New…" menu and kind filter come from the registry; the feed asks for `feedable`.
- **Phase 2:** the coverage check, generated constraints, MCP tools per type, and `genesis map`
  with the Map page (the feature registry folded in, its commands kept as aliases).
- **Phase 3:** governed term sets, schema.org on Sites, the hub's mirror.
- Nothing is renamed; existing `kind` columns keep their values. A table opts in by having
  declarations; a table with none is unchecked, as today.

## Open questions for the maintainer

1. Where the Map page lives: Studio (beside the schema catalog), the app's admin, or both.
2. Whether capabilities start as a closed Genesis list (safer) or open from day one.
3. Whether Growth90's private ADR 0008 vocabulary moves into Genesis's public glossary with this.
