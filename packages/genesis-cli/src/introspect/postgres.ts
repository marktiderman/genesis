// Introspect from the Postgres catalog. Read-only: one connection, a few
// catalog queries, no table data. Connect as a role that can see the
// schemas' structure (any role can read pg_catalog); privileges and row
// rules are the studio handler's business at runtime, not the contract's.

import type postgres from "postgres";
import { checkEnumValues, viewColumnOrigins } from "./catalog-text.js";
import { parseColumnComment, parseTableComment, withKeySetting } from "./comments.js";
import { qualifiedName, storageTypeOf, type IntrospectedColumn, type IntrospectedTable } from "./model.js";

type Sql = postgres.Sql;

interface ColumnRow {
  oid: string;
  relkind: string;
  schema: string;
  table: string;
  table_comment: string | null;
  attnum: number;
  column: string;
  db_type: string;
  is_array: boolean;
  not_null: boolean;
  has_default: boolean;
  generated: boolean;
  enum_values: string[] | null;
  column_comment: string | null;
}

/** One relation as read from the catalog, before views inherit from their tables. */
interface Relation {
  oid: string;
  table: IntrospectedTable;
  /** Columns by attnum. */
  columns: Map<number, IntrospectedColumn>;
  /** The primary key, as attnums. */
  key: number[];
  /** For a view Postgres can update on its own: where its plain columns come from, by its own attnum. */
  origins?: Map<number, { relation: string; column: number }>;
}

/** What to read: the schemas asked for, or relations a view in them is built on. */
type Scope = { schemas: string[] } | { oids: string[] };

/** Catalog reads are bounded: a chain of views over views stops here. */
const MAX_VIEW_DEPTH = 8;

function where(sql: Sql, scope: Scope) {
  return "schemas" in scope ? sql`n.nspname = any(${scope.schemas})` : sql`c.oid = any(${scope.oids}::oid[])`;
}

/**
 * Which column of a foreign key links to one row of the referenced table, by its position, or -1.
 * A single-column key is that column. A composite key is a link too when every other column
 * references the column of the same name: the scope or tenant column carried along, as in the
 * tenant-safe `(gallery_id, org_id) references galleries (id, org_id)`, where `gallery_id` links to
 * galleries. Any other composite key isn't a link to one row's field.
 */
export function linkOf(columns: readonly string[], refColumns: readonly string[]): number {
  if (columns.length === 1) return 0;
  if (columns.length !== refColumns.length) return -1;
  const own = columns.flatMap((c, i) => (c === refColumns[i] ? [] : [i]));
  return own.length === 1 ? own[0]! : -1;
}

/** Read the relations in `scope` into `into`; returns the new ones' oids in name order. */
async function readRelations(sql: Sql, scope: Scope, into: Map<string, Relation>): Promise<string[]> {
  const columns = await sql<ColumnRow[]>`
    select c.oid::text as oid, c.relkind::text as relkind, n.nspname as schema, c.relname as table,
           obj_description(c.oid, 'pg_class') as table_comment,
           a.attnum::int as attnum,
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
       and ${where(sql, scope)}
     order by n.nspname, c.relname, a.attnum`;

  const keys = await sql<{ oid: string; columns: number[] }[]>`
    select c.oid::text as oid, array_agg(k.attnum::int order by k.ord) as columns
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral unnest(con.conkey) with ordinality as k(attnum, ord)
     where con.contype = 'p' and ${where(sql, scope)}
     group by c.oid`;

  // Every foreign key, its columns paired in order with the ones it references. A single-column key
  // is a link; so is a composite one that carries a scope column along (see linkOf).
  const links = await sql<{ oid: string; attnums: number[]; columns: string[]; ref_columns: string[]; ref_schema: string; ref_table: string }[]>`
    select c.oid::text as oid, con.conkey::int[] as attnums,
           array(select a.attname::text from unnest(con.conkey) with ordinality k(attnum, ord)
                   join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum order by k.ord) as columns,
           array(select ra.attname::text from unnest(con.confkey) with ordinality k(attnum, ord)
                   join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = k.attnum order by k.ord) as ref_columns,
           rn.nspname as ref_schema, rc.relname as ref_table
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_class rc on rc.oid = con.confrelid
      join pg_namespace rn on rn.oid = rc.relnamespace
     where con.contype = 'f'
       and ${where(sql, scope)}
     order by con.conname`;

  // Single-column CHECKs, read for the values they list (`status in ('a', 'b')`).
  const checks = await sql<{ oid: string; attnum: number; column: string; definition: string }[]>`
    select c.oid::text as oid, con.conkey[1]::int as attnum, a.attname as column,
           pg_get_constraintdef(con.oid) as definition
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum = con.conkey[1]
     where con.contype = 'c' and array_length(con.conkey, 1) = 1
       and ${where(sql, scope)}
     order by con.conname`;

  // Views Postgres can update and delete through on its own (one relation in
  // FROM, no joins, grouping or DISTINCT): their plain columns trace to it.
  // A view with a rule of its own may be updatable only through that rule,
  // whatever its query (an outer join, say), so it is left as read.
  const views = await sql<{ oid: string; ev_action: string }[]>`
    select c.oid::text as oid, r.ev_action::text as ev_action
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_rewrite r on r.ev_class = c.oid and r.rulename = '_RETURN'
     where c.relkind = 'v'
       and (pg_relation_is_updatable(c.oid, false) & 20) = 20
       and not exists (select 1 from pg_rewrite o where o.ev_class = c.oid and o.rulename <> '_RETURN')
       and ${where(sql, scope)}`;

  const added: string[] = [];
  for (const row of columns) {
    let relation = into.get(row.oid);
    if (!relation) {
      const name = qualifiedName(row.schema, row.table);
      const comment = parseTableComment(row.table_comment, name);
      relation = {
        oid: row.oid,
        table: {
          name,
          schema: row.schema,
          table: row.table,
          key: [],
          columns: [],
          ...(comment.description ? { description: comment.description } : {}),
          ...(comment.settings ? { settings: comment.settings } : {}),
        },
        columns: new Map(),
        key: [],
      };
      into.set(row.oid, relation);
      added.push(row.oid);
    }
    const comment = parseColumnComment(row.column_comment, `${relation.table.name}.${row.column}`);
    const column: IntrospectedColumn = {
      name: row.column,
      dbType: row.db_type,
      type: storageTypeOf(row.db_type),
      array: row.is_array,
      nullable: !row.not_null,
      // A view's columns always read as nullable: unknown until traced to a table.
      ...(row.relkind === "v" || row.relkind === "m" ? { nullableUnknown: true } : {}),
      hasDefault: row.has_default,
      generated: row.generated,
      ...(row.enum_values ? { enumValues: row.enum_values } : {}),
      ...(comment.description ? { description: comment.description } : {}),
      ...(comment.settings ? { settings: comment.settings } : {}),
    };
    relation.table.columns.push(column);
    relation.columns.set(row.attnum, column);
  }
  for (const k of keys) {
    const relation = into.get(k.oid);
    if (relation) relation.key = k.columns;
  }
  // Single-column keys first, so one on the same column wins over a composite key's guess.
  const ordered = [...links].sort((a, b) => a.attnums.length - b.attnums.length);
  for (const l of ordered) {
    const at = linkOf(l.columns, l.ref_columns);
    if (at < 0) continue;
    const column = into.get(l.oid)?.columns.get(l.attnums[at]!);
    if (column && !column.references) column.references = { resource: qualifiedName(l.ref_schema, l.ref_table), field: l.ref_columns[at]! };
  }
  // Every check's list on a column, then only the values all of them allow.
  const listed = new Map<IntrospectedColumn, string[]>();
  for (const check of checks) {
    const column = into.get(check.oid)?.columns.get(check.attnum);
    if (!column || column.array) continue;
    const values = checkEnumValues(check.definition, check.column);
    if (!values) continue;
    const before = listed.get(column);
    listed.set(column, before ? before.filter((v) => values.includes(v)) : values);
  }
  for (const [column, values] of listed) {
    // A check on an enum type narrows it; checks that share no value say nothing usable.
    const allowed = column.enumValues ? column.enumValues.filter((v) => values.includes(v)) : values;
    if (allowed.length > 0) column.enumValues = allowed;
  }
  for (const view of views) {
    const relation = into.get(view.oid);
    if (!relation) continue;
    relation.origins = new Map();
    // By position: a view column's attnum is its target entry's resno, whatever it's called now.
    for (const origin of viewColumnOrigins(view.ev_action)) {
      if (relation.columns.has(origin.position)) {
        relation.origins.set(origin.position, { relation: String(origin.relation), column: origin.column });
      }
    }
  }
  return added;
}

/**
 * A view column takes what its source column knows; the view's own comment still wins. Its enum
 * values are those both allow: the view's column has the enum type's full list, while the table's
 * may be narrowed by a CHECK.
 */
function inherit(own: IntrospectedColumn, source: IntrospectedColumn): IntrospectedColumn {
  const settings = source.settings || own.settings ? { ...source.settings, ...own.settings } : undefined;
  const description = own.description ?? source.description;
  const both = own.enumValues && source.enumValues ? own.enumValues.filter((v) => source.enumValues!.includes(v)) : undefined;
  const enumValues = both?.length ? both : (own.enumValues ?? source.enumValues);
  return {
    name: own.name,
    dbType: own.dbType,
    type: own.type,
    array: own.array,
    nullable: source.nullable,
    ...(source.nullableUnknown ? { nullableUnknown: true } : {}),
    hasDefault: own.hasDefault || source.hasDefault,
    generated: source.generated,
    ...(enumValues ? { enumValues } : {}),
    ...(source.references ? { references: source.references } : {}),
    ...(description ? { description } : {}),
    ...(settings ? { settings } : {}),
  };
}

/** Give each simple view its source's column facts and, when the view has every key column, its key. */
function resolveViews(relations: Map<string, Relation>): void {
  const done = new Set<string>();
  const resolve = (relation: Relation, depth: number): void => {
    if (done.has(relation.oid) || !relation.origins || depth > MAX_VIEW_DEPTH) return;
    done.add(relation.oid);
    const sources = new Set([...relation.origins.values()].map((o) => o.relation));
    if (sources.size !== 1) return;
    const source = relations.get([...sources][0]!);
    if (!source) return;
    resolve(source, depth + 1); // a view over a view: the inner one first
    const viewAttnumOf = new Map<number, number>();
    for (const [attnum, origin] of relation.origins) {
      const own = relation.columns.get(attnum);
      const from = source.columns.get(origin.column);
      if (!own || !from) continue;
      const merged = inherit(own, from);
      relation.columns.set(attnum, merged);
      relation.table.columns[relation.table.columns.indexOf(own)] = merged;
      // The same source column twice under two names: the first is the key's.
      if (!viewAttnumOf.has(origin.column)) viewAttnumOf.set(origin.column, attnum);
    }
    if (relation.key.length === 0 && source.key.length > 0 && source.key.every((k) => viewAttnumOf.has(k))) {
      relation.key = source.key.map((k) => viewAttnumOf.get(k)!);
    }
    // Its rows are the table's rows: the same noun, and the same labelField when the view has it.
    // The view's own `@genesis` settings win; its label and description stay its own.
    const theirs = source.table.settings;
    const viewColumns = new Set(relation.table.columns.map((c) => c.name));
    const inherited = {
      ...(theirs?.noun ? { noun: theirs.noun } : {}),
      ...(theirs?.nounPlural ? { nounPlural: theirs.nounPlural } : {}),
      ...(theirs?.labelField && viewColumns.has(theirs.labelField) ? { labelField: theirs.labelField } : {}),
    };
    if (Object.keys(inherited).length) relation.table.settings = { ...inherited, ...relation.table.settings };
  };
  for (const relation of relations.values()) resolve(relation, 0);
}

export async function introspectPostgres(sql: Sql, schemas: readonly string[]): Promise<IntrospectedTable[]> {
  const relations = new Map<string, Relation>();
  const wanted = await readRelations(sql, { schemas: [...schemas] }, relations);
  // A view's source may sit in a schema that wasn't asked for: read it too, but don't emit it.
  for (let depth = 0; depth < MAX_VIEW_DEPTH; depth++) {
    const missing = new Set<string>();
    for (const relation of relations.values()) {
      for (const origin of relation.origins?.values() ?? []) {
        if (!relations.has(origin.relation)) missing.add(origin.relation);
      }
    }
    if (missing.size === 0) break;
    const added = await readRelations(sql, { oids: [...missing].sort() }, relations);
    if (added.length === 0) break;
  }
  resolveViews(relations);
  return wanted.map((oid) => {
    const relation = relations.get(oid)!;
    return withKeySetting({ ...relation.table, key: relation.key.map((attnum) => relation.columns.get(attnum)!.name) });
  });
}
