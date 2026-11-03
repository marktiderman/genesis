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
   * The fields this person changed whose value differs from `theirs`, in
   * `mine`'s order: the ones the choice is about. Empty when they already agree.
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

const empty = (v: unknown) => v === null || v === undefined || v === "";
const DATE = /^\d{4}-\d{2}-\d{2}([T ]|$)/;

/** A JSON-like value with object keys in order, so `{x,y}` and `{y,x}` compare equal. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/**
 * Equal for a choice. An empty input and a null column are the same; a number and the text a form
 * holds for it are the same; a date and a timestamp of that instant are the same; objects compare
 * by content, whatever their key order.
 */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b) || (empty(a) && empty(b))) return true;
  if (empty(a) || empty(b)) return false;
  if (typeof a === "number" || typeof b === "number") {
    const x = Number(a);
    const y = Number(b);
    if (!Number.isNaN(x) && !Number.isNaN(y) && typeof a !== "boolean" && typeof b !== "boolean") return x === y;
  }
  const asTime = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === "string" && DATE.test(v) ? Date.parse(v) : NaN);
  const t = asTime(a);
  if (!Number.isNaN(t) && t === asTime(b)) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  try {
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  } catch {
    return false;
  }
}

/** Options for {@link writeConflict}. */
export interface WriteConflictOptions {
  /**
   * The fields this person changed. Only these are offered as a choice; the rest of `mine` is
   * what the form loaded, and "keep mine" must not put it back over theirs. Default: every field
   * of `mine`.
   */
  readonly changed?: Iterable<string>;
  /** Shapes their row like `mine` (a form's `toFormValues`), before comparing. */
  readonly view?: (row: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * The conflict `error` reports for a write of `mine`, or null when `error`
 * isn't a `conflict` that carries the row as it is now. A field `mine` has and
 * their row doesn't (a column it doesn't read) counts as different: the
 * person decides it, never a silent "nothing to choose".
 */
export function writeConflict(
  error: unknown,
  mine: Readonly<Record<string, unknown>>,
  options: WriteConflictOptions = {},
): WriteConflict | null {
  if (!isDataWriteError(error) || error.outcome !== "conflict" || !error.current) return null;
  const row = error.current as Record<string, unknown>;
  const theirs = options.view ? options.view(row) : row;
  const changed = options.changed ? new Set(options.changed) : undefined;
  const fields = Object.keys(mine).filter(
    (field) => (!changed || changed.has(field)) && (!(field in theirs) || !same(mine[field], theirs[field])),
  );
  return { theirs, mine, fields, currentVersion: error.currentVersion ?? null };
}
