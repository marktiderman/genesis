# ADR 0002: The product system

- Status: proposed
- Date: 2026-10-26
- Features: `product-roadmap`, `product-insights`, `product-releases`, `feature-voting`, `support-feedback`, `feature-mirror`

## Context

Teams using a Genesis app need to run their own digital products from it: the products, their
features and roadmap, the ideas and feedback people send, votes and discussion, and release notes
that close the loop. Several pieces exist already:

- `genesis-support` keeps feedback and an idea board with votes in the app's own database.
- `genesis-product` builds a Now / Next / Later board, a triage inbox and release notes from one
  repository's `features.ts`, with GitHub issues as its only source of signals.
- ADR 0001 mirrors the app's own registry into its database for the feature gate.

What is missing is the shape that lets one app manage **many products**, owned by its tenants, and
lets people and agents add ideas and vote in one place.

## Decision

### 1. Two layers, kept apart

|            | The gate (ADR 0001)                    | The product system (this ADR)                                         |
| ---------- | -------------------------------------- | --------------------------------------------------------------------- |
| Answers    | "Is this feature on here, now?"        | "What are we building, for whom, and why?"                            |
| Covers     | The app's **own** features             | **Any** product a tenant runs, including products that live elsewhere |
| Lives in   | `genesis-supabase` migration 0008      | `genesis-product` migrations, on top of `genesis-support`             |
| Written by | Deploys (sync), billing, tenant admins | People, agents, staff, and syncs from product repos                   |

The product system reads the gate's mirror for the host app's own product instead of keeping a
second copy of it. Nothing in the gate depends on the product system.

### 2. The model (generic; the app decides what an owner is)

- **owner**: a tenant uuid, as in `tenant_features`. Membership and staff rights come from the
  app's hooks. Whether the owner is an organization, a team or a workspace is the app's choice.
- **brand**: a name, a look and optional domains. An owner has any number; a product may use an
  existing brand or a new one.
- **product**: owner, brand, name, slug, kind (app, website, service), visibility (private,
  members, public), links (repository, website, landing page), and **source**: `synced` (its
  features come from a repository's `features.json`) or `managed` (edited in the app).
- **feature**: `(product, id)`, the registry fields (status, horizon, summary, access, record).
  Synced features are read-only in the app; managed ones are edited there.
- **idea**: support's idea, plus `product` and an optional linked `feature`. An idea linked to a
  feature takes its status from the feature (idea, planned, in progress, beta, shipped, closed);
  only unlinked ideas are triaged by hand.
- **vote**: one per voter per idea, from a person or an agent (section 4).
- **discussion**: a genesis-chat conversation of kind `idea` per idea, created on first comment.
- **release** and **release item**: draft, published or withdrawn; new, improved or fixed; a
  customer note. Published from changeset `Features:` lines and registry status changes.
- **subscription**: follow a product, feature or idea. Voters follow automatically.

### 3. Packages

- `genesis-support` stays usable alone: feedback, the idea board and votes. It gains the
  **embeddable feedback widget** (a publishable key per product, an origin allow-list, signed
  identity), so a product that is not a Genesis app can still send feedback and ideas.
- `genesis-product` depends on `genesis-support` and `genesis-notifications`. It adds owners'
  brands and products, features per product, idea links and derived status, discussion, releases,
  subscriptions, the roadmap and changelog screens, and a **public portal** (board, roadmap,
  changelog) for products marked public, rendered with `genesis-sites` sections.
- Opinions belong to the app: how products tie into an app's planning model (for example quarterly
  goals that point at features), dashboards, and who may see what.

### 4. Agents take part like people, and are counted apart

An agent is a login the owner creates (an **agent member**), with a name and the person who runs
it. Agents can file ideas, comment and vote through the same functions as people, with a token
scoped to one owner. Every idea shows people's votes and agents' votes as separate counts, and
ranking uses people's votes unless the owner chooses otherwise. A CLI (`genesis product idea add`,
`genesis product vote`) lets agents work without a browser.

### 5. Where the data lives

- **Now:** everything above lives in the host app's database.
- **A product's own users stay in the product's own database.** When a product runs on its own
  stack (another Supabase project, another company), its feedback, ideas and accounts are kept
  there by its own `genesis-support`.
- **Sync, when needed, is a contract, not shared tables:**
  - Up: the product's ideas and feedback arrive in the host as signals (title, kind, counts,
    product, linked feature, an external reference), without personal data.
  - Down: feature status, releases and replies flow back so the product can tell its own users.
  - Either side can start: a pull (a `SignalSource`) or a push (a signed webhook).

  Every synced row carries `source` and `external_ref`, so a later sync never needs a schema change.

- The host's copy of a synced product's registry comes from that product's `features.json`, sent by
  its deploy (`syncFeatureRegistry` with a product id), never typed in by hand.

### 6. Folding in earlier work

An earlier stand-alone project holds a first version of this model: organizations, features with
parents, releases, sprints and work cycles, feedback with votes, and an embeddable widget platform.
Its feedback widget and origin allow-list move into `genesis-support` (section 3). Its feature
hierarchy maps onto `feature-hierarchy`, and its releases onto this ADR's releases. Its sprints and
work cycles are delivery tracking, which stays out of Genesis until a second app needs it. Data is
migrated once, then that project's tables are retired.

## Consequences

- One app can run many products for many owners, and a product's roadmap, ideas and releases sit
  next to the rest of the owner's work.
- The planned `genesis-product` migration drops its own copy of the host app's registry and reads
  migration 0008's `features` table; products from other repositories get their own rows keyed by
  product.
- Agents become first-class contributors without inflating what people asked for.
- A product can move its users and feedback to its own database later without changing the model.

## Open questions

1. Is a brand owned by an owner only, or can products from different owners share one?
2. Public portal: on the product's own domain, the host's domain, or both?
3. Agent votes: shown to everyone, or only to the owner's staff?
