// The shape every introspection source produces, before it is written out.

export type StorageType = "string" | "number" | "boolean" | "datetime" | "json";

export interface IntrospectedColumn {
  name: string;
  /** The database's own type, e.g. `timestamp with time zone`. */
  dbType: string;
  type: StorageType;
  array: boolean;
  nullable: boolean;
  /**
   * The catalog can't say whether the column holds null: a view's or materialized view's own
   * column, which Postgres always reports as nullable. `nullable` is then true for the row type,
   * and the contract leaves `nullable` out, so a form doesn't act on a guess.
   */
  nullableUnknown?: boolean;
  hasDefault: boolean;
  generated: boolean;
  enumValues?: string[];
  references?: { resource: string; field: string };
  /** The column comment, without its `@genesis` settings. */
  description?: string;
  /** From `@genesis {...}` in the column comment. */
  settings?: FieldSettings;
}

export interface IntrospectedTable {
  /** `schema.table`. */
  name: string;
  schema: string;
  table: string;
  key: string[];
  columns: IntrospectedColumn[];
  description?: string;
  settings?: TableSettings;
}

/** What a column comment's `@genesis {...}` may set. */
export interface FieldSettings {
  label?: string;
  description?: string;
  widget?: string;
  /** Server-owned: clients never write it. */
  readonly?: boolean;
  /** Left out of lists, exports and previews unless a screen asks. */
  sensitive?: boolean;
}

/** What a table comment's `@genesis {...}` may set. */
export interface TableSettings {
  label?: string;
  labelField?: string;
  description?: string;
  /** What one row is called ("brand"), and several when not `noun` + "s". */
  noun?: string;
  nounPlural?: string;
  /** The key, by column name, for a relation the catalog gives none (a view that joins tables). */
  key?: string[];
}

/** The storage type for a Postgres type name (the element type, for an array). */
export function storageTypeOf(dbType: string): StorageType {
  const t = dbType.toLowerCase().replace(/\[\]$/, "");
  if (/^(smallint|integer|bigint|int2|int4|int8|real|double precision|float4|float8|numeric|decimal|money)\b/.test(t)) {
    return "number";
  }
  if (t === "boolean" || t === "bool") return "boolean";
  if (/^(date|timestamp|timestamptz|time|timetz|interval)\b/.test(t)) return "datetime";
  if (t === "json" || t === "jsonb") return "json";
  return "string";
}

/**
 * A resource's name, `schema.table`. A part holding a dot or a double quote is quoted the way
 * Postgres quotes it (`"my.s"."we.ird"`), so a provider can split the name back exactly.
 */
export function qualifiedName(schema: string, table: string): string {
  const part = (p: string) => (/[."]/.test(p) ? `"${p.replace(/"/g, '""')}"` : p);
  return `${part(schema)}.${part(table)}`;
}
