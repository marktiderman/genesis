// ---------------------------------------------------------------------------
// Bulk writes, imports and undo (DATA-STUDIO.md P2, "Write safety").
//
// Exact by construction: every row runs in its own savepoint inside ONE
// transaction, so every failure is collected, and then either every row is
// kept or none is. Access rules can't quietly skip rows: a row that changes
// nothing is a failure, not a smaller count.
// ---------------------------------------------------------------------------

import type { AuditEntry, DataRow } from "@marktiderman/genesis-core/schema";
import type { ResolvedResource } from "./access";
import { ident, type Query } from "./db";
import { BadRequestError, keyPredicate, literal, Params, qualifiedTable, versionSql } from "./rows";
import { AUDIT_ENTRY_FUNCTION } from "./setup-sql";
import { createRow, deleteRow, updateRow, WriteRejected } from "./write";

export const MAX_BULK_ROWS = 500;
export const MAX_IMPORT_ROWS = 5000;

export interface RowFailure {
  index: number;
  id?: string | number;
  outcome: string;
  message: string;
}

/** Thrown to roll the whole transaction back, carrying every row's failure. */
export class BulkRejected extends Error {
  constructor(
    readonly failures: RowFailure[],
    readonly dryRunCount?: number,
  ) {
    super(dryRunCount === undefined ? `${failures.length} row(s) failed; nothing was changed.` : "Dry run.");
    this.name = "BulkRejected";
  }
}

function failureOf(index: number, id: string | number | undefined, error: unknown): RowFailure {
  if (error instanceof WriteRejected) return { index, ...(id !== undefined ? { id } : {}), outcome: error.outcome, message: error.message };
  if (error instanceof BadRequestError) return { index, ...(id !== undefined ? { id } : {}), outcome: "invalid", message: error.message };
  // Anything else is unexpected: rethrow so the handler reports it as an error.
  throw error;
}

async function eachInSavepoint<I>(
  query: Query,
  items: readonly I[],
  run: (query: Query, item: I, index: number) => Promise<AuditEntry | undefined>,
  idOf: (item: I) => string | number | undefined,
): Promise<{ failures: RowFailure[]; audit: AuditEntry[] }> {
  const failures: RowFailure[] = [];
  const audit: AuditEntry[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    try {
      const entry = await query.savepoint((q) => run(q, item, index));
      if (entry) audit.push(entry);
    } catch (error) {
      failures.push(failureOf(index, idOf(item), error));
    }
  }
  return { failures, audit };
}

export interface BulkUpdateItem {
  key: Record<string, unknown>;
  id: string | number;
  data: DataRow;
  expectedVersion: string | null;
}

export async function updateMany(query: Query, resolved: ResolvedResource, items: BulkUpdateItem[], resourceName: string) {
  if (items.length === 0) throw new BadRequestError("Nothing to save.");
  if (items.length > MAX_BULK_ROWS) throw new BadRequestError(`At most ${MAX_BULK_ROWS} rows at once.`);
  const { failures, audit } = await eachInSavepoint(
    query,
    items,
    async (q, item) => (await updateRow(q, resolved, { key: item.key, data: item.data, expectedVersion: item.expectedVersion, resourceName })).audit,
    (item) => item.id,
  );
  if (failures.length) throw new BulkRejected(failures);
  return { ok: true as const, count: items.length, audit };
}

export interface BulkDeleteItem {
  key: Record<string, unknown>;
  id: string | number;
  expectedVersion: string | null;
}

export async function deleteMany(query: Query, resolved: ResolvedResource, items: BulkDeleteItem[], resourceName: string) {
  if (items.length === 0) throw new BadRequestError("Nothing to delete.");
  if (items.length > MAX_BULK_ROWS) throw new BadRequestError(`At most ${MAX_BULK_ROWS} rows at once.`);
  const { failures, audit } = await eachInSavepoint(
    query,
    items,
    async (q, item) => (await deleteRow(q, resolved, { key: item.key, expectedVersion: item.expectedVersion, resourceName })).audit,
    (item) => item.id,
  );
  if (failures.length) throw new BulkRejected(failures);
  return { ok: true as const, count: items.length, audit };
}

/**
 * Add rows from an import. Each row is inserted for real, in its own
 * savepoint, so the database itself checks every value, constraint and row
 * rule; nothing is coerced, and a value that won't convert is a failure, not
 * a null. A dry run then rolls everything back.
 */
export async function importRows(
  query: Query,
  resolved: ResolvedResource,
  rows: DataRow[],
  resourceName: string,
  dryRun: boolean,
) {
  if (rows.length === 0) throw new BadRequestError("No rows to import.");
  if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestError(`At most ${MAX_IMPORT_ROWS} rows per import.`);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new BadRequestError("Each row must be an object of field → value.");
  }
  const { failures, audit } = await eachInSavepoint(
    query,
    rows,
    async (q, row) => (await createRow(q, resolved, { data: row, resourceName })).audit,
    () => undefined,
  );
  if (dryRun) throw new BulkRejected(failures, rows.length - failures.length);
  if (failures.length) throw new BulkRejected(failures);
  return { ok: true as const, count: rows.length, audit };
}

/**
 * Undo one audited change of the user's own, with a compensating write that
 * is itself audited. Refused when the row no longer looks the way that
 * change left it: undoing over someone's later edit would silently lose it.
 */
export async function undoChange(
  query: Query,
  resolved: ResolvedResource,
  auditId: string,
  actor: string,
  resourceName: string,
): Promise<{ audit?: AuditEntry }> {
  if (resolved.historyBlocked) throw new WriteRejected("forbidden", `Can't undo: ${resolved.historyBlocked}`);
  if (!/^[0-9a-f-]{36}$/i.test(auditId)) throw new BadRequestError('"auditId" must be an audit entry id.');
  const [entry] = await query(
    `select resource, actor, action, record_key::text as record_key, before, after from ${AUDIT_ENTRY_FUNCTION}($1::text::uuid)`,
    [auditId],
  );
  if (!entry || entry.resource !== resourceName) throw new WriteRejected("gone", "No such change in this table's history.");
  if (entry.actor !== actor) throw new WriteRejected("forbidden", "You can only undo your own changes.");
  if (String(entry.action).startsWith("run:")) {
    // The app's function may have done more than this row shows.
    throw new WriteRejected("forbidden", "Can't undo: a row action may have changed more than this row, so it can't be reversed here.");
  }

  const key = JSON.parse(String(entry.record_key)) as Record<string, unknown>;
  const before = (entry.before ?? {}) as DataRow;
  const after = (entry.after ?? {}) as DataRow;
  const versionField = resolved.version?.name;
  const readable = new Set(resolved.readable.map((c) => c.name));
  // Fields the change set, other than the version the database advanced.
  const touched = Object.keys(after).filter((f) => f !== versionField && readable.has(f));

  // The row as it is now, as JSON, to compare with what the change left.
  const current = await currentRow(query, resolved, key);

  if (entry.action === "update" || entry.action === "create") {
    if (!current) throw new WriteRejected("gone", "Can't undo: the row was deleted, or you can no longer see it.");
    const moved = touched.filter((f) => JSON.stringify(current.values[f] ?? null) !== JSON.stringify(after[f] ?? null));
    if (moved.length) {
      throw new WriteRejected("conflict", `Can't undo: ${moved.join(", ")} changed since. Undo would overwrite that change.`);
    }
    if (entry.action === "create") {
      return deleteRow(query, resolved, { key, expectedVersion: current.version, resourceName });
    }
    const data = Object.fromEntries(touched.map((f) => [f, before[f] ?? null]));
    const result = await updateRow(query, resolved, { key, data, expectedVersion: current.version, resourceName });
    return result.audit ? { audit: result.audit } : {};
  }

  // A deletion: put the row back, with its own key, or not at all.
  if (current) throw new WriteRejected("conflict", "Can't undo: a row with this key exists again.");
  const keyNames = resolved.key.map((c) => c.name);
  if (!keyNames.every((k) => resolved.creatable.has(k))) {
    throw new WriteRejected("forbidden", "Can't undo: this table's key is set by the database, so the row can't come back with the same identity.");
  }
  const data = Object.fromEntries(Object.entries(before).filter(([f]) => resolved.creatable.has(f)));
  const result = await createRow(query, resolved, { data, resourceName });
  return result.audit ? { audit: result.audit } : {};
}

async function currentRow(query: Query, resolved: ResolvedResource, key: Record<string, unknown>) {
  const params = new Params();
  const predicate = keyPredicate(resolved, key, params);
  const names = resolved.readable.map((c) => c.name);
  const version = versionSql(resolved);
  const [row] = await query(
    `select jsonb_build_object(${names.map((n) => `${literal(n)}, ${ident(n)}`).join(", ")}) as values
            ${version ? `, ${version} as version` : ""}
       from ${qualifiedTable(resolved)} where ${predicate}`,
    params.values,
  );
  return row ? { values: row.values as DataRow, version: (row.version as string | null | undefined) ?? null } : null;
}
