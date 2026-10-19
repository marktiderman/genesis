// ---------------------------------------------------------------------------
// The database seam: one transaction per request, always as the user.
//
// Everything above this file speaks `Query` — a parameterised SQL call inside
// a transaction that has already switched to the signed-in user. Nothing
// above it can run SQL as the connection's own login role.
// ---------------------------------------------------------------------------

import postgres from "postgres";

export type SqlRow = Record<string, unknown>;

/** A parameterised statement inside the current transaction. */
export type Query = (text: string, params?: readonly unknown[]) => Promise<SqlRow[]>;

/** The identity a transaction runs as. */
export interface Identity {
  /** Database role to switch to, e.g. `authenticated`. */
  role: string;
  /** The verified token claims, exposed as `request.jwt.claims`. */
  claims: Record<string, unknown>;
}

/** What the connection's own login role is allowed to do, before any switch. */
export interface LoginRoleInfo {
  name: string;
  superuser: boolean;
  bypassRls: boolean;
  /** NOINHERIT is recommended: the login then holds no privileges until it switches. */
  inherit: boolean;
}

export interface StudioDatabase {
  /**
   * Run `fn` in one transaction that has switched to `identity`. The
   * transaction commits when `fn` resolves and rolls back when it throws.
   */
  asUser<T>(
    identity: Identity,
    options: { readOnly: boolean; statementTimeoutMs: number },
    fn: (query: Query) => Promise<T>,
  ): Promise<T>;
  /** Describe the login role. Used to refuse a privileged login. */
  inspectLogin(): Promise<LoginRoleInfo>;
  /** Close the pool. */
  end(): Promise<void>;
}

/** Thrown when the transaction did not end up as the requested role. */
export class IdentitySwitchError extends Error {
  constructor(expected: string, actual: unknown) {
    super(`Expected to act as "${expected}" but the session is "${String(actual)}". Refusing to run.`);
    this.name = "IdentitySwitchError";
  }
}

// Postgres type OIDs for date and time values. They are handed back exactly
// as Postgres prints them instead of as a JS Date: a Date keeps only
// milliseconds, so a `timestamptz` version token would never match itself
// again, and a studio should show the value that is stored, not a
// timezone-shifted copy of it.
const DATE_TIME_OIDS = [1082, 1083, 1114, 1184, 1186, 1266];

export interface PostgresOptions {
  /** Pool size. Default 5. */
  max?: number;
  /**
   * Prepared statements. Off by default, because Supabase's transaction
   * pooler (port 6543) and PgBouncer in transaction mode reject them.
   */
  prepare?: boolean;
  /** Passed through to postgres.js. */
  ssl?: postgres.Options<Record<string, never>>["ssl"];
}

/**
 * A `StudioDatabase` over a Postgres connection string, or over a postgres.js
 * pool you already have. A pool you pass in keeps its own type parsing, so
 * dates arrive as JS Dates rather than Postgres's exact text; version tokens
 * are unaffected, because they are always read as text.
 *
 * The login role only needs to be a member of the role it switches to. The
 * recommended setup is a dedicated `NOINHERIT` login role, so a bug that ever
 * skipped the switch would find no table privileges at all (see the README).
 */
export function createPostgresDatabase(
  connection: string | postgres.Sql,
  options: PostgresOptions = {},
): StudioDatabase {
  const owned = typeof connection === "string";
  const sql = owned ? connect(connection, options) : connection;
  return wrap(sql, owned);
}

function connect(connectionString: string, options: PostgresOptions): postgres.Sql {
  return postgres(connectionString, {
    max: options.max ?? 5,
    prepare: options.prepare ?? false,
    ssl: options.ssl,
    onnotice: () => {},
    types: {
      dateTime: {
        to: 1184,
        from: DATE_TIME_OIDS,
        serialize: (value: unknown) => String(value),
        parse: (value: string) => value,
      },
    },
  }) as unknown as postgres.Sql;
}

function wrap(sql: postgres.Sql, owned: boolean): StudioDatabase {
  return {
    async asUser(identity, { readOnly, statementTimeoutMs }, fn) {
      const run = async (tx: postgres.TransactionSql) => {
        const query: Query = async (text, params = []) =>
          (await tx.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as SqlRow[];
        // `set_config(..., true)` is `SET LOCAL`: it ends with the
        // transaction, so nothing leaks to the next request on this
        // connection. Every value is a parameter, never interpolated.
        //
        // Each setting is set here, not inherited, because a session-level
        // value someone else left on a pooled server connection would
        // otherwise apply. That includes Supabase's older per-claim settings:
        // its `auth.uid()`, `auth.role()` and `auth.email()` read
        // `request.jwt.claim.sub`/`.role`/`.email` FIRST, so leaving them
        // unset would let a stale `sub` decide whose rows RLS shows.
        const claim = (name: string) => {
          const value = identity.claims[name];
          return typeof value === "string" ? value : "";
        };
        await query(
          `select set_config('role', $1::text, true),
                  set_config('request.jwt.claims', $2::text, true),
                  set_config('request.jwt.claim.sub', $3::text, true),
                  set_config('request.jwt.claim.role', $4::text, true),
                  set_config('request.jwt.claim.email', $5::text, true),
                  set_config('statement_timeout', $6::text, true),
                  set_config('lock_timeout', $7::text, true),
                  set_config('idle_in_transaction_session_timeout', $8::text, true),
                  set_config('datestyle', 'ISO, YMD', true),
                  set_config('intervalstyle', 'postgres', true),
                  set_config('timezone', 'UTC', true),
                  set_config('standard_conforming_strings', 'on', true)`,
          [
            identity.role,
            JSON.stringify(identity.claims),
            claim("sub"),
            claim("role"),
            claim("email"),
            String(statementTimeoutMs),
            String(Math.min(statementTimeoutMs, 3_000)),
            String(statementTimeoutMs * 2),
          ],
        );
        const [who] = await query("select current_user as role");
        if (who?.role !== identity.role) throw new IdentitySwitchError(identity.role, who?.role);
        return fn(query);
      };
      // Writes run at REPEATABLE READ: if anyone commits a change to a row
      // after this transaction's snapshot, writing that row fails with a
      // serialization error instead of quietly building on a stale read.
      // That is what makes a version check safe where the user can't take a
      // row lock (a write carried by an app's function).
      return (readOnly
        ? sql.begin("read only", run)
        : sql.begin("isolation level repeatable read", run)) as Promise<never>;
    },
    async inspectLogin() {
      const [row] = await sql.unsafe(
        `select rolname as name, rolsuper as superuser, rolbypassrls as bypass_rls, rolinherit as inherit
           from pg_roles where rolname = session_user`,
      );
      return {
        name: String(row?.name),
        superuser: Boolean(row?.superuser),
        bypassRls: Boolean(row?.bypass_rls),
        inherit: Boolean(row?.inherit),
      };
    },
    async end() {
      // A pool the app passed in is the app's to close.
      if (owned) await sql.end({ timeout: 5 });
    },
  };
}

/** Quote an SQL identifier. Only ever applied to names read from the catalog. */
export function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Postgres error code, when the error came from the server. */
export function sqlState(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}
