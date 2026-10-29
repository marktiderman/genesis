# Genesis docs

- [`FRAMEWORK.md`](./FRAMEWORK.md) — **The Genesis Way.** Part 1: why Genesis exists and how
  we decide where code goes (reuse, then extend, then invent; config vs custom code; how an
  invention moves up into Genesis). Part 2: the layered contract (tokens → primitives →
  patterns → layouts → data-bound) that decides what belongs in Genesis and what doesn't.
  Read this before building anything.
- [`RESOURCE-VIEW.md`](./RESOURCE-VIEW.md): one description per resource. `defineView` and
  `<ResourceView>` for lists, `defineRecordView` and `<RecordView>` for one record, the same view on
  the phone, scope, guards and the security model. Read this before building a data screen.
- [`component-reference.md`](./component-reference.md) — auto-generated catalogue of every
  export of every entry point of every published package. Regenerate with
  `pnpm gen:component-reference`. The same data drives the package pages at
  [genesisone.dev/packages](https://genesisone.dev/packages).
- [`CHARTER.md`](./CHARTER.md): what Genesis is for, its scope and non-goals, and how decisions
  are made.
- [`GLOSSARY.md`](./GLOSSARY.md): one word per concept, and the synonyms not to use (draft).
- [`REFERENCES.md`](./REFERENCES.md): the outside projects Genesis models itself on, what it takes
  from each and where it differs, with a last-checked date per row.
- [`adr/`](./adr/): the architecture decisions:
  [0001 one feature gate](./adr/0001-one-feature-gate.md),
  [0002 the product system](./adr/0002-product-system.md),
  [0003 navigation zones](./adr/0003-navigation-zones.md),
  [0004 workspaces](./adr/0004-workspaces.md),
  [0005 package layers](./adr/0005-package-layers.md),
  [0006 AI direction](./adr/0006-ai-direction.md).
- [`PACKAGE-STRATEGY.md`](./PACKAGE-STRATEGY.md): proposal for how the packages are grouped
  (foundation, app shells, platform services, domain blocks, tooling), what the apps on Genesis
  use today, what Linear, Cursor and the leading starter kits build once, and a ranked, sized list
  of what Genesis should build next.
- [`AI.md`](./AI.md): proposal for `genesis-ai`, one server-side layer for every AI call an app
  makes (consent, gate, budgets, server-side loading, usage, tracing) and a control plane to manage
  it, built first for chat and then, in a coaching track, for personalised guidance, client
  feedback and goals whose progress stacks; with research on the alternatives and on Anthropic's
  and OpenAI's guidance.
- [`AI-COACHING-RESEARCH.md`](./AI-COACHING-RESEARCH.md): reference for `AI.md`: lessons from an
  app that ran AI in production, and what the leading fitness, health, coaching and goal apps do
  with AI, with sources.
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
- [`SITES.md`](./SITES.md): Genesis Sites, landing pages and small sites from a section
  registry, the visual editor, publishing and the Supabase schema.
- [`NOTIFICATIONS.md`](./NOTIFICATIONS.md): `genesis-notifications`, the one notifier (in-app,
  push, email) and its contract with the domains that use it.
  [`NOTIFICATIONS-V1.1.md`](./NOTIFICATIONS-V1.1.md) is the next version's design, in review.
- [`COLLABORATION.md`](./COLLABORATION.md): sharing spaces and visibility rules (`genesis-collab`),
  proposal and build order.
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
