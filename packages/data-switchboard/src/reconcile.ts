// =====================================================================
// Reconciliation — the middle layer never becomes a silent drift trap.
//
// Two operations compare/transfer a resource ACROSS two Levels:
//
//   1. driftReport(resource, fromLevel, toLevel) — compare the SAME resource
//      across two Levels along three dimensions:
//        • SCHEMA — fields present in one Level but missing in the other.
//        • ROWS   — `key` values present in one Level but missing in the other.
//        • VALUES — per-(key, field) differences on rows present in both.
//      The baseline is the resource's sourceOfTruth Level; the report is
//      framed as "what `to` would need to change to match `from`."
//
//   2. promote(resource, opts) — turn a PROVEN L2 (Airtable) shape into an L3
//      (Supabase) MIGRATION for HUMAN APPROVAL: DDL (CREATE TABLE from the
//      contract field schema + RLS keyed on user_id = auth.uid()) and an
//      OPTIONAL backfill (INSERT … the current L2 rows). It returns SQL text;
//      it NEVER applies anything — a human reviews and runs the migration.
//
// `promote` here generates faithful, reviewable SQL (the migration generator
// the design calls for). Live backfill from a running L2 is wired through the
// adapter's list(); when no adapter rows are passed it emits DDL-only.
// =====================================================================

import type { Adapter } from "./adapters/adapter";
import { UnknownResourceError } from "./adapters/adapter";
import type { Registry } from "./registry";
import { staleInfo, type StaleReadInfo } from "./staleness";
import type { DataRow, FieldSchema, FieldType, Level, ResourceContract } from "./types";

// ---------------------------------------------------------------------
// Drift report
// ---------------------------------------------------------------------
export interface FieldDrift {
  readonly field: string;
  readonly in: Level;
  readonly missingIn: Level;
}

export interface RowDrift {
  readonly key: string;
  readonly in: Level;
  readonly missingIn: Level;
}

export interface ValueDrift {
  readonly key: string;
  readonly field: string;
  readonly fromValue: unknown;
  readonly toValue: unknown;
}

export interface DriftReport {
  readonly resource: string;
  readonly baseline: Level; // sourceOfTruth
  readonly from: Level;
  readonly to: Level;
  readonly schema: FieldDrift[];
  readonly rows: RowDrift[];
  readonly values: ValueDrift[];
  /**
   * Degraded-read flags: non-empty when `from` and/or `to` served STALE
   * last-known-good data (a refresh failed). A degraded read cannot be trusted
   * as authoritative, so the comparison below is NOT a valid sync signal —
   * `inSync` is forced false whenever this is non-empty (CMT-1742-002).
   */
  readonly degraded: StaleReadInfo[];
  /** True when schema, rows, and values are all empty AND no read was degraded. */
  readonly inSync: boolean;
}

/**
 * Compare a resource across two Levels using the two adapters that back those
 * Levels. The `from`/`to` adapters are passed in explicitly by the caller; the
 * Registry is used only to look up the resource contract (`getContract`).
 */
export async function driftReport(
  registry: Registry,
  resource: string,
  from: Adapter,
  to: Adapter,
): Promise<DriftReport> {
  const contract = registry.getContract(resource);

  const [fromRows, toRows] = await Promise.all([from.list(contract), to.list(contract)]);
  // Introspect schema from the SAME snapshot we just read (not a second list)
  // so schema-drift and row-drift can never compare mismatched reads, and we
  // don't double the `select *` cost (CMT-1794-005).
  const [fromSchema, toSchema] = await Promise.all([
    from.describe(contract, fromRows),
    to.describe(contract, toRows),
  ]);

  // Degraded-read detection: if either side served stale last-known-good data
  // (a refresh failed), the comparison is not authoritative — flag it and
  // refuse to report inSync (CMT-1742-002). Stale data MUST NOT read as "synced".
  const degraded: StaleReadInfo[] = [];
  const fromStale = staleInfo(fromRows);
  if (fromStale) degraded.push(fromStale);
  const toStale = staleInfo(toRows);
  if (toStale) degraded.push(toStale);

  // -- schema drift --
  const fromFields = new Set(fromSchema.fields.map((f) => f.name));
  const toFields = new Set(toSchema.fields.map((f) => f.name));
  const schema: FieldDrift[] = [];
  for (const f of fromFields) {
    if (!toFields.has(f)) schema.push({ field: f, in: from.level, missingIn: to.level });
  }
  for (const f of toFields) {
    if (!fromFields.has(f)) schema.push({ field: f, in: to.level, missingIn: from.level });
  }

  // -- row drift (by identity key) --
  const fromIndex = indexBy(fromRows, contract.key);
  const toIndex = indexBy(toRows, contract.key);
  const rows: RowDrift[] = [];
  for (const key of fromIndex.keys()) {
    if (!toIndex.has(key)) rows.push({ key, in: from.level, missingIn: to.level });
  }
  for (const key of toIndex.keys()) {
    if (!fromIndex.has(key)) rows.push({ key, in: to.level, missingIn: from.level });
  }

  // -- value drift (rows present in BOTH; compare shared fields) --
  const sharedFields = [...fromFields].filter((f) => toFields.has(f) && f !== contract.key);
  const values: ValueDrift[] = [];
  for (const [key, fromRow] of fromIndex) {
    const toRow = toIndex.get(key);
    if (!toRow) continue;
    for (const field of sharedFields) {
      if (!valuesEqual(fromRow[field], toRow[field])) {
        values.push({
          key,
          field,
          fromValue: fromRow[field],
          toValue: toRow[field],
        });
      }
    }
  }

  return {
    resource,
    baseline: contract.sourceOfTruth,
    from: from.level,
    to: to.level,
    schema,
    rows,
    values,
    degraded,
    inSync: schema.length === 0 && rows.length === 0 && values.length === 0 && degraded.length === 0,
  };
}

// ---------------------------------------------------------------------
// reconcileModel (WC46.016) — the MODEL-LEVEL reconcile pass.
//
// `driftReport` compares ONE resource across two Levels. `reconcileModel`
// lifts that to the WHOLE registered MODEL: it walks every registered resource
// (or a named subset) and runs the per-resource drift between the two Levels'
// adapters, then rolls the results up into one model verdict. A resource that
// only ONE side backs (the other adapter has no mapping for it) is recorded as
// MISSING rather than throwing — so a model where Airtable carries `features`
// and Supabase carries `tickets` reconciles cleanly, surfacing exactly
// which resources are not yet present on both Levels.
// ---------------------------------------------------------------------
export interface ResourceReconcile {
  readonly resource: string;
  /** Per-resource drift — present only when BOTH Levels back the resource. */
  readonly report?: DriftReport;
  /** Which of the two Levels actually map this resource. */
  readonly presentIn: Level[];
  /** Why a per-resource report could not run (e.g. not mapped on one side). */
  readonly skipped?: string;
}

export interface ModelReconcileSummary {
  readonly total: number;
  readonly inSync: number;
  readonly drifted: number;
  readonly missing: number;
  readonly degraded: number;
}

export interface ModelReconcileReport {
  readonly from: Level;
  readonly to: Level;
  readonly resources: ResourceReconcile[];
  readonly summary: ModelReconcileSummary;
  /** True ⇔ every resource is present on BOTH Levels and all are in sync. */
  readonly inSync: boolean;
}

export interface ReconcileModelOptions {
  /** Limit the pass to these resources (default: every registered resource). */
  readonly resources?: readonly string[];
}

/** Does this adapter back the resource? (false ⇔ it has no mapping for it.) */
async function adapterBacks(adapter: Adapter, contract: ResourceContract): Promise<boolean> {
  try {
    await adapter.list(contract);
    return true;
  } catch (err) {
    if (err instanceof UnknownResourceError) return false;
    throw err; // a real failure (network, auth) must NOT be laundered into "missing".
  }
}

/**
 * Reconcile the whole MODEL across two Levels: run `driftReport` for every
 * registered resource backed by BOTH adapters, record the rest as MISSING, and
 * roll up a model verdict. The `from`/`to` adapters are passed explicitly (the
 * Registry supplies only the contracts).
 */
export async function reconcileModel(
  registry: Registry,
  from: Adapter,
  to: Adapter,
  opts: ReconcileModelOptions = {},
): Promise<ModelReconcileReport> {
  const names = opts.resources ?? registry.listResources();
  const resources: ResourceReconcile[] = [];

  for (const name of names) {
    const contract = registry.getContract(name);
    const [inFrom, inTo] = await Promise.all([adapterBacks(from, contract), adapterBacks(to, contract)]);
    const presentIn: Level[] = [];
    if (inFrom) presentIn.push(from.level);
    if (inTo) presentIn.push(to.level);

    if (inFrom && inTo) {
      const report = await driftReport(registry, name, from, to);
      resources.push({ resource: name, report, presentIn });
    } else {
      const missingLevel = !inFrom ? from.level : to.level;
      resources.push({ resource: name, presentIn, skipped: `not mapped in ${missingLevel}` });
    }
  }

  const reports = resources.flatMap((r) => (r.report ? [r.report] : []));
  const summary: ModelReconcileSummary = {
    total: resources.length,
    inSync: reports.filter((r) => r.inSync).length,
    drifted: reports.filter((r) => !r.inSync).length,
    missing: resources.filter((r) => r.presentIn.length < 2).length,
    degraded: reports.filter((r) => r.degraded.length > 0).length,
  };

  return {
    from: from.level,
    to: to.level,
    resources,
    summary,
    inSync: summary.missing === 0 && summary.drifted === 0,
  };
}

function indexBy(rows: DataRow[], key: string): Map<string, DataRow> {
  const idx = new Map<string, DataRow>();
  for (const r of rows) idx.set(String(r[key]), r);
  return idx;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  // Structural compare for JSON-ish values; stable enough for drift signalling.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// Promote — L2 shape → L3 Supabase migration (DDL + optional backfill).
// ---------------------------------------------------------------------
export interface PromoteOptions {
  /** Postgres table name (defaults to the resource name). */
  readonly table?: string;
  /**
   * Current L2 rows to emit as a backfill INSERT. Omit / empty for DDL-only.
   * Pass `await airtableAdapter.list(contract)` to backfill from live L2.
   */
  readonly backfill?: readonly DataRow[];
  /**
   * Column carrying the owning user for RLS. MUST resolve to auth.uid().
   * Defaults to "user_id" (root CLAUDE.md §1 — never org_id).
   */
  readonly userColumn?: string;
}

export interface PromoteResult {
  readonly resource: string;
  readonly table: string;
  readonly sql: string;
}

const PG_TYPE: Record<FieldType, string> = {
  string: "TEXT",
  number: "DOUBLE PRECISION",
  boolean: "BOOLEAN",
  datetime: "TIMESTAMPTZ",
  json: "JSONB",
  relation: "TEXT",
};

/**
 * Generate a reviewable Supabase migration that promotes a proven L2 shape to
 * L3. Emits: CREATE TABLE (from the contract field schema) + a user_id column
 * + RLS (user_id = auth.uid()) + updated_at trigger + optional backfill.
 * Returns SQL TEXT ONLY — a human reviews and applies it. Nothing is executed.
 */
export function promote(registry: Registry, resource: string, opts: PromoteOptions = {}): PromoteResult {
  const contract = registry.getContract(resource);
  const table = opts.table ?? resource;
  const userColumn = opts.userColumn ?? "user_id";

  // REFUSE to migrate off silently-stale data (CMT-1742-002, no-ducttape). If
  // the backfill rows came from a degraded (stale-while-error) read, promoting
  // them would bake last-known-good drift into the L3 migration. Fail loud.
  const staleBackfill = staleInfo(opts.backfill);
  if (staleBackfill) {
    throw new Error(
      `promote: refusing to generate a backfill for "${resource}" from a STALE/degraded read ` +
        `(errorId=${staleBackfill.errorId}, resource="${staleBackfill.resource}", cause: ${staleBackfill.message}). ` +
        `Re-fetch authoritative L2 rows before promoting, or emit DDL-only (omit \`backfill\`).`,
    );
  }

  // `table` and `userColumn` are interpolated RAW into trigger/policy NAMES
  // (e.g. `${table}_set_updated_at`), which Postgres can't double-quote the
  // same way a table/column ref can. Reject anything that isn't a plain
  // lowercase identifier up front so we never emit an injectable name.
  for (const [label, value] of [
    ["table", table],
    ["userColumn", userColumn],
  ] as const) {
    if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
      throw new Error(
        `promote: ${label} "${value}" is not a plain lowercase identifier (/^[a-z_][a-z0-9_]*$/); refusing to emit an unquotable trigger/policy name.`,
      );
    }
  }

  // PRESERVE THE CANONICAL KEY end-to-end L1→L3 (CMT-1742-003). If the contract
  // declares its identity `key` as a field (e.g. work_cycle.id = "WC46.NNN"),
  // that column becomes the PRIMARY KEY — NOT a surrogate UUID. Dropping the
  // canonical key for a `gen_random_uuid()` surrogate would break the
  // "zero consumer change" promise (consumers address rows by WC46.NNN). Only
  // when the contract has NO key field do we fall back to a synthetic UUID PK.
  const keyField = contract.fields.find((f) => f.name === contract.key);
  const columnLines: string[] = [];
  if (keyField) {
    // Canonical key as PK. PRIMARY KEY already implies NOT NULL + UNIQUE.
    columnLines.push(`  ${quoteIdent(keyField.name)} ${columnType(keyField)} PRIMARY KEY`);
  } else {
    // No declared key field — synthetic surrogate (legacy fallback).
    columnLines.push(`  id UUID PRIMARY KEY DEFAULT gen_random_uuid()`);
  }
  // user_id — the RLS principal. NEVER org_id (CLAUDE.md §1).
  columnLines.push(`  ${userColumn} UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`);

  for (const field of contract.fields) {
    // The key field is already emitted as the PK above; user_id is the RLS
    // principal; a literal synthetic "id" is reserved for the surrogate.
    if (field.name === userColumn) continue;
    if (keyField ? field.name === keyField.name : field.name === "id") continue;
    const nullable = field.optional ? "" : " NOT NULL";
    columnLines.push(`  ${quoteIdent(field.name)} ${columnType(field)}${nullable}`);
  }
  columnLines.push(`  created_at TIMESTAMPTZ NOT NULL DEFAULT now()`);
  columnLines.push(`  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`);

  const ddl = `-- Promoted from L2 (${contract.sourceOfTruth} sourceOfTruth) — REVIEW before applying.
-- Generated by @marktiderman/genesis-switchboard promote(). RLS keyed on ${userColumn} = auth.uid().
BEGIN;

CREATE TABLE IF NOT EXISTS public.${quoteIdent(table)} (
${columnLines.join(",\n")}
);

-- updated_at trigger (reuses the shared public.update_updated_at_column()).
DROP TRIGGER IF EXISTS ${table}_set_updated_at ON public.${quoteIdent(table)};
CREATE TRIGGER ${table}_set_updated_at
  BEFORE UPDATE ON public.${quoteIdent(table)}
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS — root CLAUDE.md §1: ${userColumn} = auth.uid() is the ONLY access
-- principal. No tenant/organization column participates in access control.
ALTER TABLE public.${quoteIdent(table)} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ${table}_user_owned ON public.${quoteIdent(table)};
CREATE POLICY ${table}_user_owned
  ON public.${quoteIdent(table)}
  FOR ALL TO authenticated
  USING (${userColumn} = (SELECT auth.uid()))
  WITH CHECK (${userColumn} = (SELECT auth.uid()));`;

  const backfillRows = opts.backfill ?? [];
  let backfill = "";
  if (backfillRows.length > 0) {
    // Include the canonical key column (it carries WC46.NNN identity — CMT-003);
    // exclude only the userColumn (placeholder below) and, when there is NO
    // declared key field, the DB-generated synthetic "id" surrogate.
    const cols = contract.fields
      .map((f) => f.name)
      .filter((n) => n !== userColumn && (keyField ? true : n !== "id"));
    // `userColumn` is NOT NULL with no default, so it MUST appear in the INSERT
    // for the SQL to run. L2 rarely carries the owning user, so we emit a
    // clearly-marked per-row placeholder the operator replaces (one edit per
    // row) — never org_id (root CLAUDE.md §1).
    const colList = [quoteIdent(userColumn), ...cols.map(quoteIdent)].join(", ");
    const valueTuples = backfillRows
      .map(
        (row) =>
          `  ('<SET ${userColumn}>'::uuid /* fill per row */, ${cols
            .map((c) => sqlLiteral(row[c], fieldOf(contract, c)))
            .join(", ")})`,
      )
      .join(",\n");
    backfill = `

-- Backfill ${backfillRows.length} row(s) from L2. NOTE: the ${userColumn}
-- placeholder below MUST be replaced per row by the operator (L2 rarely
-- carries it); review before running.
INSERT INTO public.${quoteIdent(table)} (${colList})
VALUES
${valueTuples};`;
  }

  return {
    resource,
    table,
    sql: `${ddl}${backfill}\n\nCOMMIT;\n`,
  };
}

/** The full FieldSchema for a column (synthesizes a string fallback if absent). */
function fieldOf(contract: ResourceContract, name: string): FieldSchema {
  return contract.fields.find((f) => f.name === name) ?? { name, type: "string" };
}

/**
 * Postgres column type for a field — `<base>[]` for an array field so a
 * multi-relation (deps/serves) keeps its cardinality instead of flattening to
 * a lossy scalar TEXT (CMT-1742-014).
 */
function columnType(field: FieldSchema): string {
  const base = PG_TYPE[field.type];
  return field.array ? `${base}[]` : base;
}

function quoteIdent(name: string): string {
  // Conservative: quote unless a plain lowercase identifier.
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

function sqlScalar(value: unknown, type: FieldType): string {
  if (value == null) return "NULL";
  switch (type) {
    case "number":
      return Number.isFinite(Number(value)) ? String(Number(value)) : "NULL";
    case "boolean":
      return value ? "TRUE" : "FALSE";
    case "json":
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
    default:
      return `'${String(value).replace(/'/g, "''")}'`;
  }
}

function sqlLiteral(value: unknown, field: FieldSchema): string {
  if (value == null) return "NULL";
  if (field.array) {
    // Emit a typed Postgres array literal so the list survives (CMT-014).
    const elems = (Array.isArray(value) ? value : [value]).map((v) => sqlScalar(v, field.type));
    return `ARRAY[${elems.join(", ")}]::${PG_TYPE[field.type]}[]`;
  }
  return sqlScalar(value, field.type);
}

// Re-export the FieldSchema type for consumers building contracts inline.
export type { FieldSchema };
