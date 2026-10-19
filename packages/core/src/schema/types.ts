// ---------------------------------------------------------------------------
// The one schema model (docs/DATA-STUDIO.md decisions 11, 12, 13, 30)
//
// Promoted from @marktiderman/genesis-switchboard, which keeps deprecated
// aliases for one deprecation window. Everything here is a type or a pure
// helper with no React, no runtime dependency and no I/O, so a server, an
// edge function or the switchboard can import it without pulling in the
// React half of this package.
// ---------------------------------------------------------------------------

import type { FieldType as WidgetHint } from "../form-types";

export type { WidgetHint };

/**
 * Portable storage type of a field — what kind of value the store holds,
 * independent of how a UI should edit it. The exact native type, when the
 * store reports one, is on {@link FieldSchema.dbType}.
 *
 * Exactly the six types the switchboard shipped as `FieldType`, so existing
 * exhaustive maps over it keep compiling. Finer distinctions (date versus
 * timestamp, enum, uuid) live in `dbType` and `widget`, not here.
 */
export type StorageType = "string" | "number" | "boolean" | "datetime" | "json" | "relation";

/** A canonical, provider-agnostic row. Keys are field names from the schema. */
export type DataRow = Record<string, unknown>;

/**
 * What the CURRENT user may do with one field. Reported by a provider's
 * `describe()`; never inferred in the browser.
 *
 * `read: false` means the value is never sent to this user, so the column
 * must not render at all (an answer key, a payout amount). `update: false`
 * with `read: true` renders the column read-only.
 */
export interface FieldPermissions {
  readonly read: boolean;
  readonly update: boolean;
  /** Why `update` (or `read`) is false, in one human sentence. */
  readonly reason?: string;
}

/** A foreign-key style link from this field to another resource's field. */
export interface FieldReference {
  readonly resource: string;
  readonly field: string;
}

export interface FieldSchema {
  /** Canonical field name in the resource's shape (provider-agnostic). */
  readonly name: string;
  /** Portable storage type. */
  readonly type: StorageType;
  /** True when a row may omit this field. */
  readonly optional?: boolean;
  /**
   * True when the field holds an ORDERED LIST of `type` values (e.g. a
   * multi-relation like `deps`/`serves`). Promotion emits a Postgres ARRAY
   * column (`<base>[]`) instead of a lossy scalar, so the cardinality survives
   * L1→L3 (CMT-1742-014).
   */
  readonly array?: boolean;
  /** Human note (surfaces in describe()/drift reports). */
  readonly description?: string;
  /** The store's exact type, e.g. `timestamp with time zone` or `public.status`. */
  readonly dbType?: string;
  /** Which control fits this field. A hint: a UI may still choose another. */
  readonly widget?: WidgetHint;
  /** True when the store accepts null for this field. */
  readonly nullable?: boolean;
  /** True when the store fills the field itself on insert. */
  readonly hasDefault?: boolean;
  /** True when the store computes the field; it is never written. */
  readonly generated?: boolean;
  /** Allowed values, for enum-like fields. */
  readonly enumValues?: readonly string[];
  /** The resource and field this one points at, when it is a link. */
  readonly references?: FieldReference;
  /** The current user's rights on this field, when a provider reports them. */
  readonly permissions?: FieldPermissions;
}

/**
 * One declaration of a resource: its fields and its identity.
 *
 * `key` names the identity field, or several for a composite key (a junction
 * table keyed on `(coach_id, client_id)`). Use {@link keyFields} to read it as
 * a list without caring which form it took.
 */
export interface ResourceContract<Row extends DataRow = DataRow> {
  /** Resource name the app addresses, e.g. "tickets" or "public.tickets". */
  readonly name: string;
  /**
   * Identity field name, or names for a composite key, in key order.
   *
   * Typed `string` (not `keyof Row & string`) on purpose: `keyof Row` is a
   * dependent type that TypeScript checks contravariantly, which would make
   * `ResourceContract<WorkCycleRow>` non-assignable to the erased
   * `ResourceContract<DataRow>` that generic consumers accept. The key is
   * validated against the field schema at runtime instead.
   */
  readonly key: string | readonly string[];
  readonly fields: readonly FieldSchema[];
  /** Optional doc string. */
  readonly description?: string;
  /** Phantom marker so `Row` is inferable from a contract. */
  readonly __row?: Row;
}

/** What the current user may do with a whole resource. */
export interface ResourceAccess {
  readonly read: boolean;
  /** True when at least one field can be updated on rows this user can see. */
  readonly update: boolean;
  /** Why `update` (or `read`) is false, in one human sentence. */
  readonly reason?: string;
}

/**
 * The column a provider checks on every update so an edit never silently
 * overwrites someone else's. Only reported when the store itself advances it
 * on every successful update (a trigger such as `moddatetime`), because a
 * column nothing advances detects nothing.
 */
export interface VersionField {
  readonly field: string;
  readonly kind: "integer" | "timestamp";
}

/**
 * A resource as `describe()` reports it for the CURRENT user: the contract,
 * plus what this user may do. Fields the user may not read are left out
 * entirely, not marked hidden.
 */
export interface ResourceSchema<Row extends DataRow = DataRow> extends ResourceContract<Row> {
  /** Human label, e.g. "Clients". */
  readonly label?: string;
  readonly access: ResourceAccess;
  /** Present only when writes can be version-checked. */
  readonly version?: VersionField;
}

/** One entry of `listResources()`: enough to draw a sidebar. */
export interface ResourceSummary {
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly access: ResourceAccess;
}

/** Filter operators a provider may support. Mirrors `FilterParam["operator"]`. */
export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "contains"
  | "in"
  | "between"
  | "is_null"
  | "is_not_null";

/**
 * What a provider can do. A UI hides any control the provider cannot serve,
 * instead of letting it error (DATA-STUDIO.md decision 9).
 */
export interface ProviderCapabilities {
  /** Server-side text search across fields. */
  readonly search: boolean;
  /** Server-side sort. */
  readonly sort: boolean;
  /** Server-side filter operators. Empty means no server filtering. */
  readonly filterOperators: readonly FilterOperator[];
  /** `updateMany` / `deleteMany` in one transaction. */
  readonly bulkWrites: boolean;
  /** Updates honour `expectedVersion` and reject stale writes. */
  readonly versionedWrites: boolean;
  /** Records may be keyed by more than one field. */
  readonly compositeKeys: boolean;
}

/** One audit record, as committed alongside the edit it describes. */
export interface AuditEntry {
  readonly id: string;
  /** ISO 8601 timestamp, as the store recorded it. */
  readonly occurredAt: string;
  /** The signed-in user who made the edit (the token's `sub`). */
  readonly actor: string | null;
  readonly resource: string;
  /** The record's key, field name → value. */
  readonly key: DataRow;
  readonly action: "create" | "update" | "delete";
  /** Values of the changed fields before the edit. */
  readonly before: DataRow | null;
  /** Values of the changed fields after the edit. */
  readonly after: DataRow | null;
}
