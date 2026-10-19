// ---------------------------------------------------------------------------
// Reading rows. Only the columns this user may read are ever selected, so a
// hidden column never leaves the database.
// ---------------------------------------------------------------------------

import type { FilterParam, SortParam } from "@marktiderman/genesis-core/provider";
import type { ResolvedResource } from "./access";
import type { CatalogColumn } from "./catalog";
import { ident, type Query, type SqlRow } from "./db";
import type { StudioRow } from "./protocol";

/** Alias for the version token, chosen so it can't shadow a real column. */
export const VERSION_ALIAS = "__genesis_version";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/** Collects positional parameters while a statement is built. */
export class Params {
  readonly values: unknown[] = [];

  /**
   * Add a value and return its placeholder: `$n::text`, then cast to
   * `castType` when given.
   *
   * The `::text` is load-bearing. postgres.js asks the server what type each
   * parameter is and then runs its own serializer for that type, which would
   * JSON-encode a string bound for `jsonb` a second time, turn the string
   * `"true"` into `false` for a boolean, and round a timestamp through a JS
   * Date (dropping microseconds and shifting time zones). Pinning every
   * parameter to `text` means the driver sends the string untouched and
   * Postgres alone parses it into the column's type.
   */
  add(value: unknown, castType?: string): string {
    this.values.push(toParam(value));
    const placeholder = `$${this.values.length}::text`;
    return castType ? `${placeholder}::${castType}` : placeholder;
  }
}

/**
 * Every value travels as text and is cast by Postgres to the column's own
 * type, so the database (not this code) decides what a valid integer, date
 * or enum label is.
 */
function toParam(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return JSON.stringify(value);
}

/** SQL string literal. Only applied to names read from the catalog. */
export function literal(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

export function qualifiedTable(resolved: ResolvedResource): string {
  return `${ident(resolved.table.schema)}.${ident(resolved.table.name)}`;
}

export function selectList(resolved: ResolvedResource): string {
  const columns = resolved.readable.map((c) => ident(c.name));
  if (resolved.version) columns.push(`${ident(resolved.version.name)}::text as ${ident(VERSION_ALIAS)}`);
  return columns.join(", ");
}

export function toStudioRow(resolved: ResolvedResource, row: SqlRow): StudioRow {
  const values: Record<string, unknown> = {};
  for (const c of resolved.readable) values[c.name] = row[c.name] ?? null;
  const version = resolved.version ? ((row[VERSION_ALIAS] as string | null | undefined) ?? null) : null;
  return { values, version };
}

/** `"a" = $1::int and "b" = $2::text` for the record's key. */
export function keyPredicate(resolved: ResolvedResource, key: Record<string, unknown>, params: Params): string {
  if (resolved.key.length === 0) throw new BadRequestError("This table has no key you can see, so its rows can't be addressed.");
  return resolved.key
    .map((c) => {
      const value = key[c.name];
      if (value === undefined || value === null) throw new BadRequestError(`Missing key field "${c.name}".`);
      return `${ident(c.name)} = ${params.add(value, c.castType)}`;
    })
    .join(" and ");
}

function readableColumn(resolved: ResolvedResource, name: string): CatalogColumn {
  const column = resolved.readable.find((c) => c.name === name);
  if (!column) throw new BadRequestError(`Unknown field "${name}".`);
  return column;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

type Scalar = string | number | boolean;
const isScalar = (v: unknown): v is Scalar => typeof v === "string" || typeof v === "number" || typeof v === "boolean";

/** Reject a malformed filter with a 400 instead of letting it reach SQL. */
function validFilter(filter: unknown): FilterParam {
  const f = filter as { field?: unknown; operator?: unknown; value?: unknown } | null;
  if (!f || typeof f.field !== "string" || typeof f.operator !== "string") {
    throw new BadRequestError("Each filter needs a field and an operator.");
  }
  switch (f.operator) {
    case "is_null":
    case "is_not_null":
      return f as FilterParam;
    case "in":
      if (!Array.isArray(f.value) || f.value.length > 500 || !f.value.every(isScalar)) {
        throw new BadRequestError(`"in" needs a list of up to 500 values.`);
      }
      return f as FilterParam;
    case "between":
      if (!Array.isArray(f.value) || f.value.length !== 2 || !f.value.every(isScalar)) {
        throw new BadRequestError(`"between" needs exactly two values.`);
      }
      return f as FilterParam;
    default:
      if (!isScalar(f.value)) throw new BadRequestError(`"${f.operator}" needs one value.`);
      return f as FilterParam;
  }
}

function filterSql(resolved: ResolvedResource, raw: FilterParam, params: Params): string {
  const filter = validFilter(raw);
  const column = readableColumn(resolved, filter.field);
  const col = ident(column.name);
  const cast = column.castType;
  switch (filter.operator) {
    case "eq":
      return `${col} = ${params.add(filter.value, cast)}`;
    case "neq":
      return `${col} is distinct from ${params.add(filter.value, cast)}`;
    case "gt":
      return `${col} > ${params.add(filter.value, cast)}`;
    case "lt":
      return `${col} < ${params.add(filter.value, cast)}`;
    case "gte":
      return `${col} >= ${params.add(filter.value, cast)}`;
    case "lte":
      return `${col} <= ${params.add(filter.value, cast)}`;
    case "contains":
      return `${col}::text ilike ${params.add(`%${escapeLike(String(filter.value))}%`)}`;
    case "in":
      if (filter.value.length === 0) return "false";
      return `${col} in (${filter.value.map((v) => params.add(v, cast)).join(", ")})`;
    case "between":
      return `${col} between ${params.add(filter.value[0], cast)} and ${params.add(filter.value[1], cast)}`;
    case "is_null":
      return `${col} is null`;
    case "is_not_null":
      return `${col} is not null`;
    default:
      throw new BadRequestError(`Unsupported filter operator "${(filter as { operator: string }).operator}".`);
  }
}

export interface ListInput {
  page: number;
  perPage: number;
  /** Sort by these fields, first one first. */
  sorts?: SortParam[];
  search?: string;
  filters?: FilterParam[];
}

/** Rows counted before `total` becomes "at least". */
export const COUNT_CAP = 10_000;

export async function listRows(
  query: Query,
  resolved: ResolvedResource,
  input: ListInput,
): Promise<{ rows: StudioRow[]; total: number; totalIsLowerBound?: true }> {
  const params = new Params();
  const where: string[] = [];

  const term = input.search?.trim().slice(0, 200);
  if (term) {
    const searchable = resolved.readable.filter((c) => !c.isArray && (c.category === "S" || c.category === "E" || c.baseType === "uuid"));
    if (searchable.length === 0) {
      where.push("false");
    } else {
      const pattern = params.add(`%${escapeLike(term)}%`);
      where.push(`(${searchable.map((c) => `${ident(c.name)}::text ilike ${pattern}`).join(" or ")})`);
    }
  }
  if ((input.filters?.length ?? 0) > 20) throw new BadRequestError("At most 20 filters.");
  for (const filter of input.filters ?? []) where.push(filterSql(resolved, filter, params));

  const whereSql = where.length ? ` where ${where.join(" and ")}` : "";
  const order: string[] = [];
  const sorts = input.sorts ?? [];
  if (sorts.length > 5) throw new BadRequestError("Sort by at most 5 fields.");
  for (const sort of sorts) {
    if (!sort || typeof sort.field !== "string") throw new BadRequestError("Each sort needs a field.");
    const column = readableColumn(resolved, sort.field);
    order.push(`${ident(column.name)} ${sort.order === "desc" ? "desc" : "asc"} nulls last`);
  }
  // A stable tiebreak, so paging never shows a row twice or skips one.
  for (const k of resolved.key) order.push(`${ident(k.name)} asc`);
  const orderSql = order.length ? ` order by ${order.join(", ")}` : "";

  const countParams = [...params.values];
  const limit = params.add(input.perPage);
  const offset = params.add((input.page - 1) * input.perPage);
  const table = qualifiedTable(resolved);

  const [rows, count] = await Promise.all([
    query(`select ${selectList(resolved)} from ${table}${whereSql}${orderSql} limit ${limit}::int8 offset ${offset}::int8`, params.values),
    // Counting stops at COUNT_CAP: an exact count of a large table is a full
    // scan on every page turn. Past it, `total` is a floor, not the size.
    query(
      `select count(*)::int8 as total from (select 1 from ${table}${whereSql} limit ${COUNT_CAP + 1}) capped`,
      countParams,
    ),
  ]);
  const counted = Number(count[0]?.total ?? 0);
  return {
    rows: rows.map((r) => toStudioRow(resolved, r)),
    total: Math.min(counted, COUNT_CAP),
    ...(counted > COUNT_CAP ? { totalIsLowerBound: true } : {}),
  };
}

/** One row by key, or `null` when this user can't see it. */
export async function readRow(
  query: Query,
  resolved: ResolvedResource,
  key: Record<string, unknown>,
): Promise<StudioRow | null> {
  const params = new Params();
  const predicate = keyPredicate(resolved, key, params);
  const [row] = await query(
    `select ${selectList(resolved)} from ${qualifiedTable(resolved)} where ${predicate} limit 1`,
    params.values,
  );
  return row ? toStudioRow(resolved, row) : null;
}
