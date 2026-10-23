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
  /** Human label, e.g. "Date of birth". Absent means a UI derives one from `name`. */
  readonly label?: string;
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
 * table keyed on `(team_id, user_id)`). Use {@link keyFields} to read it as
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
  /** True when this user may add rows. Absent means the provider doesn't say. */
  readonly create?: boolean;
  /** True when this user may delete rows they can see. */
  readonly delete?: boolean;
  /** True when this user may read a row's audit history. */
  readonly history?: boolean;
  /** True when this user may read and add comments on rows they can see. */
  readonly comment?: boolean;
  /** Why `create`, `delete`, `history` or `comment` is false, in one human sentence each. */
  readonly reasons?: {
    readonly create?: string;
    readonly delete?: string;
    readonly history?: string;
    readonly comment?: string;
  };
}

/**
 * How another resource relates to this one, from the store's foreign keys.
 *
 * - `one`: a field on THIS resource points at one row of `resource`.
 * - `many`: rows of `resource` point at this row through their `field`.
 * - `through`: many rows of `resource`, linked by the junction resource in
 *   `through` (a table whose key is two foreign keys).
 */
export interface ResourceRelation {
  readonly kind: "one" | "many" | "through";
  /** The related resource. */
  readonly resource: string;
  /**
   * `one`: the field on this resource. `many`: the field on `resource` that
   * holds this row's key. `through`: the junction's field holding this row's key.
   */
  readonly field: string;
  /** For `through`: the junction resource, and its field pointing at `resource`. */
  readonly through?: { readonly resource: string; readonly otherField: string };
  /** True when at most one related row can exist (a unique foreign key). */
  readonly unique?: boolean;
}

/**
 * The column a provider checks on every update so an edit never silently
 * overwrites someone else's. Only reported when the store itself advances it
 * on every successful update (a trigger such as `moddatetime`), because a
 * column nothing advances detects nothing.
 */
export interface VersionField {
  /**
   * The field holding the version. A provider with versioned writes returns
   * each row with its exact version token in this field, as a string, and
   * `expectedVersion` echoes `String(row[field])` back unchanged.
   */
  readonly field: string;
  /**
   * `row`: no column tracks versions, so the token is a fingerprint of the
   * row's values, and `field` is a name the provider adds to each record
   * (it is not one of the resource's fields).
   */
  readonly kind: "integer" | "timestamp" | "row";
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
  /** The field that best names a row to a person (a name or title), for links and pickers. */
  readonly labelField?: string;
  /** Resources this one links to or is linked from. Only ones this user may see. */
  readonly relations?: readonly ResourceRelation[];
  /** Fields the user may set when creating a row. Absent when creating isn't allowed. */
  readonly createFields?: readonly string[];
  /** Row actions this user may run: each calls the app's own function on one row. */
  readonly actions?: readonly RowAction[];
}

/** A named operation on one row, carried out by the app's own database function. */
export interface RowAction {
  readonly name: string;
  readonly label: string;
  /** Ask before running, with this question. */
  readonly confirm?: string;
  /** One sentence on what it does. */
  readonly description?: string;
}

/** A comment on a record. */
export interface RecordComment {
  readonly id: string;
  /** The signed-in user who wrote it (the token's `sub`). */
  readonly author: string;
  readonly body: string;
  /** ISO 8601, as the store recorded it. */
  readonly createdAt: string;
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
  /** Server-side sort by several fields at once (`ListParams.sorts`). */
  readonly multiSort?: boolean;
  /** `create` and `deleteOne` are served, subject to each resource's access. */
  readonly create?: boolean;
  readonly delete?: boolean;
  /** `history` is served, subject to each resource's access. */
  readonly history?: boolean;
  /** `importRows` is served, with a dry run. */
  readonly import?: boolean;
  /** `undo` is served. */
  readonly undo?: boolean;
  /** `runAction` is served. */
  readonly actions?: boolean;
  /** `comments` and `addComment` are served. */
  readonly comments?: boolean;
  /**
   * The most rows one `getList` page may ask for. A request for more is
   * refused (it is not cut short, which would shift later page boundaries),
   * so a client that wants every row must page at this size or less.
   */
  readonly maxPerPage?: number;
  /**
   * A delete moves the record to a recycle bin (it can be restored) instead
   * of removing it. Asked per resource: `capabilities(resource)`.
   */
  readonly softDelete?: boolean;
  /**
   * `create`, `update` and `deleteOne` honour `keepalive: true` in their
   * params (e.g. `fetch(url, { keepalive: true })`), so a write sent while
   * the page unloads still reaches the server. Without it, closing the tab
   * while an optimistic or undoable write is being sent shows the browser's
   * "Leave site?" prompt.
   */
  readonly keepaliveWrites?: boolean;
  /**
   * `subscribe` reports changes to this resource (asked per resource:
   * `capabilities(resource)`), so `live` lists and records refresh when
   * someone else changes them.
   */
  readonly realtime?: boolean;
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
  /** `run` is a row action; `rowAction` names it. */
  readonly action: "create" | "update" | "delete" | "run";
  /** For `run`: which row action. */
  readonly rowAction?: string;
  /** Values of the changed fields before the edit. */
  readonly before: DataRow | null;
  /** Values of the changed fields after the edit. */
  readonly after: DataRow | null;
}
