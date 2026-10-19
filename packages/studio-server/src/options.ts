import type { StudioAuth, StudioClaims } from "./auth";
import type { StudioDatabase } from "./db";

/** The actions `authorize` is asked about. */
export type StudioAction = "read" | "update";

export interface AuthorizeContext {
  request: Request;
  /** The verified claims of the signed-in user. */
  claims: StudioClaims;
  /** `schema.table`, e.g. `public.clients`. */
  resource: string;
  action: StudioAction;
}

/**
 * `true` allows, `false` denies. The object form can narrow the columns:
 * for `read`, columns left out are never selected or sent; for `update`,
 * they render read-only. Either way the database's own privileges and row
 * rules still apply on top, so an allow can never grant more than the
 * database does.
 */
export type AuthorizeDecision =
  | boolean
  | { allow: false; reason?: string }
  | {
      allow: true;
      /** Only these columns. */
      columns?: readonly string[];
      /** Every column except these. */
      exceptColumns?: readonly string[];
      reason?: string;
    };

/**
 * The app's say over which tables appear and which may be edited. Called for
 * every resource and action; anything it does not allow is denied.
 */
export type Authorize = (context: AuthorizeContext) => AuthorizeDecision | Promise<AuthorizeDecision>;

/**
 * Where the audit entry for each edit goes. Writes stay off until one is
 * configured.
 *
 * - `table`: the handler calls `genesis_studio.record_audit` (installed by
 *   `npx genesis-studio-server sql`) inside the edit's transaction.
 * - `database`: the app's own triggers audit every change. Because the
 *   handler acts as the user, those triggers see the real actor. They must
 *   follow the same tamper-proof rules as the `table` sink.
 */
export type AuditSink = { sink: "table"; function?: string } | { sink: "database" };

export interface ResourceSettings {
  /**
   * The version column checked on every update. Default: `updated_at`, then
   * `version`, whichever exists. It is only trusted when a trigger advances
   * it on every update.
   */
  versionField?: string;
  /** Sidebar label. Default: the table name in title case. */
  label?: string;
}

export interface StudioHandlerOptions {
  /** A Postgres connection string, or a `StudioDatabase` you built. */
  database: string | StudioDatabase;
  /** Verifies who is asking. See `jwtAuth` and `supabaseAuth`. */
  auth: StudioAuth;
  /** Deny by default. See {@link Authorize}. */
  authorize: Authorize;
  /** Audit sink. Without one, every table is read-only. */
  audit?: AuditSink;
  /** Schemas to discover. Default `["public"]`. */
  schemas?: readonly string[];
  /** Role every request runs as. Default `authenticated`. */
  role?: string;
  /** Per-resource settings, keyed `schema.table`. */
  resources?: Readonly<Record<string, ResourceSettings>>;
  /** Default 10 000. */
  statementTimeoutMs?: number;
  /** Largest page a list may ask for. Default 200. */
  maxPageSize?: number;
  /** Called with errors the user only sees as "something went wrong". */
  onError?: (error: unknown) => void;
}
