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
  constructor(expected: string, actual: unknown, detail?: string) {
    super(
      detail
        ? `Refusing to act as "${expected}": ${detail}.`
        : `Expected to act as "${expected}" but the session is "${String(actual)}". Refusing to run.`,
    );
    this.name = "IdentitySwitchError";
  }
}

/**
 * Header names that may carry a credential. `request.headers` is readable by
 * every function and policy in the transaction, so none of these may go into
 * it. A pattern, not a list, so `x-auth-token`, `x-session-id` and the like
 * are caught too.
 */
const CREDENTIAL_HEADER = /auth|token|secret|passw|cookie|session|api-?key|csrf|xsrf|signature|credential/;

/** The roles `switchToUser` switches to unless `allowRoles` says otherwise. */
export const DEFAULT_SWITCH_ROLES: readonly string[] = ["authenticated", "anon"];

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
  /** `statement_timeout` for the rest of the transaction, in milliseconds (above 0). Default: the server's. */
  statementTimeoutMs?: number;
  /**
   * The roles this call may switch to. Default {@link DEFAULT_SWITCH_ROLES}. Never list a role
   * that bypasses row-level security (Supabase's `service_role`): the check after the switch
   * refuses one anyway.
   */
  allowRoles?: readonly string[];
  /**
   * Allow a superuser or BYPASSRLS login, for local development only. On such a login, code
   * inside the transaction can undo the switch with `reset role`. Default false.
   */
  allowPrivilegedLogin?: boolean;
}

/** The settings, in order, as `[name, value]`. Every value is sent as a parameter. */
export function switchSettings(identity: Identity, options: SwitchOptions = {}): [string, string][] {
  if (!identity.role) throw new Error("switchToUser needs a role.");
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (name !== name.toLowerCase() || !/^[a-z0-9-]+$/.test(name)) {
      throw new Error(`Header name "${name}" must be lower-case letters, digits and dashes.`);
    }
    if (CREDENTIAL_HEADER.test(name)) throw new Error(`The "${name}" header carries a credential and can't be exposed.`);
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
    // PostgREST's other request settings: cleared, so a value left on the connection never applies.
    ["request.method", ""],
    ["request.path", ""],
    ["request.cookies", "{}"],
  ];
  if (options.statementTimeoutMs !== undefined) {
    // 0 would turn the timeout off.
    if (!Number.isFinite(options.statementTimeoutMs) || options.statementTimeoutMs < 1) {
      throw new Error("statementTimeoutMs must be at least 1.");
    }
    settings.push(["statement_timeout", String(Math.floor(options.statementTimeoutMs))]);
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
 * Runs a tagged-template query inside the caller's transaction: postgres.js's `tx` as it is, or for Drizzle
 * `(strings, ...values) => tx.execute(sql(strings, ...values))`.
 */
export type TaggedQuery = (strings: TemplateStringsArray, ...values: never[]) => unknown;

function template(parts: string[]): TemplateStringsArray {
  return Object.assign([...parts], { raw: [...parts] }) as unknown as TemplateStringsArray;
}

/**
 * Checks, in SQL, that the switch took and holds: `current_user` is the role
 * asked for and can't bypass row-level security, and the login can't undo the
 * switch. A failure raises inside the transaction, so Postgres aborts it: a
 * caller that catches the error can't go on as the login.
 */
const CHECK_SQL = `do $check$
declare
  expected text := current_setting('genesis.switch_role', true);
  privileged_user boolean;
  privileged_login boolean;
begin
  select rolsuper or rolbypassrls into privileged_user from pg_roles where rolname = current_user;
  select rolsuper or rolbypassrls into privileged_login from pg_roles where rolname = session_user;
  if current_user <> coalesce(expected, '') or coalesce(privileged_user, true) then
    raise exception 'genesis switch: expected "%", session is "%"', expected, current_user using errcode = '42501';
  end if;
  if coalesce(privileged_login, true) and current_setting('genesis.switch_allow_privileged', true) is distinct from 'on' then
    raise exception 'genesis switch: login "%" is a superuser or bypasses RLS', session_user using errcode = '42501';
  end if;
end
$check$`;

/**
 * Switch the current transaction to `identity`, then check, in SQL, that it
 * took: `current_user` must be `identity.role` and must not bypass RLS, or the
 * transaction is aborted and it throws `IdentitySwitchError`. Call it first,
 * inside a transaction; outside one, the settings end with the statement.
 *
 * - **The role** must be in `allowRoles` (default `authenticated` and `anon`),
 *   and `claims.role`, when set, must be the same role.
 * - **The login** must be a NOINHERIT login that isn't a superuser and doesn't
 *   bypass RLS, as the studio handler's is (see the README). On a privileged
 *   login, code inside the transaction could undo the switch with
 *   `reset role`, so one is refused unless `allowPrivilegedLogin` is set.
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
  const allowed = options.allowRoles ?? DEFAULT_SWITCH_ROLES;
  if (!allowed.includes(identity.role)) {
    throw new Error(`switchToUser won't switch to role "${identity.role}": it isn't in allowRoles.`);
  }
  const claimRole = identity.claims.role;
  if (claimRole !== undefined && claimRole !== identity.role) {
    throw new Error(`The token's role "${String(claimRole)}" isn't "${identity.role}".`);
  }
  const settings: [string, string][] = [
    ...switchSettings(identity, options),
    ["genesis.switch_role", identity.role],
    ["genesis.switch_allow_privileged", options.allowPrivilegedLogin ? "on" : "off"],
  ];
  const parts = settings.map(([name], i) => `${i === 0 ? "select " : "::text, true), "}set_config('${name}', `);
  parts.push("::text, true)");
  await query(template(parts), ...(settings.map(([, value]) => value) as never[]));
  try {
    await query(template([CHECK_SQL]));
  } catch (error) {
    const message = (error as { message?: unknown } | null)?.message;
    if (typeof message === "string" && message.startsWith("genesis switch:")) {
      throw new IdentitySwitchError(identity.role, undefined, message.slice("genesis switch: ".length));
    }
    throw error;
  }
}
