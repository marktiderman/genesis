// ---------------------------------------------------------------------------
// Why a write did not save (DATA-STUDIO.md "Write safety")
//
// A write that changes nothing is never reported as "permission denied" by
// assumption. The provider re-reads the row and says what actually happened.
// ---------------------------------------------------------------------------

import type { DataRow } from "./types";

/**
 * - `conflict`: someone else changed the row since it was read. `current`
 *   carries the row as it is now.
 * - `gone`: the row was deleted, or is no longer visible to this user. The
 *   two cannot be told apart without a privileged look at the table, which
 *   would show this user a fact about a row they cannot see.
 * - `forbidden`: the row is visible and unchanged, but the app or the
 *   database does not let this user make this change. Only reported when
 *   that is proven, never assumed from "zero rows changed".
 * - `invalid`: the store rejected the value (type, constraint, not-null).
 * - `audit_failed`: the audit entry could not be written, so the edit was
 *   rolled back with it.
 * - `unauthenticated`: no signed-in user, or the session expired.
 * - `error`: anything else. The edit did not commit.
 */
export type WriteOutcome =
  | "conflict"
  | "gone"
  | "forbidden"
  | "invalid"
  | "audit_failed"
  | "unauthenticated"
  | "error";

export interface DataWriteErrorOptions {
  /** The row as it is now, for a `conflict`. Only fields the user may read. */
  current?: DataRow;
  /** The row's current version token, for a `conflict`. */
  currentVersion?: string | null;
  /**
   * The store's own error code, when it gave one (a Postgres SQLSTATE such as
   * `23505`, or a PostgREST code such as `PGRST301`).
   */
  code?: string;
  /** The underlying error, kept for logging. */
  cause?: unknown;
}

/** Thrown by a provider when a write did not commit. */
export class DataWriteError extends Error {
  readonly outcome: WriteOutcome;
  readonly current?: DataRow;
  readonly currentVersion?: string | null;
  /** The store's own error code, when it gave one. */
  readonly code?: string;

  constructor(outcome: WriteOutcome, message: string, options: DataWriteErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "DataWriteError";
    this.outcome = outcome;
    this.current = options.current;
    this.currentVersion = options.currentVersion;
    if (options.code !== undefined) this.code = options.code;
  }
}

/**
 * `instanceof` fails when two copies of this package are installed, so check
 * the shape instead.
 */
export function isDataWriteError(error: unknown): error is DataWriteError {
  return (
    error instanceof Error &&
    error.name === "DataWriteError" &&
    typeof (error as { outcome?: unknown }).outcome === "string"
  );
}
