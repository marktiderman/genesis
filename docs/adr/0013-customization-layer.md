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
| 5. **Own** | something Genesis doesn't do | the app's own components, routes, workflows and tables | the app's repository, with a gap in `docs/genesis-upstream.md` |

Rules:

1. **Lowest level first.** An agent or a person tries Configure before Brand, Brand before
   Compose, and so on. `genesis doctor` keeps steering away from re-implementing what a lower
   level already does.
2. **Own is legitimate, and recorded.** Code at level 5 stays in the app and is registered as a
   gap, extension or invention. When a second app needs it, it is promoted into Genesis (G4) and
   the app deletes its copy.
3. **No eject.** An app never copies a Genesis component to change it (PACKAGE-STRATEGY, R6).
   When levels 1–4 can't reach a need, the gap names the missing extension point and Genesis adds
   it.
4. **Every primitive and module lists its levels**, in the form ADR 0012 uses for media. A
   package that offers no Compose or Adapt level says so.
5. **The words are the glossary's**: configure, brand, compose, adapt, own. Docs, the catalog
   (`genesis catalog`), the agent guide and reviews use them.

## Consequences

- The 80% path is levels 1–4 everywhere; an app's uniqueness is level 5, and visible as such.
- `genesis agents` writes the five levels into every app's agent guide, so agents customize in
  the right place.
- A later check (doctor) can flag a local component that duplicates a Genesis part reachable at a
  lower level.
