// =====================================================================
// @marktiderman/genesis-switchboard — the pluggable data layer for the Genesis
// Factory, built as a SHARED cross-runtime framework (Node + Deno + RN).
//
// Two independent axes that COMPOSE:
//   • LEVELS — HOW a resource is backed (L1 Code · L2 Middle · L3 Production).
//   • TIERS  — AT WHAT GRANULARITY you choose the backing (A env · B resource
//              · C field), resolved with precedence C > B > A.
//
// The app calls data.resource('x').list() and never knows the Level. See
// SWITCHBOARD.md for the full authoritative design.
// =====================================================================

// -- types & axes ----------------------------------------------------
export * from "./types";

// -- registry + bind (Tier A/B/C) ------------------------------------
export { Registry } from "./registry";

// -- adapter interface + concrete adapters ---------------------------
export { type Adapter, ReadOnlyAdapterError, UnknownResourceError, asWritable } from "./adapters/adapter";
export { CodeAdapter, type CodeAdapterOptions } from "./adapters/code";
export {
  AirtableAdapter,
  type AirtableAdapterConfig,
  type AirtableResourceMap,
  type FetchLike,
} from "./adapters/airtable";
export {
  SupabaseAdapter,
  type SupabaseAdapterConfig,
  type SupabaseClientLike,
  type SupabaseQueryBuilder,
  type SupabaseResourceMap,
} from "./adapters/supabase";
export {
  NotionAdapter,
  type NotionAdapterConfig,
  type NotionResourceMap,
  type NotionPropertyMap,
  type NotionPropertyType,
} from "./adapters/notion";

// Browser-safe gitdata helpers (no node:fs). Node attach lives at ./gitdata.
export { gitdataMdContract, gitdataResourceName } from "./gitdata-names";

// -- resolver (the data client) --------------------------------------
export { Switchboard, type ResourceClient } from "./resolver";

// NOTE: the Genesis-core DataProvider bridge (createSwitchboardProvider,
// WC46/U4) is NOT re-exported here. It lives at the `./data-provider`
// subpath instead — its module has an `import type` on
// `@marktiderman/genesis-core/provider`, an optional peer. A consumer with
// `skipLibCheck: false` who imports ANYTHING from this root barrel still
// resolves every re-exported module's full type surface, so bundling that
// import into the barrel would force genesis-core to be resolvable even for
// consumers who only want e.g. Switchboard/CodeAdapter and have never heard
// of it. Same reasoning as `./gitdata`'s split (a Node-only concern there;
// an optional-peer concern here).

// -- introspection (WC46.015) — zero-config schema discovery from data --
export { introspectFields, inferFieldType } from "./introspect";

// -- staleness (degraded-read marker; driftReport/promote honor it) --
export { markStale, staleInfo, propagateStale, type StaleReadInfo } from "./staleness";

// -- reconciliation (drift report + model reconcile + promote) -------
export {
  driftReport,
  reconcileModel,
  promote,
  type DriftReport,
  type FieldDrift,
  type RowDrift,
  type ValueDrift,
  type ResourceReconcile,
  type ModelReconcileReport,
  type ModelReconcileSummary,
  type ReconcileModelOptions,
  type PromoteOptions,
  type PromoteResult,
} from "./reconcile";

// -- worked-example resources (tickets + features) --------------------
// A Tier-B mixed-source demonstration: `tickets` bound to Supabase while
// `features` stays on Airtable, simultaneously, with environment default
// = Airtable. See resources.ts.
export {
  AIRTABLE_BASE_ID,
  ticketsContract,
  ticketsAirtableMap,
  ticketsSupabaseMap,
  featuresContract,
  featuresAirtableMap,
  featuresSupabaseMap,
  type TicketRow,
  type FeatureRow,
} from "./resources";
