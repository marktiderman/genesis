// ---------------------------------------------------------------------------
// Schema discovery from the Postgres catalog, AS THE USER.
//
// Every query here runs after the switch to the signed-in user's role, so the
// privilege functions (`has_column_privilege` and friends) answer for that
// user, and nothing is cached between requests: metadata can't go stale.
// ---------------------------------------------------------------------------

import type { Query } from "./db";

export interface CatalogColumn {
  attnum: number;
  name: string;
  /** `format_type` output, including any length or precision. */
  dbType: string;
  /**
   * The type without its modifier, for casting a parameter. Casting to
   * `varchar(10)` explicitly would silently truncate; casting to `varchar`
   * leaves the column's own limit to raise an error instead.
   */
  castType: string;
  /** Base type name, after unwrapping a domain. */
  baseType: string;
  /** `pg_type.typcategory` of the base type (or of the element, for arrays). */
  category: string;
  isArray: boolean;
  /** `atttypmod`: for a timestamp, its fractional-second precision (-1 = default, 6). */
  typmod: number;
  nullable: boolean;
  hasDefault: boolean;
  generated: boolean;
  identity: boolean;
  canSelect: boolean;
  canUpdate: boolean;
  canInsert: boolean;
  description: string | null;
  enumValues: string[] | null;
  references: { schema: string; table: string; column: string } | null;
}

export interface CatalogTrigger {
  name: string;
  functionName: string;
  language: string;
  source: string;
  forEachRow: boolean;
  before: boolean;
  onUpdate: boolean;
  onInsert: boolean;
  onDelete: boolean;
  columnSpecific: boolean;
  conditional: boolean;
  args: string[];
}

export interface CatalogTable {
  oid: string;
  schema: string;
  name: string;
  /** `schema.table` — the resource name the studio addresses. */
  qualified: string;
  description: string | null;
  canSelectAny: boolean;
  canUpdateAny: boolean;
  canInsertAny: boolean;
  canDelete: boolean;
  /** Row-level security is enabled on the table. */
  rls: boolean;
  /**
   * With row-level security on: whether any permissive policy lets this
   * role update, insert or delete at all. With none, the grant alone can
   * never succeed, so the studio shows the action as off rather than
   * letting every attempt fail.
   */
  rlsAllows: { update: boolean; insert: boolean; delete: boolean };
  columns: CatalogColumn[];
  primaryKey: string[];
  /** Columns that are unique on their own (a single-column unique constraint). */
  uniqueColumns: string[];
  triggers: CatalogTrigger[];
}

/** A permissive policy for `cmd` (or ALL) that applies to the current role. */
const POLICY_FOR = (cmd: "w" | "a" | "d") => `exists (
              select 1 from pg_policy p
               where p.polrelid = c.oid and p.polpermissive and p.polcmd in ('${cmd}', '*')
                 and (0 = any(p.polroles)
                      or exists (select 1 from unnest(p.polroles) r where pg_has_role(current_user, r, 'MEMBER'))))`;

/** Every table in `schemas`, or just `only` (`schema.table`) when given. */
export async function loadTables(
  query: Query,
  schemas: readonly string[],
  only?: string,
): Promise<CatalogTable[]> {
  const tables = await query(
    `select c.oid::text as oid, n.nspname as schema, c.relname as name,
            obj_description(c.oid, 'pg_class') as description,
            has_any_column_privilege(c.oid, 'SELECT') as can_select,
            has_any_column_privilege(c.oid, 'UPDATE') as can_update,
            has_any_column_privilege(c.oid, 'INSERT') as can_insert,
            has_table_privilege(c.oid, 'DELETE') as can_delete,
            c.relrowsecurity as rls,
            ${POLICY_FOR("w")} as rls_update,
            ${POLICY_FOR("a")} as rls_insert,
            ${POLICY_FOR("d")} as rls_delete
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        -- A partition is reached through its parent; querying it directly
        -- could skip row rules defined only on the parent.
        and not c.relispartition
        and n.nspname = any($1::text[])
        and ($2::text is null or n.nspname || '.' || c.relname = $2::text)
      order by n.nspname, c.relname`,
    [schemas, only ?? null],
  );
  if (tables.length === 0) return [];
  const oids = tables.map((t) => String(t.oid));

  const [columns, constraints, triggers] = await Promise.all([
    query(
      `select a.attrelid::text as table_oid, a.attnum, a.attname as name,
              format_type(a.atttypid, a.atttypmod) as db_type,
              format_type(a.atttypid, null) as cast_type,
              coalesce(et.typname, bt.typname) as base_type,
              coalesce(et.typcategory, bt.typcategory) as category,
              bt.typcategory = 'A' as is_array,
              a.atttypmod as typmod,
              not a.attnotnull as nullable,
              a.atthasdef as has_default,
              a.attgenerated <> '' as generated,
              a.attidentity <> '' as identity,
              has_column_privilege(a.attrelid, a.attnum, 'SELECT') as can_select,
              has_column_privilege(a.attrelid, a.attnum, 'UPDATE') as can_update,
              has_column_privilege(a.attrelid, a.attnum, 'INSERT') as can_insert,
              col_description(a.attrelid, a.attnum) as description,
              (select array_agg(e.enumlabel::text order by e.enumsortorder)
                 from pg_enum e where e.enumtypid = coalesce(et.oid, bt.oid)) as enum_values
         from pg_attribute a
         join pg_type t on t.oid = a.atttypid
         join pg_type bt on bt.oid = case when t.typtype = 'd' then t.typbasetype else t.oid end
         left join pg_type et on bt.typcategory = 'A' and et.oid = bt.typelem
        where a.attrelid = any($1::oid[]) and a.attnum > 0 and not a.attisdropped
        order by a.attrelid, a.attnum`,
      [oids],
    ),
    query(
      `select con.conrelid::text as table_oid, con.contype as kind,
              array(select a.attname::text
                      from unnest(con.conkey) with ordinality k(attnum, ord)
                      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
                     order by k.ord) as columns,
              fn.nspname as ref_schema, fc.relname as ref_table,
              array(select a.attname::text
                      from unnest(con.confkey) with ordinality k(attnum, ord)
                      join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum
                     order by k.ord) as ref_columns
         from pg_constraint con
         left join pg_class fc on fc.oid = con.confrelid
         left join pg_namespace fn on fn.oid = fc.relnamespace
        where con.conrelid = any($1::oid[]) and con.contype in ('p', 'f', 'u')`,
      [oids],
    ),
    query(
      `select tg.tgrelid::text as table_oid, tg.tgname as name,
              p.proname as function_name, l.lanname as language, p.prosrc as source,
              (tg.tgtype & 1) <> 0 as for_each_row,
              (tg.tgtype & 2) <> 0 as before,
              (tg.tgtype & 16) <> 0 as on_update,
              (tg.tgtype & 4) <> 0 as on_insert,
              (tg.tgtype & 8) <> 0 as on_delete,
              cardinality(tg.tgattr::int2[]) > 0 as column_specific,
              tg.tgqual is not null as conditional,
              encode(tg.tgargs, 'escape') as args
         from pg_trigger tg
         join pg_proc p on p.oid = tg.tgfoid
         join pg_language l on l.oid = p.prolang
        where tg.tgrelid = any($1::oid[])
          and not tg.tgisinternal
          and tg.tgenabled in ('O', 'A')`,
      [oids],
    ),
  ]);

  return tables.map((t) => {
    const oid = String(t.oid);
    const fks = constraints.filter((c) => c.table_oid === oid && c.kind === "f");
    const pk = constraints.find((c) => c.table_oid === oid && c.kind === "p");
    return {
      oid,
      schema: String(t.schema),
      name: String(t.name),
      qualified: `${String(t.schema)}.${String(t.name)}`,
      description: withoutSettings(t.description),
      canSelectAny: Boolean(t.can_select),
      canUpdateAny: Boolean(t.can_update),
      canInsertAny: Boolean(t.can_insert),
      canDelete: Boolean(t.can_delete),
      rls: Boolean(t.rls),
      rlsAllows: { update: Boolean(t.rls_update), insert: Boolean(t.rls_insert), delete: Boolean(t.rls_delete) },
      primaryKey: (pk?.columns as string[] | undefined) ?? [],
      uniqueColumns: constraints
        .filter((c) => c.table_oid === oid && c.kind === "u" && (c.columns as string[]).length === 1)
        .map((c) => (c.columns as string[])[0]!),
      columns: columns
        .filter((c) => c.table_oid === oid)
        .map((c): CatalogColumn => {
          // Only single-column foreign keys become a field reference; a
          // composite one has no single field to point at.
          const fk = fks.find((f) => {
            const cols = f.columns as string[];
            return cols.length === 1 && cols[0] === c.name;
          });
          return {
            attnum: Number(c.attnum),
            name: String(c.name),
            dbType: String(c.db_type),
            castType: String(c.cast_type),
            baseType: String(c.base_type),
            category: String(c.category),
            isArray: Boolean(c.is_array),
            typmod: Number(c.typmod),
            nullable: Boolean(c.nullable),
            hasDefault: Boolean(c.has_default),
            generated: Boolean(c.generated),
            identity: Boolean(c.identity),
            canSelect: Boolean(c.can_select),
            canUpdate: Boolean(c.can_update),
            canInsert: Boolean(c.can_insert),
            description: withoutSettings(c.description),
            enumValues: (c.enum_values as string[] | null) ?? null,
            references: fk
              ? {
                  schema: String(fk.ref_schema),
                  table: String(fk.ref_table),
                  column: String((fk.ref_columns as string[])[0]),
                }
              : null,
          };
        }),
      triggers: triggers
        .filter((tg) => tg.table_oid === oid)
        .map(
          (tg): CatalogTrigger => ({
            name: String(tg.name),
            functionName: String(tg.function_name),
            language: String(tg.language),
            source: String(tg.source ?? ""),
            forEachRow: Boolean(tg.for_each_row),
            before: Boolean(tg.before),
            onUpdate: Boolean(tg.on_update),
            onInsert: Boolean(tg.on_insert),
            onDelete: Boolean(tg.on_delete),
            columnSpecific: Boolean(tg.column_specific),
            conditional: Boolean(tg.conditional),
            // `tgargs` is NUL-separated; `encode(..., 'escape')` prints NUL as \000.
            args: String(tg.args ?? "")
              .split("\\000")
              .filter((a, i, all) => i < all.length - 1 || a !== ""),
          }),
        ),
    };
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does this trigger advance `column` on EVERY update? Only a row-level
 * BEFORE UPDATE trigger with no column list and no WHEN condition fires on
 * every update, and then only `moddatetime(column)` or a PL/pgSQL body that
 * assigns `NEW.column` counts.
 *
 * Reading a function body is a heuristic, so it is backed by a check at write
 * time: an edit whose version did not actually change is rolled back (see
 * write.ts). A trigger this misses leaves the table read-only, which fails
 * safe.
 */
export function triggerAdvances(trigger: CatalogTrigger, column: string): boolean {
  if (!trigger.forEachRow || !trigger.before || !trigger.onUpdate) return false;
  if (trigger.columnSpecific || trigger.conditional) return false;
  if (trigger.functionName === "moddatetime") return trigger.args[0] === column;
  if (trigger.language !== "plpgsql") return false;
  const name = escapeRegExp(column);
  const assignment = new RegExp(`\\bnew\\s*\\.\\s*(?:${name}\\b|"${name}")\\s*:?=(?!=)`, "i");
  return assignment.test(trigger.source);
}

/**
 * Version kinds the studio can check, by base type. A timestamp stored with
 * less than microsecond precision is refused: two writes inside the same
 * second (or millisecond) would leave it unchanged, and the second writer's
 * edit would silently overwrite the first.
 */
export function versionKind(column: CatalogColumn): "integer" | "timestamp" | null {
  if (column.isArray) return null;
  if (["int2", "int4", "int8"].includes(column.baseType)) return "integer";
  if (["timestamp", "timestamptz"].includes(column.baseType)) {
    return column.typmod < 0 || column.typmod >= 6 ? "timestamp" : null;
  }
  return null;
}

/**
 * Does this trigger record every update for the `database` audit sink? It
 * must be enabled, row-level, fire on UPDATE with no column list and no WHEN
 * condition. Whether its body really writes an audit row is the app's
 * responsibility; this only proves it can't be skipped.
 */
export function triggerAuditsEvery(trigger: CatalogTrigger, action: "update" | "create" | "delete"): boolean {
  const fires = action === "update" ? trigger.onUpdate : action === "create" ? trigger.onInsert : trigger.onDelete;
  return trigger.forEachRow && fires && !trigger.columnSpecific && !trigger.conditional;
}

/** Why a function the studio would call can't be used, or `null` when it can. */
export async function functionProblem(query: Query, signature: string): Promise<string | null> {
  const [row] = await query(
    `select f.oid is not null as exists,
            coalesce(has_function_privilege(f.oid, 'EXECUTE'), false) as executable
       from (select to_regprocedure($1::text) as oid) f`,
    [signature],
  );
  if (!row?.exists) return "isn't installed (or its arguments don't match)";
  if (!row.executable) return "can't be run by you";
  return null;
}

/**
 * Checks that the `table` audit sink is still tamper-proof for this user:
 * the function exists, they may run it, it is `security definer` with an
 * empty `search_path`, and — for the stock log — they can't write the log
 * directly. A later blanket `grant all` would otherwise break the guarantee
 * in silence. Returns why it isn't, or `null` when it is.
 */
export async function auditSinkProblem(query: Query, signature: string, checkLogTable: boolean): Promise<string | null> {
  const [row] = await query(
    `select p.oid is not null as exists,
            coalesce(has_function_privilege(p.oid, 'EXECUTE'), false) as executable,
            coalesce(p.prosecdef, false) as definer,
            coalesce('search_path=""' = any(p.proconfig) or 'search_path=' = any(p.proconfig), false) as pinned,
            case when $2::boolean and to_regclass('genesis_studio.audit_log') is not null
                 then has_table_privilege('genesis_studio.audit_log', 'INSERT, UPDATE, DELETE, TRUNCATE')
                 else false end as log_writable
       from (select to_regprocedure($1::text) as oid) f
       left join pg_proc p on p.oid = f.oid`,
    [signature, checkLogTable],
  );
  if (!row?.exists) return "isn't installed";
  if (!row.executable) return "can't be run by you";
  if (!row.definer) return "isn't security definer";
  if (!row.pinned) return "doesn't pin an empty search_path";
  if (row.log_writable) return "is bypassable: you can write genesis_studio.audit_log directly";
  return null;
}

/**
 * A table or column comment without its `@genesis {...}` settings, which
 * are input for `genesis introspect`, not text for people.
 */
export function withoutSettings(comment: unknown): string | null {
  if (typeof comment !== "string") return null;
  const at = comment.indexOf("@genesis");
  const text = (at < 0 ? comment : comment.slice(0, at)).trim();
  return text || null;
}
