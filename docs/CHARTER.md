# Genesis charter

- Status: accepted
- Date: 2026-10-29

## Mission

Genesis (Genesis One) is the starting block for new apps: a layered, open-source framework on
Supabase where apps are assembled from enforced primitives and installable modules, and built
safely by people and coding agents alike.

## Scope

- The layers: foundation, primitives, modules, and the tooling beside them
  ([ADR 0005](./adr/0005-package-layers.md)).
- The package metadata, the doctor and the CLI (`genesis init`, `genesis add`, `genesis features find`,
  `genesis catalog`).
- The AI kernel and an app's MCP surface ([ADR 0006](./adr/0006-ai-direction.md)).
- Docs, the demo app and the starter.
- Governance: one [glossary](./GLOSSARY.md), one maturity ladder, the
  [reference register](./REFERENCES.md), and the path by which an app's local work moves up into
  Genesis.

## Non-goals

- An ORM or a second data layer: the database client under RLS, plus SQL functions, is the data
  layer.
- Authorization in app code: access is enforced in Postgres.
- Plugins discovered at runtime: modules are installed explicitly.
- A workflow DSL or an agent framework.
- Component copies an app ejects and owns: code ships as versioned packages.
- Any consumer app's or customer's specifics in this repository.
- Rebuilding what a vendor does well where an integration fits.

## Principles

1. **Reuse, then extend, then invent** ([FRAMEWORK](./FRAMEWORK.md) G1 to G6). Search what exists
   first; extend through props, variants, slots or composition; invent only on a miss, in the app,
   and promote it to Genesis when a second app needs it.
2. **The database enforces access.** A UI rule decides what shows; row security decides what data
   comes back.
3. **Enforced, not remembered.** Every rule a script can check is checked, in CI and in the doctor.
4. **Explicit over magic.** An app installs a module, places its navigation and switches it on per
   tenant through the feature gate.

## Decision process

The maintainer decides. Proposals bring numbered options with a recommendation. A new noun,
package, layer, subpath kind or breaking rename goes through an ADR under [`adr/`](./adr/) with a
two-day comment window. Releases into `main` need the maintainer's approval.

## Success measures

- Every app built on Genesis is scaffolded with `genesis init` and stays within one minor version
  of the current line.
- Zero layering violations; the glossary, shape and stability checks pass on new code.
- The upstream backlog shrinks: gaps are promoted into Genesis and the apps' local copies deleted.
- Genesis One 1.0 is published.
