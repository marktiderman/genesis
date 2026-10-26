# ADR 0001: One feature gate

- Status: accepted
- Date: 2026-10-26
- Features: `feature-gate`, `feature-mirror`, `flag-provider`, `entitlements`, `tenant-features`

## Context

A Genesis app asks "is this feature on here?" in many places: navigation, Settings, routes, server
functions, database policies, background jobs and agents. Without one answer, each place grows its
own check, and they drift: a menu item hides while its route still works, or a paid feature's
button locks while its server function still accepts writes.

The registry (`features.ts`, `flags.json`) already says what exists and how it ships. What was
missing is one function that combines the registry with the runtime state that changes without a
deploy: who pays for what, which features a tenant turned off, and flag values.

## Decision

### 1. One function, a fixed order, a reason

`featureOn(registry, context, id)` returns `{ on, reason, unlock? }`. Checks run in this order
and the first "no" wins:

| #   | Check       | Off when                                       | Reason                             |
| --- | ----------- | ---------------------------------------------- | ---------------------------------- |
| 1   | status      | not beta, live or deprecated                   | `status`                           |
| 2   | platform    | not shipped on this platform                   | `platform`                         |
| 3   | entitlement | `access: { plan }` and no active entitlement   | `entitlement` (with `unlock.plan`) |
| 4   | tenant      | the tenant switched it off                     | `tenant`                           |
| 5   | flag        | a boolean release flag of the feature is false | `flag`                             |

An id that isn't in the registry is off with reason `unknown`.

The same function runs in browsers, React Native, Node and edge functions (`/gate`, no zod).
React reads it through `FeatureGateProvider`, `useFeature` and `FeatureGate` (`/gate/react`).

### 2. Show vs enforce

The UI decides how to show an "off" (hide it, or lock it with an upgrade prompt when `reason` is
`entitlement`). Enforcement does not depend on the UI:

- **Server functions and routes** call `requireFeature` and refuse whenever the gate says off,
  whatever the reason. `FeatureOff` carries the reason; its HTTP status is 402 for
  `entitlement` and 403 otherwise.
- **Row security** refuses only on **status** and **entitlement**, through SQL `feature_on()`.
  Those two are about security and money. A tenant switch hides a feature and server functions
  refuse it, but the database does not block it: a switch is exposure, and turning one off must
  never strand or corrupt data.

### 3. The gate does not check roles

The gate answers "is this feature available to this tenant, on this platform, now". "May this
person do this" stays with roles and row security. Keeping the two apart avoids a second
permission system.

### 4. The server is the source of truth

The server reads the tenant's runtime state once per request or session and computes a
`GateSnapshot` (every feature's answer). The client receives the snapshot and never decides on
its own; it refreshes when the tenant's switches, entitlements or flags change. Because the same
function runs on both sides, they cannot disagree about the rules, only about freshness.

### 5. Where the data lives

- Feature and flag **definitions** live in code. A deploy copies them into the app's database
  (`features`, `feature_flags`, through `sync_feature_registry`), so foreign keys and SQL checks
  have real rows. The copy never goes backwards: an older build cannot overwrite a newer one.
- **Runtime state** lives in the app's own database, in Genesis migrations every app gets:
  tenant switches (`tenant_features`), entitlements (`feature_entitlements`) and per-tenant flag
  values. Who is a tenant's admin or member is the app's hook, as in `tenant_features`.
- An app never needs another service to answer the gate.

### 6. Flags

Flags stay in `flags.json` (OpenFeature manifest) with their defaults. Per-tenant values come
from the app's database through the same snapshot. The evaluation sits behind the OpenFeature
interface, so a hosted flag service can replace the database provider later without changing
call sites. Only boolean `release` and `permission` flags gate a feature; experiments and ops
flags choose a variant.

## Consequences

- Navigation, Settings and routes can be built from blocks filtered by one snapshot, on the web
  as on native.
- Every app gets the same tables and checks from Genesis migrations instead of writing its own.
- A refused write always says why, so the UI can show an upgrade instead of an error.
- Tests share one fixture: the TypeScript gate and SQL `feature_on()` must agree on status and
  entitlement.
