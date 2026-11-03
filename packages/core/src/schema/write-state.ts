// ---------------------------------------------------------------------------
// Where a write stands, and what a conflict asks the person to choose
//
// One shape for every surface that shows a write's progress: a form, a
// record's settings, a row in a list, a chat message. `WriteConflict` is what
// ConflictSheet (genesis-ui) and NativeConflictSheet (genesis-ui-native)
// render: the row as someone else left it, beside what this person tried to
// save, for the fields where the two differ.
// ---------------------------------------------------------------------------

import { isDataWriteError } from "./write-outcome";

/** A versioned write that met someone else's change (a `conflict` outcome). */
export interface WriteConflict {
  /** The row as it is now, after their change. */
  readonly theirs: Readonly<Record<string, unknown>>;
  /** The values this write tried to save. */
  readonly mine: Readonly<Record<string, unknown>>;
  /**
   * The fields of `mine` whose value differs from `theirs`, in `mine`'s order:
   * the ones the choice is about. Empty when they already agree.
   */
  readonly fields: readonly string[];
  /** The version the row is at now: send "keep mine" at it. Null when the row carries none. */
  readonly currentVersion: string | null;
}

/**
 * Where one write stands, for a row's badge or a form's status.
 *
 * - `pending`: made, not yet sent (queued, or waiting out an undo delay).
 * - `sending`: on its way.
 * - `paused`: held until the person signs in again, or comes back online.
 * - `failed`: refused or broken; `message` says why in plain words.
 * - `conflict`: someone else changed the row first; see `conflict`.
 */
export type WriteState =
  | { readonly status: "pending" }
  | { readonly status: "sending" }
  | { readonly status: "paused"; readonly message: string }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "conflict"; readonly message: string; readonly conflict: WriteConflict };

/** Equal for a choice: the same JSON-like value (Dates by time). */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (a instanceof Date || b instanceof Date) {
    const t = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === "string" ? Date.parse(v) : NaN);
    return t(a) === t(b) && !Number.isNaN(t(a));
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * The conflict `error` reports for a write of `mine`, or null when `error`
 * isn't a `conflict` that carries the row as it is now.
 */
export function writeConflict(error: unknown, mine: Readonly<Record<string, unknown>>): WriteConflict | null {
  if (!isDataWriteError(error) || error.outcome !== "conflict" || !error.current) return null;
  const theirs = error.current as Record<string, unknown>;
  const fields = Object.keys(mine).filter((field) => field in theirs && !same(mine[field], theirs[field]));
  return { theirs, mine, fields, currentVersion: error.currentVersion ?? null };
}
