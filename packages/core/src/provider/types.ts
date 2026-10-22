// ---------------------------------------------------------------------------
// DataProvider — the universal CRUD interface for Genesis UI
// ---------------------------------------------------------------------------

import type {
  AuditEntry,
  RecordComment,
  ProviderCapabilities,
  ResourceSchema,
  ResourceSummary,
} from "../schema/types";

/** Record identifier — supports both string UUIDs and numeric auto-increment IDs. */
export type Identifier = string | number;

/** Base record type — all resources must have an id. */
export type BaseRecord = { id: Identifier; [key: string]: unknown };

/** Pagination parameters (offset-based, with optional cursor for future use). */
export interface PaginationParam {
  page: number;
  perPage: number;
  cursor?: string;
}

/** Sort direction for a single field. */
export interface SortParam {
  field: string;
  order: "asc" | "desc";
}

/**
 * Filter expressions — discriminated union by operator.
 * Filters are AND-ed together in queries.
 */

/** Operators that compare a field against a single scalar value. */
export interface ScalarFilter {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains";
  value: string | number | boolean;
}

/** Operator that checks field membership in a list. */
export interface ArrayFilter {
  field: string;
  operator: "in";
  value: (string | number | boolean)[];
}

/** Operator that checks field is within a range. */
export interface RangeFilter {
  field: string;
  operator: "between";
  value: [string | number, string | number];
}

/** Operators that check for null/non-null — no value needed. */
export interface NullFilter {
  field: string;
  operator: "is_null" | "is_not_null";
}

export type FilterParam = ScalarFilter | ArrayFilter | RangeFilter | NullFilter;

/** Parameters for `getList`. */
export interface ListParams {
  pagination?: PaginationParam;
  sort?: SortParam;
  /**
   * Sort by several fields, first one first. Wins over `sort` on a provider
   * whose capabilities report `multiSort`; others use only `sort`.
   */
  sorts?: SortParam[];
  filters?: FilterParam[];
  /** Supabase select syntax, e.g. "*, author:profiles(name)". Mock provider ignores this. */
  select?: string;
  /** Multi-field text search (case-insensitive). */
  search?: { query: string; fields: string[] };
}

/** Result of `getList`. */
export interface ListResult<T> {
  data: T[];
  total: number;
}

/** Parameters for `getOne`. */
export interface GetOneParams {
  id: Identifier;
  /** Supabase select syntax, e.g. "*, author:profiles(name)". Defaults to "*". */
  select?: string;
}

/** Result of `getOne`. */
export interface GetOneResult<T> {
  data: T;
}

/** Parameters for `getMany`. */
export interface GetManyParams {
  ids: Identifier[];
}

/** Result of `getMany`. */
export interface GetManyResult<T> {
  data: T[];
}

/** Parameters for `create`. */
export interface CreateParams<T> {
  data: Partial<T>;
}

/** Result of `create`. */
export interface CreateResult<T> {
  data: T;
  /** The audit entry committed with the new row, from a provider that audits. */
  audit?: AuditEntry;
}

/** Parameters for `update`. */
export interface UpdateParams<T> {
  /**
   * The record's identifier. For a composite key, the canonical string from
   * `encodeRecordKey` (`@marktiderman/genesis-core/schema`).
   */
  id: Identifier;
  data: Partial<T>;
  /**
   * The version token the caller read the row at. A provider that reports
   * `versionedWrites` in its capabilities rejects the update with a
   * `DataWriteError` (`conflict`) when the row has moved on since, instead of
   * overwriting someone else's edit. Providers without versioned writes
   * ignore it.
   */
  expectedVersion?: string | null;
}

/** Result of `update`. */
export interface UpdateResult<T> {
  data: T;
  /** The row's new version token, from a provider with versioned writes. */
  version?: string | null;
  /** The audit entry committed with the edit, from a provider that audits. */
  audit?: AuditEntry;
}

/** Parameters for `deleteOne`. */
export interface DeleteParams {
  id: Identifier;
  /** The version token the row was read at; see `UpdateParams.expectedVersion`. */
  expectedVersion?: string | null;
}

/** Result of `deleteOne`. */
export interface DeleteResult {
  data: { id: Identifier };
  /** The audit entry committed with the deletion, from a provider that audits. */
  audit?: AuditEntry;
}

/** One row's change in a bulk update. */
export interface BulkChange {
  id: Identifier;
  data: Record<string, unknown>;
  /** The version token the row was read at. */
  expectedVersion?: string | null;
}

/** Why one row of a bulk write or import didn't go through. */
export interface RowFailure {
  /** The row's position in the request, from 0. */
  index: number;
  id?: Identifier;
  outcome: string;
  message: string;
}

/** Result of a bulk write: every row changed, or none did. */
export interface BulkResult {
  /** Rows changed; always the number requested when `ok`. */
  count: number;
  ok: boolean;
  /** Present when `ok` is false: every row that failed, so the caller can fix them all at once. */
  failures?: RowFailure[];
  /** One audit entry per row changed. */
  audit?: AuditEntry[];
}

/** Parameters for `importRows`. */
export interface ImportParams {
  rows: Record<string, unknown>[];
  /** Check every row against the database and change nothing. */
  dryRun: boolean;
}

/** Parameters for `history`. */
export interface HistoryParams {
  id: Identifier;
  /** Most recent first; default and maximum are the provider's. */
  limit?: number;
}

/** A write that committed, as passed to a provider's `onWrite` and `invalidates`. */
export interface WriteEvent {
  resource: string;
  kind: "create" | "update" | "delete";
  id: Identifier;
  /** The row as written, when the provider has it (not for a delete). */
  record?: BaseRecord;
}

/**
 * A cache key to invalidate after a write. Shaped like a TanStack Query
 * `QueryKey` (`readonly unknown[]`), matched by prefix.
 */
export type InvalidationKey = readonly unknown[];

// ---------------------------------------------------------------------------
// The DataProvider interface — six required methods, plus optional ones a
// provider implements when it can (Refine's required-versus-optional split).
// Callers feature-detect an optional method before using it.
// ---------------------------------------------------------------------------

export interface DataProvider {
  getList<T extends BaseRecord = BaseRecord>(
    resource: string,
    params: ListParams,
  ): Promise<ListResult<T>>;

  getOne<T extends BaseRecord = BaseRecord>(
    resource: string,
    params: GetOneParams,
  ): Promise<GetOneResult<T>>;

  getMany<T extends BaseRecord = BaseRecord>(
    resource: string,
    params: GetManyParams,
  ): Promise<GetManyResult<T>>;

  create<T extends BaseRecord = BaseRecord>(
    resource: string,
    params: CreateParams<T>,
  ): Promise<CreateResult<T>>;

  update<T extends BaseRecord = BaseRecord>(
    resource: string,
    params: UpdateParams<T>,
  ): Promise<UpdateResult<T>>;

  deleteOne(
    resource: string,
    params: DeleteParams,
  ): Promise<DeleteResult>;

  /**
   * The resource's real shape for the CURRENT user: fields, key, version
   * field, and per-field read and update rights. Fields the user may not read
   * are omitted entirely.
   */
  describe?(resource: string): Promise<ResourceSchema>;

  /** Every resource this user may see, for a sidebar or a picker. */
  listResources?(): Promise<ResourceSummary[]>;

  /**
   * What this provider can do, optionally for one resource. A UI hides the
   * controls a provider cannot serve instead of letting them error.
   */
  capabilities?(resource?: string): Promise<ProviderCapabilities>;

  /**
   * A record's audit history, most recent first, limited to the fields this
   * user may read.
   */
  history?(resource: string, params: HistoryParams): Promise<AuditEntry[]>;

  /**
   * Update many rows in ONE transaction. All of them change or none do: a
   * single conflict, refusal or invalid value rolls back the rest, and the
   * result lists every row that failed.
   */
  updateMany?(resource: string, params: { changes: BulkChange[] }): Promise<BulkResult>;

  /** Delete many rows in one transaction, all or none, each at its version. */
  deleteMany?(resource: string, params: { items: { id: Identifier; expectedVersion?: string | null }[] }): Promise<BulkResult>;

  /**
   * Add rows from an import. With `dryRun`, every row is tried against the
   * database and nothing is kept, so the result lists every row that would
   * fail; without it, all rows are added in one transaction or none are.
   */
  importRows?(resource: string, params: ImportParams): Promise<BulkResult>;

  /**
   * Undo one audited change with a compensating write: put the changed
   * fields back, remove an added row, or restore a deleted one. Refused when
   * the row has changed since.
   */
  undo?(resource: string, params: { auditId: string }): Promise<{ audit?: AuditEntry }>;

  /**
   * Run one of the resource's row actions (`ResourceSchema.actions`) on a
   * row, at the version it was read. The app's function does the work; the
   * row's change is audited.
   */
  runAction?(
    resource: string,
    params: { id: Identifier; action: string; expectedVersion?: string | null },
  ): Promise<{ data: Record<string, unknown> | null; audit?: AuditEntry }>;

  /** A record's comments, oldest first. */
  comments?(resource: string, params: { id: Identifier }): Promise<RecordComment[]>;

  /** Add a comment to a record, as the signed-in user. */
  addComment?(resource: string, params: { id: Identifier; body: string }): Promise<RecordComment>;

  /**
   * Maps a stored row to the values an edit form starts from, for a resource
   * whose form shape differs from its table (the reverse of a write's
   * `prepare`). `useResourceForm` applies it in edit mode.
   */
  toFormValues?(resource: string, record: Record<string, unknown>): Record<string, unknown>;

  /**
   * Other cache keys a committed write makes stale, beyond the resource's
   * own `[resource]` keys. `useResource` and `useResourceForm` invalidate
   * them after their writes.
   */
  invalidates?(event: WriteEvent): InvalidationKey[];
}
