# ADR 0007: Tenancy nouns and the tenant model

- Status: accepted (direction approved by the maintainer, 2026-10-29; the model ships in phases below)
- Date: 2026-10-29
- Features: `tenant-model`, `workspaces`, `tenant-features`
- Related: ADR 0001 (one feature gate), ADR 0004 (workspaces), ADR 0005 (layers)

## Context

Every Genesis app is multi-tenant, and two apps on it rebuilt the same structure on their own: an
organization, the places it runs (a gym's locations, a school's campuses), and the people in it.
The words drifted with it. Genesis's own tables say `tenant_id` (123 uses across the
notifications, supabase, collab and ai migrations); the feature gate scopes to a tenant (ADR
0001); ADR 0004 made **workspace** mean where the viewer is working and **scope** the filter
views read (`{ orgId }`); app tables in examples say `org_id`; one app says practice, another
account. The taxonomy audit (T1) and the greenfield review (GF4) both asked for one decision,
and they disagreed on the column name.

## Decision

### 1. The nouns

| Word | Means | Where |
| --- | --- | --- |
| **tenant** | The isolation boundary that owns rows and that the feature gate, entitlements and budgets scope to. | Code, SQL (`tenant_id`), the gate, docs. |
| **organization** | What a tenant is, as people say it. | User-facing copy, an app's labels. Never a Genesis type or column. |
| **location** | A place a tenant runs (a site, a campus, a studio). | A workspace kind and a table; see 2. |
| **person** | Someone in a tenant: staff, a client, a member, with roles there. | `person_id`; the app's people table, read through `private.genesis_viewer_people`. |
| **workspace** | Where the viewer is working: one tenant, a location, a roll-up, personal (ADR 0004). | The switcher and the URL. |
| **scope** | The row filter a workspace gives views (`ResourceScope`). | Views, providers. |

Not used for a tenant in Genesis: practice, account (the login account), team, org (as a type),
company. An app keeps its own word in its copy and maps it in its CONTEXT doc (the vocabulary rule).

### 2. The model: tenant → location → person

- A **tenant** row is the root, owned by Genesis (`genesis_tenants`, keyed `tenant_id`). An app
  that already has an organizations table points `genesis_tenants` at it instead of copying it.
- A **location** belongs to one tenant (`tenant_id`, `location_id`). It is optional: a tenant
  with one place never sees the word. A location is also a workspace kind, so the switcher can
  show "Acme · Downtown" and views scope to `{ tenantId, locationId }`.
- A **person** is a record in one tenant (`tenant_id`, `person_id`, roles, optionally
  `location_id`), as genesis-supabase already models it: the app's people table, which Genesis
  reads through `private.genesis_viewer_people(viewer)` (one row per tenant the login is in). One
  login can be a person in many tenants, which is what the roll-up workspace reads.
- Every Genesis-owned table that holds tenant data carries `tenant_id` from its first migration,
  with row-level security through one function per check (`genesis_*.is_member(tenant_id)`),
  pgTAP-tested with a NULL user and a NULL role.

### 3. The column is `tenant_id`

Genesis tables say `tenant_id`. An app's own tables may say what the app already says
(`org_id`, `practice_id`): the view's `scope` maps the workspace's key to the app's column, as it
does today (`scope: ["org_id"]`), so no app renames columns for this ADR. `ResourceScope`'s
`orgId` key stays as it is in genesis-core 2.x; a `tenantId` alias comes with the tenant model's
first release, and `orgId` is deprecated in the next major, with a codemod.

## Consequences

- The glossary's tenancy section follows this table, and the glossary lint warns on the banned
  words in Genesis's own descriptions and headings.
- Apps already on another noun change their copy only if they want to; their columns stay.
- Building it is new work, tracked as `tenant-model` in features.ts, in this order:
  1. `genesis_tenants` and `is_member` (over `genesis_viewer_people`) in genesis-supabase, with
     pgTAP, adoptable by pointing at an existing organizations table;
  2. locations as a workspace kind and a scope key;
  3. `genesis init` starting every new app on it, with the `tenantId` scope alias.
- Rejected: "organization" everywhere (renames 123 Genesis uses for a word apps already show
  their way), and "account" (collides with the login account).
