# Genesis docs

- [`FRAMEWORK.md`](./FRAMEWORK.md) — the layered contract (tokens → primitives → patterns →
  layouts → data-bound) that decides what belongs in Genesis and what doesn't. Read this
  before proposing a new component.
- [`component-reference.md`](./component-reference.md) — auto-generated catalogue of every
  export across every package. Regenerate with `pnpm gen:component-reference`.
- [`DATA-STUDIO.md`](./DATA-STUDIO.md): proposal for an Airtable-style data workspace built on the
  data-bound layer. It covers the server handler that acts as the user, the generated schema contract,
  write safety, the roadmap, and the decisions still open.
- [`FORMS.md`](./FORMS.md): proposal for Genesis Forms, an open-source, schema-driven form system
  (feedback, onboarding, intake, worksheets, lead qualification) with branching, scoring,
  partials, server validation and a builder. It includes research on Typeform, Tally, Fillout,
  Google Forms, SurveyJS and others, and the first milestone: CrossFit Fairfield feedback.
- [`MIGRATION.md`](./MIGRATION.md) — per-version migration notes. Appended to at every
  release; newest on top.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — setup, branch/PR flow, changesets, gates.
- [`../README.md`](../README.md) — package index, quickstart, reference apps.
