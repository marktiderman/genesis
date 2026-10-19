// Introspect from the Postgres catalog. Read-only: one connection, a few
// catalog queries, no table data. Connect as a role that can see the
// schemas' structure (any role can read pg_catalog); privileges and row
// rules are the studio handler's business at runtime, not the contract's.

import type postgres from "postgres";
import { parseColumnComment, parseTableComment } from "./comments.js";
import { storageTypeOf, type IntrospectedTable } from "./model.js";

type Sql = postgres.Sql;

interface ColumnRow {
  schema: string;
  table: string;
  table_comment: string | null;
  column: string;
  db_type: string;
  is_array: boolean;
  not_null: boolean;
  has_default: boolean;
  generated: boolean;
  enum_values: string[] | null;
  column_comment: string | null;
}

export async function introspectPostgres(sql: Sql, schemas: readonly string[]): Promise<IntrospectedTable[]> {
  const columns = await sql<ColumnRow[]>`
    select n.nspname as schema, c.relname as table,
           obj_description(c.oid, 'pg_class') as table_comment,
           a.attname as column,
           format_type(a.atttypid, a.atttypmod) as db_type,
           t.typcategory = 'A' as is_array,
           a.attnotnull as not_null,
           (a.atthasdef or a.attidentity <> '') as has_default,
           (a.attgenerated <> '' or a.attidentity <> '') as generated,
           (select array_agg(e.enumlabel::text order by e.enumsortorder)
              from pg_enum e
             where e.enumtypid = case when t.typcategory = 'A' then t.typelem else t.oid end) as enum_values,
           col_description(c.oid, a.attnum) as column_comment
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_type t on t.oid = a.atttypid
     where c.relkind in ('r', 'p', 'v', 'm', 'f')
       and n.nspname = any(${schemas as string[]})
     order by n.nspname, c.relname, a.attnum`;

  const keys = await sql<{ schema: string; table: string; columns: string[] }[]>`
    select n.nspname as schema, c.relname as table,
           array_agg(a.attname::text order by k.ord) as columns
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral unnest(con.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
     where con.contype = 'p' and n.nspname = any(${schemas as string[]})
     group by n.nspname, c.relname`;

  // Single-column foreign keys only: a composite one isn't a link to one row's field.
  const links = await sql<{ schema: string; table: string; column: string; ref_schema: string; ref_table: string; ref_column: string }[]>`
    select n.nspname as schema, c.relname as table, a.attname as column,
           rn.nspname as ref_schema, rc.relname as ref_table, ra.attname as ref_column
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum = con.conkey[1]
      join pg_class rc on rc.oid = con.confrelid
      join pg_namespace rn on rn.oid = rc.relnamespace
      join pg_attribute ra on ra.attrelid = rc.oid and ra.attnum = con.confkey[1]
     where con.contype = 'f' and array_length(con.conkey, 1) = 1
       and n.nspname = any(${schemas as string[]})`;

  const keyOf = new Map(keys.map((k) => [`${k.schema}.${k.table}`, k.columns]));
  const linkOf = new Map(links.map((l) => [`${l.schema}.${l.table}.${l.column}`, l]));
  const tables = new Map<string, IntrospectedTable>();
  for (const row of columns) {
    const name = `${row.schema}.${row.table}`;
    let table = tables.get(name);
    if (!table) {
      const comment = parseTableComment(row.table_comment, name);
      table = {
        name,
        schema: row.schema,
        table: row.table,
        key: keyOf.get(name) ?? [],
        columns: [],
        ...(comment.description ? { description: comment.description } : {}),
        ...(comment.settings ? { settings: comment.settings } : {}),
      };
      tables.set(name, table);
    }
    const comment = parseColumnComment(row.column_comment, `${name}.${row.column}`);
    const link = linkOf.get(`${name}.${row.column}`);
    table.columns.push({
      name: row.column,
      dbType: row.db_type,
      type: storageTypeOf(row.db_type),
      array: row.is_array,
      nullable: !row.not_null,
      hasDefault: row.has_default,
      generated: row.generated,
      ...(row.enum_values ? { enumValues: row.enum_values } : {}),
      ...(link ? { references: { resource: `${link.ref_schema}.${link.ref_table}`, field: link.ref_column } } : {}),
      ...(comment.description ? { description: comment.description } : {}),
      ...(comment.settings ? { settings: comment.settings } : {}),
    });
  }
  return [...tables.values()];
}
