# ADR 0005: Package layers

- Status: accepted (implemented by the package-layers PR, #515)
- Date: 2026-10-29
- Features: `package-layering`, `package-schema-ownership` (added by #515), `ui-primitives`
- Related: [PACKAGE-STRATEGY.md](../PACKAGE-STRATEGY.md) "Layers" (the placement table and the
  metadata schema), [FRAMEWORK.md](../FRAMEWORK.md) Part 2, [REFERENCES.md](../REFERENCES.md)
  (Carbon, Nx, Rails engines, Medusa, Backstage).

## Context

Genesis had grown to about thirty packages sorted into five descriptive groups (foundation, app
shells, platform services, domain blocks, tooling). The groups said where a package appeared, not
what it could depend on, so nothing stopped a foundation package importing a domain one. Two
dependencies that crossed groups (`sites → forms`, `support → chat`) were kept as "declared
domain seams", exceptions written in prose.

The word "primitive" also had three meanings: a UI tier in FRAMEWORK Part 2 (Button, Tooltip), the
doctor's catalog of "the primitive for each need", and, informally, any reusable package. A
contributor, human or agent, could not tell from a name what a package was for or where new code
belonged.

The reference systems agree on the shape: a core that everything builds on, extensions that build
on the core and never replace it (Carbon), the direction enforced by a tool rather than review
(Nx `depConstraints`), and installable mini apps that copy their migrations into the host (Rails
engines) and own one domain each (Medusa).

## Decision

### 1. Three runtime layers, plus tooling

| Layer | What it is | May depend on |
|---|---|---|
| **foundation** | What every app needs: design-system, core, ui, ui-native, features | foundation |
| **primitive** | A reusable capability an app or module composes: data, AI, forms, collaboration, shells | foundation, primitive (no cycles) |
| **module** | An installable mini app with its own schema, screens, nav entries and settings | foundation, primitive, and a module only when its `requiresModules` lists it |
| **tooling** | The CLI and agent tooling, beside the layers | anything; no runtime package depends on tooling, nor on a package's `toolingEntries` |

People see it as two levels: **level 1** is the foundation and the primitives, **level 2** is the
modules built from them. The check keeps three runtime layers, so "ui never imports chat" still
holds.

The placement rule: if another package or app embeds it as a part, it is a **primitive**; if
someone installs it and gets a working product surface to switch on for tenants, it is a
**module**. So chat is a primitive (support and apps embed it), and sites, support and product are
modules.

### 2. Groups

A package's group decides where it appears on the site and in Storybook: **core, data, ai, forms,
collaboration, shells, modules**. There is no "start here" group; the five foundation packages
carry an `essential` badge and the site shows the one-line `genesis init` instead. The CLI and the
agent tooling sit in `core`. The umbrella package is a primitive in `core`.

### 3. Metadata and the check

Every package records `genesis.layer` and `genesis.group` in its package.json; a module adds a
`genesis.module` card (name, summary, blocks, `requiresModules`, schema, install line, docs,
skill). The types and rules live in `@marktiderman/genesis-features` (`PackageMeta`,
`readPackageMeta`, `packageLayerProblems`), so a later `genesis doctor` mode can reuse them.

`pnpm check:package-layers` fails CI from day one. "Depends on" means `dependencies`,
`peerDependencies` and every Genesis import in the source (tests aside), so an undeclared import
still counts. The former domain seams stop being exceptions: each is a module depending on a
primitive, which the rule allows.

### 4. Install unit, plans and the umbrella

- The **block** (`defineBlock`, applied by `genesis add`) stays the install unit at every layer. A
  module is a package of blocks forming a mini app.
- **Plans and entitlements** live in each app's `features.ts` (`access: { plan }`), never in
  package metadata: which plan unlocks a module is the app's decision.
- The **umbrella** may re-export primitives, never a module.
- A runtime package with a tooling half declares it with `toolingEntries` (product's repo CLI,
  `./node`) rather than splitting into a new package; the check refuses runtime imports of it.

### 5. The UI tier is "elements"

FRAMEWORK Part 2's UI tier formerly called "primitives" is now **elements** (token → element →
pattern → layout → data-bound), so "primitive" means only the package layer. In `features.ts` the
layer value `primitive` becomes `element`; `"primitive"` stays accepted as a deprecated alias until
the next major. The doctor's `genesis primitives` catalog and the sample app's
`/showcase/primitives` URLs keep their names for now; renaming them is a separate change.

## Consequences

- A contributor can place new code from the rule in section 1, and CI says when a dependency
  points the wrong way.
- Schema ownership (that a module's migrations write only to its own schema, and no other package
  writes there) is the follow-up `package-schema-ownership`; support's tables still live in
  genesis-supabase's migration 0006 until then.
- **Follow-up:** the `features.ts` field `layer` becomes `kind`, since it describes a component's
  kind, with the package layer derived from the package. Both names are read during a
  deprecation window.
- New layers, groups or exceptions to the dependency rule need a new ADR.

## Alternatives considered

- **Keep descriptive groups only.** Rejected: groups don't constrain dependencies, which is how the
  seams appeared.
- **Two layers only** (foundation folded into primitives). Rejected: it loses the "ui never
  imports chat" rule; the two levels are kept as the presentation instead.
- **"Capabilities" for the middle layer**, avoiding the clash with the UI tier. Rejected in favour
  of "primitives" and renaming the UI tier to "elements", a local change.
- **Rename blocks to modules.** Rejected: `defineBlock` and `genesis add` already ship, and
  primitives ship blocks too (push, notifications, ai-providers).
- **A default plan in the module's metadata.** Rejected: commercial choices stay with the app.
- **Plugins discovered at runtime** (Backstage, Payload). Rejected: Genesis installs modules
  explicitly with `genesis add`, so the app's migrations folder stays the one record of its
  database.
