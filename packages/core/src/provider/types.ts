// ---------------------------------------------------------------------------
// DataProvider — the universal CRUD interface for Genesis UI
// ---------------------------------------------------------------------------

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
}

/** Parameters for `update`. */
export interface UpdateParams<T> {
  id: Identifier;
  data: Partial<T>;
}

/** Result of `update`. */
export interface UpdateResult<T> {
  data: T;
}

/** Parameters for `deleteOne`. */
export interface DeleteParams {
  id: Identifier;
}

/** Result of `deleteOne`. */
export interface DeleteResult {
  data: { id: Identifier };
}

// ---------------------------------------------------------------------------
// The DataProvider interface — six methods, nothing more.
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
}
