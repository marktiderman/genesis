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

import type { AuditEntry, DataRow, WriteOutcome } from "@marktiderman/genesis-core/schema";
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

  constructor(outcome: WriteOutcome, message: string, current?: StudioRow) {
    super(message);
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
    return new WriteRejected("conflict", "Not saved: another edit to this row was in progress. Try again.");
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

export async function updateRow(
  query: Query,
  resolved: ResolvedResource,
  input: UpdateInput,
): Promise<{ row: StudioRow; audit?: AuditEntry }> {
  const { version } = resolved;
  if (!version) {
    throw new WriteRejected("forbidden", resolved.schema.access.reason ?? "Not saved: this table is read-only.");
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
  const keyNames = resolved.key.map((c) => c.name);

  // 1. Lock the row and check the version it was edited from.
  const lockParams = new Params();
  const lockPredicate = keyPredicate(resolved, input.key, lockParams);
  const expected = lockParams.add(input.expectedVersion, version.castType);
  let locked: SqlRow | undefined;
  try {
    [locked] = await query(
      `select ${selectList(resolved)},
              ${ident(version.name)} is not distinct from ${expected} as ${ident(MATCH_ALIAS)},
              ${jsonOf(changed.map((c) => c.name))} as ${ident(BEFORE_ALIAS)},
              ${jsonOf(keyNames)} as ${ident(KEY_ALIAS)}
         from ${table} where ${lockPredicate} for update`,
      lockParams.values,
    );
  } catch (error) {
    // A key or version token the column type can't parse.
    throw rejectedBy(error) ?? error;
  }
  if (!locked) throw await explain(query, resolved, input.key, input.expectedVersion);
  if (!locked[MATCH_ALIAS]) {
    throw new WriteRejected(
      "conflict",
      "Not saved: someone else changed this row. Review their change and try again.",
      toStudioRow(resolved, locked),
    );
  }
  const previousVersion = (locked[VERSION_ALIAS] as string | null) ?? null;

  // 2. Update it. The version predicate is redundant under the lock, and kept
  // so this statement is safe on its own.
  const params = new Params();
  const assignments = changed.map((c) => `${ident(c.name)} = ${params.add(input.data[c.name], c.castType)}`);
  const predicate = keyPredicate(resolved, input.key, params);
  const versionGuard = params.add(previousVersion, version.castType);
  let updated: SqlRow | undefined;
  try {
    [updated] = await query(
      `update ${table} set ${assignments.join(", ")}
        where ${predicate} and ${ident(version.name)} is not distinct from ${versionGuard}
        returning ${selectList(resolved)}, ${jsonOf(changed.map((c) => c.name))} as ${ident(AFTER_ALIAS)}`,
      params.values,
    );
  } catch (error) {
    throw rejectedBy(error) ?? error;
  }
  if (!updated) throw await explain(query, resolved, input.key, input.expectedVersion);

  // 3. The version must have moved, or the next conflict would go unseen.
  const row = toStudioRow(resolved, updated);
  if (row.version === previousVersion) {
    throw new WriteRejected(
      "error",
      `Not saved: "${version.name}" didn't change on update, so edits to this table can't be checked for ` +
        "conflicts. Check the trigger that should advance it.",
    );
  }

  // 4. Audit, in the same transaction.
  if (!resolved.auditFunction) return { row };
  try {
    const [entry] = await query(
      `select id::text as id, occurred_at::text as occurred_at, actor
         from ${auditFunctionSql(resolved.auditFunction)}($1::text, $2::text::jsonb, 'update', $3::text::jsonb, $4::text::jsonb)`,
      [
        input.resourceName,
        JSON.stringify(locked[KEY_ALIAS]),
        JSON.stringify(locked[BEFORE_ALIAS]),
        JSON.stringify(updated[AFTER_ALIAS]),
      ],
    );
    if (!entry) throw new Error("The audit function returned no entry.");
    return {
      row,
      audit: {
        id: String(entry.id),
        occurredAt: String(entry.occurred_at),
        actor: (entry.actor as string | null) ?? null,
        resource: input.resourceName,
        key: locked[KEY_ALIAS] as DataRow,
        action: "update",
        before: locked[BEFORE_ALIAS] as DataRow,
        after: updated[AFTER_ALIAS] as DataRow,
      },
    };
  } catch (error) {
    throw new WriteRejected(
      "audit_failed",
      `Not saved: the audit entry couldn't be written, so the edit was undone (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
}
