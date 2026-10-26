// The shape every introspection source produces, before it is written out.

export type StorageType = "string" | "number" | "boolean" | "datetime" | "json";

export interface IntrospectedColumn {
  name: string;
  /** The database's own type, e.g. `timestamp with time zone`. */
  dbType: string;
  type: StorageType;
  array: boolean;
  nullable: boolean;
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
