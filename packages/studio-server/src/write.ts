// ---------------------------------------------------------------------------
// Editing a row (DATA-STUDIO.md "Write safety").
//
// One transaction, as the user:
//   1. lock the row and compare its version with the one the edit was based
//      on — a mismatch is a conflict, never an overwrite;
//   2. update it;
//   3. confirm the database advanced the version — if it did not, the
//      version field can't be trusted and the edit is rolled back;
//   4. write the audit entry — if that fails, the edit is rolled back too.
// When a step changes nothing, the row is re-read to say what happened
// instead of assuming "permission denied".
// ---------------------------------------------------------------------------

import { encodeRecordKey, type AuditEntry, type DataRow, type WriteOutcome } from "@marktiderman/genesis-core/schema";
import type { ResolvedResource } from "./access";
import { ident, sqlState, type Query, type SqlRow } from "./db";
import type { StudioRow } from "./protocol";
import {
  BadRequestError,
  keyPredicate,
  literal,
  Params,
  qualifiedTable,
  readRow,
  selectList,
  toStudioRow,
  VERSION_ALIAS,
} from "./rows";

/** A write that did not commit, with what actually happened. */
export class WriteRejected extends Error {
  readonly outcome: WriteOutcome;
  readonly current?: DataRow;
  readonly currentVersion?: string | null;

  constructor(outcome: WriteOutcome, message: string, current?: StudioRow, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "WriteRejected";
    this.outcome = outcome;
    if (current) {
      this.current = current.values;
      this.currentVersion = current.version;
    }
  }
}

const BEFORE_ALIAS = "__genesis_before";
const AFTER_ALIAS = "__genesis_after";
const KEY_ALIAS = "__genesis_key";
const MATCH_ALIAS = "__genesis_version_matches";

function jsonOf(columns: readonly string[]): string {
  return `jsonb_build_object(${columns.map((c) => `${literal(c)}, ${ident(c)}`).join(", ")})`;
}

/** Only the fields whose value changed, before and after. */
function diff(before: DataRow, after: DataRow): { before: DataRow; after: DataRow } {
  const out = { before: {} as Record<string, unknown>, after: {} as Record<string, unknown> };
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      out.before[key] = before[key] ?? null;
      out.after[key] = after[key] ?? null;
    }
  }
  return out;
}

/** Re-read the row and say why a step changed nothing. */
async function explain(
  query: Query,
  resolved: ResolvedResource,
  key: Record<string, unknown>,
  expectedVersion: string | null,
): Promise<WriteRejected> {
  const current = await readRow(query, resolved, key);
  if (!current) {
    return new WriteRejected("gone", "Not saved: this row was deleted, or you can no longer see it.");
  }
  if (current.version !== expectedVersion) {
    return new WriteRejected("conflict", "Not saved: someone else changed this row. Review their change and try again.", current);
  }
  return new WriteRejected("forbidden", "Not saved: the database's row rules don't let you change this row.", current);
}

/** Map a Postgres error raised by the UPDATE to an outcome. */
function rejectedBy(error: unknown): WriteRejected | null {
  const state = sqlState(error);
  if (!state) return null;
  const detail = error instanceof Error ? error.message : String(error);
  if (state === "42501") return new WriteRejected("forbidden", `Not saved: ${detail}.`);
  if (state.startsWith("22") || state.startsWith("23") || state === "P0001") {
    return new WriteRejected("invalid", `Not saved: ${detail}.`);
  }
  if (state === "40001" || state === "40P01") {
    return new WriteRejected("conflict", "Not saved: someone else changed this row while you were saving. Reload it and try again.");
  }
  return null;
}

/** `schema.function` from config, quoted. Rejects anything else. */
function auditFunctionSql(name: string): string {
  const parts = name.split(".");
  if (parts.length > 2 || parts.some((p) => !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(p))) {
    throw new Error(`Audit function "${name}" must be "schema.function".`);
  }
  return parts.map(ident).join(".");
}

export interface UpdateInput {
  key: Record<string, unknown>;
  data: DataRow;
  expectedVersion: string | null;
  resourceName: string;
}

interface Locked {
  row: SqlRow;
  previousVersion: string | null;
  before: DataRow;
  key: DataRow;
}

/**
 * Lock the row and check it is still at the version the change was based
 * on. Every column the user can read goes into `before`, so the audit entry
 * can record exactly what changed, side effects included.
 */
async function lockAtVersion(
  query: Query,
  resolved: ResolvedResource,
  key: Record<string, unknown>,
  expectedVersion: string | null,
  lock: boolean,
): Promise<Locked> {
  const version = resolved.version!;
  const params = new Params();
  const predicate = keyPredicate(resolved, key, params);
  const expected = params.add(expectedVersion, version.castType);
  let locked: SqlRow | undefined;
  try {
    [locked] = await query(
      `select ${selectList(resolved)},
              ${ident(version.name)} is not distinct from ${expected} as ${ident(MATCH_ALIAS)},
              ${jsonOf(resolved.readable.map((c) => c.name))} as ${ident(BEFORE_ALIAS)},
              ${jsonOf(resolved.key.map((c) => c.name))} as ${ident(KEY_ALIAS)}
         from ${qualifiedTable(resolved)} where ${predicate}${lock ? " for update" : ""}`,
      params.values,
    );
  } catch (error) {
    // A key or version token the column type can't parse.
    throw rejectedBy(error) ?? error;
  }
  if (!locked) throw await explain(query, resolved, key, expectedVersion);
  if (!locked[MATCH_ALIAS]) {
    throw new WriteRejected(
      "conflict",
      "Not saved: someone else changed this row. Review their change and try again.",
      toStudioRow(resolved, locked),
    );
  }
  return {
    row: locked,
    previousVersion: (locked[VERSION_ALIAS] as string | null) ?? null,
    before: locked[BEFORE_ALIAS] as DataRow,
    key: locked[KEY_ALIAS] as DataRow,
  };
}

/** The row as it is now, with every readable column as JSON for the audit entry. */
async function reread(query: Query, resolved: ResolvedResource, key: Record<string, unknown>): Promise<SqlRow | undefined> {
  const params = new Params();
  const predicate = keyPredicate(resolved, key, params);
  const [row] = await query(
    `select ${selectList(resolved)},
            ${jsonOf(resolved.readable.map((c) => c.name))} as ${ident(AFTER_ALIAS)},
            ${jsonOf(resolved.key.map((c) => c.name))} as ${ident(KEY_ALIAS)}
       from ${qualifiedTable(resolved)} where ${predicate}`,
    params.values,
  );
  return row;
}

/** Call an app function that carries a write, as the user. */
async function callFunction(query: Query, name: string, args: unknown[]): Promise<unknown> {
  const placeholders = args.map((_, i) => `$${i + 1}::text::jsonb`).join(", ");
  try {
    const [row] = await query(`select to_jsonb(${auditFunctionSql(name)}(${placeholders})) as result`, args.map((a) => JSON.stringify(a)));
    return row?.result;
  } catch (error) {
    throw rejectedBy(error) ?? error;
  }
}

/** Write the audit entry in the same transaction; any failure undoes the change. */
async function writeAudit(
  query: Query,
  resolved: ResolvedResource,
  resourceName: string,
  action: AuditEntry["action"],
  key: DataRow,
  before: DataRow | null,
  after: DataRow | null,
): Promise<AuditEntry | undefined> {
  if (!resolved.auditFunction) return undefined;
  try {
    const [entry] = await query(
      `select id::text as id, occurred_at::text as occurred_at, actor
         from ${auditFunctionSql(resolved.auditFunction)}($1::text, $2::text::jsonb, $3::text, $4::text::jsonb, $5::text::jsonb)`,
      [resourceName, JSON.stringify(key), action, JSON.stringify(before), JSON.stringify(after)],
    );
    if (!entry) throw new Error("The audit function returned no entry.");
    return {
      id: String(entry.id),
      occurredAt: String(entry.occurred_at),
      actor: (entry.actor as string | null) ?? null,
      resource: resourceName,
      key,
      action,
      before,
      after,
    };
  } catch (error) {
    // The database's own text names internals (functions, tables, an app's
    // RAISE message): it goes to `onError`, not to the browser.
    throw new WriteRejected(
      "audit_failed",
      "Not saved: the audit entry couldn't be written, so the change was undone.",
      undefined,
      error,
    );
  }
}

export async function updateRow(
  query: Query,
  resolved: ResolvedResource,
  input: UpdateInput,
): Promise<{ row: StudioRow; audit?: AuditEntry }> {
  const { version } = resolved;
  if (resolved.blocked.update || !version) {
    throw new WriteRejected("forbidden", `Not saved: ${resolved.blocked.update ?? "this table is read-only."}`);
  }
  const fields = Object.keys(input.data);
  if (fields.length === 0) throw new BadRequestError("Nothing to save.");
  for (const field of fields) {
    if (!resolved.updatable.has(field)) {
      const schemaField = resolved.schema.fields.find((f) => f.name === field);
      throw new WriteRejected(
        "forbidden",
        `Not saved: ${schemaField?.permissions?.reason ?? `"${field}" isn't a field you can edit.`}`,
      );
    }
  }
  const changed = resolved.readable.filter((c) => fields.includes(c.name));
  const table = qualifiedTable(resolved);

  // 1. Check the version it was edited from, locking the row for a direct
  // write. A function-carried write can't take the lock (the user may hold
  // no UPDATE grant at all); REPEATABLE READ makes the function's own write
  // fail instead if the row moved after this check.
  const fn = resolved.functions.update;
  const locked = await lockAtVersion(query, resolved, input.key, input.expectedVersion, !fn);

  // 2. Update it: through the app's function when one carries updates
  // (decision 29), otherwise directly. The direct version predicate is
  // redundant under the lock, and kept so the statement is safe on its own.
  let updated: SqlRow | undefined;
  if (fn) {
    await callFunction(query, fn, [locked.key, Object.fromEntries(changed.map((c) => [c.name, input.data[c.name]]))]);
    updated = await reread(query, resolved, input.key);
    if (!updated) throw new WriteRejected("gone", "Not saved: after the app's update, this row is no longer visible to you.");
  } else {
    const params = new Params();
    const assignments = changed.map((c) => `${ident(c.name)} = ${params.add(input.data[c.name], c.castType)}`);
    const predicate = keyPredicate(resolved, input.key, params);
    const versionGuard = params.add(locked.previousVersion, version.castType);
    try {
      [updated] = await query(
        `update ${table} set ${assignments.join(", ")}
          where ${predicate} and ${ident(version.name)} is not distinct from ${versionGuard}
          returning ${selectList(resolved)},
                    ${jsonOf(resolved.readable.map((c) => c.name))} as ${ident(AFTER_ALIAS)}`,
        params.values,
      );
    } catch (error) {
      throw rejectedBy(error) ?? error;
    }
    if (!updated) throw await explain(query, resolved, input.key, input.expectedVersion);
  }

  // 3. The version must have moved, or the next conflict would go unseen.
  const row = toStudioRow(resolved, updated);
  if (row.version === locked.previousVersion) {
    throw new WriteRejected(
      fn ? "invalid" : "error",
      fn
        ? `Not saved: the app's update function ${fn} made no change.`
        : `Not saved: "${version.name}" didn't change on update, so edits to this table can't be checked for ` +
            "conflicts. Check the trigger that should advance it.",
    );
  }

  // 4. Audit, in the same transaction.
  const { before, after } = diff(locked.before, updated[AFTER_ALIAS] as DataRow);
  const audit = await writeAudit(query, resolved, input.resourceName, "update", locked.key, before, after);
  return { row, ...(audit ? { audit } : {}) };
}

export interface CreateInput {
  data: DataRow;
  resourceName: string;
}

export async function createRow(
  query: Query,
  resolved: ResolvedResource,
  input: CreateInput,
): Promise<{ row: StudioRow; id: string | number; audit?: AuditEntry }> {
  if (resolved.blocked.create) throw new WriteRejected("forbidden", `Not saved: ${resolved.blocked.create}`);
  const fields = Object.keys(input.data);
  for (const field of fields) {
    if (!resolved.creatable.has(field)) {
      throw new WriteRejected("forbidden", `Not saved: "${field}" isn't a field you can set on a new row.`);
    }
  }
  const columns = resolved.readable.filter((c) => fields.includes(c.name));
  const keyNames = resolved.key.map((c) => c.name);

  let created: SqlRow | undefined;
  const fn = resolved.functions.create;
  if (fn) {
    const result = await callFunction(query, fn, [Object.fromEntries(columns.map((c) => [c.name, input.data[c.name]]))]);
    const key = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
    if (!key || keyNames.some((k) => key[k] === undefined || key[k] === null)) {
      throw new WriteRejected(
        "error",
        `Not saved: the app's create function ${fn} must return the new row, or an object with its key (${keyNames.join(", ")}).`,
      );
    }
    created = await reread(query, resolved, key);
  } else {
    const params = new Params();
    const values = columns.map((c) => params.add(input.data[c.name], c.castType));
    const target = columns.length
      ? `(${columns.map((c) => ident(c.name)).join(", ")}) values (${values.join(", ")})`
      : "default values";
    try {
      [created] = await query(
        `insert into ${qualifiedTable(resolved)} ${target}
         returning ${selectList(resolved)},
                   ${jsonOf(resolved.readable.map((c) => c.name))} as ${ident(AFTER_ALIAS)},
                   ${jsonOf(keyNames)} as ${ident(KEY_ALIAS)}`,
        params.values,
      );
    } catch (error) {
      throw rejectedBy(error) ?? error;
    }
  }
  if (!created) throw new WriteRejected("forbidden", "Not saved: the new row wouldn't be visible to you.");

  const key = created[KEY_ALIAS] as DataRow;
  const after = created[AFTER_ALIAS] as DataRow;
  const audit = await writeAudit(query, resolved, input.resourceName, "create", key, null, after);
  const row = toStudioRow(resolved, created);
  return { row, id: encodeRecordKey(resolved.schema, row.values), ...(audit ? { audit } : {}) };
}

export interface DeleteInput {
  key: Record<string, unknown>;
  expectedVersion: string | null;
  resourceName: string;
}

export async function deleteRow(
  query: Query,
  resolved: ResolvedResource,
  input: DeleteInput,
): Promise<{ audit?: AuditEntry }> {
  const { version } = resolved;
  if (resolved.blocked.delete || !version) {
    throw new WriteRejected("forbidden", `Not deleted: ${resolved.blocked.delete ?? "this table is read-only."}`);
  }
  // Deletes are version-checked too: deleting a row someone just changed
  // would throw away their change unseen.
  const fn = resolved.functions.delete;
  const locked = await lockAtVersion(query, resolved, input.key, input.expectedVersion, !fn);

  if (fn) {
    await callFunction(query, fn, [locked.key]);
    if (await reread(query, resolved, input.key)) {
      throw new WriteRejected("invalid", `Not deleted: the app's delete function ${fn} kept the row.`);
    }
  } else {
    const params = new Params();
    const predicate = keyPredicate(resolved, input.key, params);
    const versionGuard = params.add(locked.previousVersion, version.castType);
    let deleted: SqlRow[];
    try {
      deleted = await query(
        `delete from ${qualifiedTable(resolved)}
          where ${predicate} and ${ident(version.name)} is not distinct from ${versionGuard}
          returning 1 as deleted`,
        params.values,
      );
    } catch (error) {
      throw rejectedBy(error) ?? error;
    }
    if (deleted.length !== 1) throw await explain(query, resolved, input.key, input.expectedVersion);
  }

  const audit = await writeAudit(query, resolved, input.resourceName, "delete", locked.key, locked.before, null);
  return audit ? { audit } : {};
}
