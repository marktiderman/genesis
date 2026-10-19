// ---------------------------------------------------------------------------
// A record's audit history, for the record pop-up.
//
// Only for a row this user can see right now, and only the fields they may
// read: the audit log itself is written and read by security definer
// functions, so this is where "never more than the user already sees" is
// enforced for it.
// ---------------------------------------------------------------------------

import type { AuditEntry, DataRow } from "@marktiderman/genesis-core/schema";
import type { ResolvedResource } from "./access";
import { ident, type Query } from "./db";
import { HISTORY_FUNCTION } from "./setup-sql";
import { keyPredicate, literal, Params, qualifiedTable } from "./rows";
import { WriteRejected } from "./write";

function only(values: unknown, readable: ReadonlySet<string>): DataRow | null {
  if (!values || typeof values !== "object") return null;
  return Object.fromEntries(Object.entries(values as DataRow).filter(([field]) => readable.has(field)));
}

/**
 * The row's key exactly as the audit log and comments store it: built by
 * the database from the row, so lookups match entry for entry. Throws
 * `gone` when the user can't see the row right now.
 */
export async function storedKey(query: Query, resolved: ResolvedResource, key: Record<string, unknown>): Promise<string> {
  const params = new Params();
  const predicate = keyPredicate(resolved, key, params);
  const keyJson = `jsonb_build_object(${resolved.key.map((c) => `${literal(c.name)}, ${ident(c.name)}`).join(", ")})`;
  const [row] = await query(
    `select ${keyJson}::text as record_key from ${qualifiedTable(resolved)} where ${predicate}`,
    params.values,
  );
  if (!row) throw new WriteRejected("gone", "This row was deleted, or you can no longer see it.");
  return String(row.record_key);
}

export async function readHistory(
  query: Query,
  resolved: ResolvedResource,
  key: Record<string, unknown>,
  resourceName: string,
  limit: number,
): Promise<AuditEntry[]> {
  if (resolved.historyBlocked) throw new WriteRejected("forbidden", resolved.historyBlocked);
  const row = { record_key: await storedKey(query, resolved, key) };

  const entries = await query(
    `select id::text as id, occurred_at::text as occurred_at, actor, action, before, after
       from ${HISTORY_FUNCTION}($1::text, $2::text::jsonb, $3::text::int)`,
    [resourceName, row.record_key, String(limit)],
  );
  const readable = new Set(resolved.readable.map((c) => c.name));
  const recordKey = JSON.parse(String(row.record_key)) as DataRow;
  return entries.map((e) => ({
    id: String(e.id),
    occurredAt: String(e.occurred_at),
    actor: (e.actor as string | null) ?? null,
    resource: resourceName,
    key: recordKey,
    ...actionOf(String(e.action)),
    before: only(e.before, readable),
    after: only(e.after, readable),
  }));
}

/** `run:<name>` in the log is a row action. */
export function actionOf(stored: string): Pick<AuditEntry, "action" | "rowAction"> {
  if (stored.startsWith("run:")) return { action: "run", rowAction: stored.slice(4) };
  return { action: stored as AuditEntry["action"] };
}
