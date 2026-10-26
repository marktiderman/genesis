// ---------------------------------------------------------------------------
// The identity switch, on its own: the first statement of a transaction that
// should run as the signed-in user under row-level security, for any driver.
//
// The studio handler uses it through `createPostgresDatabase`. An app's own
// API (Drizzle, postgres.js, a socket handler) uses `switchToUser` inside its
// own transaction, so every user-scoped query sees exactly what PostgREST
// would show that user.
// ---------------------------------------------------------------------------

import type { Identity } from "./db";

/** Thrown when the transaction did not end up as the requested role. */
export class IdentitySwitchError extends Error {
  constructor(expected: string, actual: unknown) {
    super(`Expected to act as "${expected}" but the session is "${String(actual)}". Refusing to run.`);
    this.name = "IdentitySwitchError";
  }
}

/**
 * Headers that carry a credential. `request.headers` is readable by every
 * function and policy in the transaction, so none of these may go into it.
 */
const CREDENTIAL_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "apikey",
  "x-api-key",
  "x-supabase-api-key",
]);

export interface SwitchOptions {
  /**
   * Request headers to expose as `request.headers` (lower-case names), the way
   * PostgREST does, for policies or functions that read one, e.g.
   * `current_setting('request.headers', true)::json ->> 'x-app'`. Pass only the
   * headers they read. Credential headers (`authorization`, `cookie`, `apikey`
   * and the like) are refused. Default: none, so a value left on a pooled
   * connection never applies.
   */
  headers?: Readonly<Record<string, string>>;
  /** `statement_timeout` for the rest of the transaction, in milliseconds. Default: the server's. */
  statementTimeoutMs?: number;
}

/** The settings, in order, as `[name, value]`. Every value is sent as a parameter. */
export function switchSettings(identity: Identity, options: SwitchOptions = {}): [string, string][] {
  if (!identity.role) throw new Error("switchToUser needs a role.");
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (name !== name.toLowerCase() || !/^[a-z0-9-]+$/.test(name)) {
      throw new Error(`Header name "${name}" must be lower-case letters, digits and dashes.`);
    }
    if (CREDENTIAL_HEADERS.has(name)) throw new Error(`The "${name}" header carries a credential and can't be exposed.`);
    if (typeof value !== "string") throw new Error(`Header "${name}" must be a string.`);
    headers[name] = value;
  }
  // Supabase's `auth.uid()`, `auth.role()` and `auth.email()` read the older
  // per-claim settings FIRST, so they're always set: a stale `sub` someone
  // left on a pooled connection must never decide whose rows RLS shows.
  const claim = (name: string) => {
    const value = identity.claims[name];
    return typeof value === "string" ? value : "";
  };
  const settings: [string, string][] = [
    ["role", identity.role],
    ["request.jwt.claims", JSON.stringify(identity.claims)],
    ["request.jwt.claim.sub", claim("sub")],
    ["request.jwt.claim.role", claim("role")],
    ["request.jwt.claim.email", claim("email")],
    ["request.headers", JSON.stringify(headers)],
  ];
  if (options.statementTimeoutMs !== undefined) {
    settings.push(["statement_timeout", String(Math.max(0, Math.floor(options.statementTimeoutMs)))]);
  }
  return settings;
}

/**
 * One `select set_config(..., true)` for `settings`, numbered from `$1`.
 * `set_config(..., true)` is `SET LOCAL`: it ends with the transaction.
 */
export function settingsStatement(settings: readonly [string, string][]): { text: string; params: string[] } {
  const params: string[] = [];
  const calls = settings.map(([name, value]) => {
    params.push(value);
    // Names are this module's own constants, never caller input.
    return `set_config('${name}', $${params.length}::text, true)`;
  });
  return { text: `select ${calls.join(",\n       ")}`, params };
}

/**
 * Runs a tagged-template query inside the caller's transaction and resolves
 * with its rows: postgres.js's `tx` as it is, or for Drizzle
 * `(strings, ...values) => tx.execute(sql(strings, ...values))`.
 */
export type TaggedQuery = (strings: TemplateStringsArray, ...values: never[]) => unknown;

function template(parts: string[]): TemplateStringsArray {
  return Object.assign([...parts], { raw: [...parts] }) as unknown as TemplateStringsArray;
}

/** Rows from a driver's result: an array (postgres.js, Drizzle over it) or `{ rows }` (node-postgres). */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/**
 * Switch the current transaction to `identity`, then check that it took:
 * `current_user` must be `identity.role`, or it throws `IdentitySwitchError`
 * and the caller's transaction rolls back. Call it first, inside a
 * transaction; outside one, the settings end with the statement.
 *
 * It works on any login, including a privileged one an app also uses for
 * server-owned writes: after the switch, RLS applies as it would for the user,
 * and the check refuses to go on if it didn't. (The studio handler still
 * refuses a privileged login, as a second line of defence.)
 *
 * ```ts
 * // Drizzle
 * await db.transaction(async (tx) => {
 *   await switchToUser((s, ...v) => tx.execute(sql(s, ...v)), { role: "authenticated", claims }, { headers: { "x-app": app } });
 *   return tx.select().from(rooms);
 * });
 * // postgres.js
 * await sql.begin(async (tx) => {
 *   await switchToUser(tx, { role: "authenticated", claims });
 *   return tx`select * from rooms`;
 * });
 * ```
 */
export async function switchToUser(query: TaggedQuery, identity: Identity, options: SwitchOptions = {}): Promise<void> {
  const settings = switchSettings(identity, options);
  const parts = settings.map(([name], i) => `${i === 0 ? "select " : "::text, true), "}set_config('${name}', `);
  parts.push("::text, true)");
  await query(template(parts), ...(settings.map(([, value]) => value) as never[]));
  const [who] = rowsOf(await query(template(["select current_user as role"])));
  if (who?.role !== identity.role) throw new IdentitySwitchError(identity.role, who?.role);
}
