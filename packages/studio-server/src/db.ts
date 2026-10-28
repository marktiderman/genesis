// ---------------------------------------------------------------------------
// The database seam: one transaction per request, always as the user.
//
// Everything above this file speaks `Query` — a parameterised SQL call inside
// a transaction that has already switched to the signed-in user. Nothing
// above it can run SQL as the connection's own login role.
// ---------------------------------------------------------------------------

import postgres from "postgres";
import { IdentitySwitchError, settingsStatement, switchRefusal, switchSettings } from "./switch";

export type SqlRow = Record<string, unknown>;

/** A parameterised statement inside the current transaction. */
export interface Query {
  (text: string, params?: readonly unknown[]): Promise<SqlRow[]>;
  /**
   * Run `fn` in a savepoint: if it throws, only its own statements are
   * undone and the transaction carries on. Bulk writes and imports use this
   * to try every row and report all the failures, not just the first.
   */
  savepoint<T>(fn: (query: Query) => Promise<T>): Promise<T>;
}

function queryOver(tx: postgres.TransactionSql): Query {
  const query = (async (text: string, params: readonly unknown[] = []) =>
    (await tx.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as SqlRow[]) as Query;
  query.savepoint = <T>(fn: (inner: Query) => Promise<T>) =>
    tx.savepoint((sp) => fn(queryOver(sp as unknown as postgres.TransactionSql))) as Promise<T>;
  return query;
}

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

export { IdentitySwitchError };

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
  /**
   * Open a connection for each transaction and close it after, instead of
   * keeping a pool. Default: on when running on Cloudflare Workers, where a
   * connection belongs to the request that opened it and a pooled one fails
   * from the second request on ("Cannot perform I/O on behalf of a different
   * request"); off everywhere else.
   */
  perRequest?: boolean;
}

/** True on Cloudflare Workers (and so on Lovable's hosting). */
export function onCloudflareWorkers(): boolean {
  return typeof navigator !== "undefined" && (navigator as { userAgent?: string }).userAgent === "Cloudflare-Workers";
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
  if (typeof connection === "string" && (options.perRequest ?? onCloudflareWorkers())) {
    return perRequest(connection, options);
  }
  const owned = typeof connection === "string";
  const sql = owned ? connect(connection, options) : (connection as postgres.Sql);
  return wrap(sql, owned);
}

/** A connection per transaction, closed when it ends: nothing outlives the request. */
function perRequest(connectionString: string, options: PostgresOptions): StudioDatabase {
  const once = async <T>(fn: (db: StudioDatabase) => Promise<T>): Promise<T> => {
    const sql = connect(connectionString, { ...options, max: 1 });
    try {
      return await fn(wrap(sql, true));
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
  return {
    asUser: (identity, opts, fn) => once((db) => db.asUser(identity, opts, fn)),
    inspectLogin: () => once((db) => db.inspectLogin()),
    // Nothing stays open between requests.
    async end() {},
  };
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
        const query = queryOver(tx);
        // `set_config(..., true)` is `SET LOCAL`: it ends with the
        // transaction, so nothing leaks to the next request on this
        // connection. Every value is a parameter, never interpolated, and
        // every setting is set here, not inherited (see `switchSettings`).
        const { text, params } = settingsStatement([
          ...switchSettings(identity, { statementTimeoutMs }),
          ["lock_timeout", String(Math.min(statementTimeoutMs, 3_000))],
          ["idle_in_transaction_session_timeout", String(statementTimeoutMs * 2)],
          ["datestyle", "ISO, YMD"],
          ["intervalstyle", "postgres"],
          ["timezone", "UTC"],
          ["standard_conforming_strings", "on"],
        ]);
        try {
          await query(text, params);
        } catch (error) {
          // A login without the grant fails here; report it as the refused switch it is.
          throw switchRefusal(identity.role, error) ?? error;
        }
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
