# ADR 0013: The customization layer: five levels, one vocabulary

- Status: accepted (2026-10-29)
- Date: 2026-10-29
- Features: `genesis-catalog`, `genesis-upstream`, `design-system`
- Related: docs/FRAMEWORK.md (G1–G5, rule 7), ADR 0005 (layers), ADR 0012 (media primitives)

## Context

Genesis should get any app most of the way with what it ships, and leave what makes an app
unique in the app's own repository. Genesis already has the parts: props and variants, view
descriptions, brand tokens and design systems, slots, `slotProps` and named parts, adapters at
every seam, and the register of gaps (`genesis upstream`). What it lacks is one vocabulary, so a
person or an agent knows, for any package, how far they can go without forking and where the
app's own code starts.

## Decision

Every customization is at one of five levels, tried in order. A package documents which levels
it offers, in its README and SKILL.md, with these names.

| Level | What changes | How | Where it lives |
| --- | --- | --- | --- |
| 1. **Configure** | behaviour, by data | options, props, variants, view descriptions (fields, columns, `can`, scope), feature flags | the app's config and descriptions |
| 2. **Brand** | the look, everywhere at once | design tokens, a brand or design system, fonts, icons | the app's brand (design-system schema) |
| 3. **Compose** | the shape of a screen | slots, `slotProps`, named parts and `classNames`; Genesis elements arranged in the app's own pages | the app's routes, using Genesis parts |
| 4. **Adapt** | what sits behind a seam | adapters: data provider, storage, video, email, SMS, AI vendor, payments | an adapter object passed in config |
| 5. **Own** | something Genesis doesn't do | the app's own components, routes, workflows and tables | the app's repository; an entry in `docs/genesis-upstream.md` when it is a gap or worth sharing |

Rules:

1. **Lowest level first.** An agent or a person tries Configure before Brand, Brand before
   Compose, and so on. `genesis doctor` keeps steering away from re-implementing what a lower
   level already does.
2. **Own is legitimate.** Code at level 5 stays in the app. It is registered in
   `docs/genesis-upstream.md` when it works around something Genesis should do (a gap) or could
   serve another app (an extension or invention); what is unique to the app needs no entry (G3).
   When a second app needs it, it is promoted into Genesis (G4) and the app deletes its copy.
3. **No eject.** An app never copies a Genesis component to change it (PACKAGE-STRATEGY, R6).
   When levels 1–4 can't reach a need that a Genesis part should cover, the gap names the missing
   extension point and Genesis adds it; a need no Genesis part covers is level 5.
4. **Every primitive and module lists its levels**, in the form ADR 0012 uses for media. A
   package that offers no Compose or Adapt level says so.
5. **The words are the glossary's**: configure, brand, compose, adapt, own. Docs, the catalog
   (`genesis catalog`), the agent guide and reviews use them.

### Upgrades plug in; primitives never import them (added 2026-10-30)

An optional or premium capability (a media library, a video player, a payments provider) reaches
a primitive at level 4, **Adapt**, never as a dependency:

1. **The primitive owns the port.** It defines the interface (for example an uploader for forms
   and chat), and it keeps a built-in default so it works with nothing else installed.
2. **The upgrade ships the adapter.** The optional package exports adapters for the primitives it
   serves (`<upgrade>/forms`, `<upgrade>/chat`), and it may depend on those primitives.
3. **The app opts in** by passing the adapter in config. Removing the upgrade never breaks the
   primitive.
4. **Enforced by the layering check.** A package marks itself `"genesis": { "optional": true }`.
   No foundation package or primitive may use it; an optional peer dependency
   (`peerDependenciesMeta.<name>.optional`) is the one allowed edge. Modules are already out of
   a primitive's reach by layer.

This is how a public engine and premium parts can coexist: the engine is complete on its own,
and premium parts plug into ports it defines.

## Consequences

- The 80% path is levels 1–4 everywhere; an app's uniqueness is level 5, and visible as such.
- Planned, not built yet: `genesis agents` writes the five levels into every app's agent guide,
  so agents customize in the right place (feature `agent-rules`).
- Planned, not built yet: a doctor check that flags a local component duplicating a Genesis part
  reachable at a lower level.
