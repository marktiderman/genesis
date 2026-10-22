// ---------------------------------------------------------------------------
// Why a read failed, in words a user can be shown
//
// A store's own error text ("relation \"tasks\" does not exist", "JWT
// expired", a constraint name) is for developers. A read error carries a
// plain message for the screen and keeps the store's error as its `cause`.
// ---------------------------------------------------------------------------

/**
 * - `unauthenticated`: no signed-in user, or the session expired.
 * - `forbidden`: this user may not read these records.
 * - `gone`: the one record asked for doesn't exist, or isn't visible.
 * - `invalid`: the request itself was wrong (an unknown column, a bad value).
 * - `error`: anything else.
 */
export type ReadOutcome = "unauthenticated" | "forbidden" | "gone" | "invalid" | "error";

export interface DataReadErrorOptions {
  /** The store's own error code (a Postgres SQLSTATE or PostgREST code). */
  code?: string;
  /** The underlying error, with its raw text, kept for logging. */
  cause?: unknown;
}

/** Thrown by a provider when a read failed. Its `message` is safe to show. */
export class DataReadError extends Error {
  readonly outcome: ReadOutcome;
  /** The store's own error code, when it gave one. */
  readonly code?: string;

  constructor(outcome: ReadOutcome, message: string, options: DataReadErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "DataReadError";
    this.outcome = outcome;
    if (options.code !== undefined) this.code = options.code;
  }
}

/**
 * `instanceof` fails when two copies of this package are installed, so check
 * the shape instead.
 */
export function isDataReadError(error: unknown): error is DataReadError {
  return (
    error instanceof Error &&
    error.name === "DataReadError" &&
    typeof (error as { outcome?: unknown }).outcome === "string"
  );
}

/** The plain sentence for a failed read of `noun` records (one, or a list). */
export function readFailureMessage(outcome: ReadOutcome, noun: string, one: boolean): string {
  switch (outcome) {
    case "unauthenticated":
      return "Your session has ended. Sign in again to continue.";
    case "forbidden":
      return one ? `You don't have access to this ${noun}.` : `You don't have access to these ${noun}s.`;
    case "gone":
      return `This ${noun} doesn't exist, or you can't see it.`;
    case "invalid":
      return one ? `This ${noun} couldn't be loaded.` : `These ${noun}s couldn't be loaded.`;
    default:
      return one ? `This ${noun} couldn't be loaded. Try again.` : `These ${noun}s couldn't be loaded. Try again.`;
  }
}
