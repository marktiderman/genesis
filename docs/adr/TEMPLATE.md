# ADR NNNN: <the decision, as a noun phrase>

<!--
Copy to docs/adr/NNNN-short-name.md (the next free number; check open pull requests too).
An ADR is required for: a new package, a new glossary term or a changed definition, a new layer
or group, a new subpath kind, or a breaking rename. Fixes and additive variants need none.
Announce it to the sessions working in the area (AGENTS.md, step 4) and leave at least two
days for comment; the maintainer signs it off by merging.
-->

- Status: proposed | accepted | superseded by ADR NNNN
- Date: YYYY-MM-DD
- Features: `<feature ids in features.ts>`
- Related: <ADRs, docs>

## Context

The need, in a paragraph or two: what an app or Genesis cannot do today, and the evidence (which
apps, which register entries in their `genesis-upstream.md`, which issues).

`genesis find` / `pnpm features find` results for the need, and why each hit does not fit
(reuse, then extend, then invent: docs/FRAMEWORK.md G1–G4).

## Decision

What changes, in numbered points. Name the package, its layer and group (ADR 0005), its entry
points and its public names.

## Glossary

The terms this adds or changes, with their definition and the words not to use for them
(docs/GLOSSARY.md). "None" when it adds no noun.

## Alternatives

Each option considered, with why it lost.

## Consequences

What apps and packages must do, the deprecation plan for anything renamed (an alias, `@deprecated`,
a MIGRATION.md entry, a codemod when mechanical; removal only in a major), and what is left for
later.
