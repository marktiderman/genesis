// ---------------------------------------------------------------------------
// DataProvider — the universal CRUD interface for Genesis UI
// ---------------------------------------------------------------------------

import type {
  AuditEntry,
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

/** Parameters for `history`. */
export interface HistoryParams {
  id: Identifier;
  /** Most recent first; default and maximum are the provider's. */
  limit?: number;
}

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
}
