# Genesis docs

- [`FRAMEWORK.md`](./FRAMEWORK.md) — **The Genesis Way.** Part 1: why Genesis exists and how
  we decide where code goes (reuse, then extend, then invent; config vs custom code; how an
  invention moves up into Genesis). Part 2: the layered contract (tokens → primitives →
  patterns → layouts → data-bound) that decides what belongs in Genesis and what doesn't.
  Read this before building anything.
- [`component-reference.md`](./component-reference.md) — auto-generated catalogue of every
  export across every package. Regenerate with `pnpm gen:component-reference`.
- [`DATA-STUDIO.md`](./DATA-STUDIO.md): proposal for an Airtable-style data workspace built on the
  data-bound layer. It covers the server handler that acts as the user, the generated schema contract,
  write safety, the roadmap, and the decisions still open.
- [`FORMS.md`](./FORMS.md): proposal for Genesis Forms, an open-source, schema-driven form system
  (feedback, onboarding, intake, exercises, lead qualification) with branching, scoring,
  partials, server validation and a builder. It includes research on Typeform, Tally, Fillout,
  Google Forms, SurveyJS and others, and the first milestone: session feedback.
- [`../packages/extension/README.md`](../packages/extension/README.md): building Chrome extensions
  with Genesis (messaging, settings, panel / top bar / side panel, an in-page bar, native helpers,
  React pages on Genesis UI, a `chrome.*` fake for tests).
- [`APP-CI.md`](./APP-CI.md): the reusable workflows an app's CI calls (`app-ci`, `supabase-ci`,
  `genesis-upgrade`), the caller templates in `templates/ci/`, and which Genesis ref to call.
- [`NATIVE-RELEASE.md`](./NATIVE-RELEASE.md): a native app's release path on EAS Workflows (pull
  request previews with `repack`, fingerprint deploys, staged updates with promote and rollback)
  and its Maestro smoke flows; templates in `templates/eas/` and `templates/maestro/`.
- [`RELEASING.md`](./RELEASING.md): how Genesis packages are published, and one Genesis version per app.
- [`MIGRATION.md`](./MIGRATION.md) — per-version migration notes. Appended to at every
  release; newest on top.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — setup, branch/PR flow, changesets, gates.
- [`../README.md`](../README.md) — package index, quickstart, reference apps.
