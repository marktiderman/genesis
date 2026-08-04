// =====================================================================
// Staleness marker — a degraded read is NEVER laundered into authoritative
// data (CMT-1742-002, no-ducttape).
//
// When the L2 (Airtable) adapter degrades to a last-known-good snapshot
// because a refresh failed (revoked key, deleted table, exhausted retries,
// network), it MUST NOT hand those rows back as if they were a fresh,
// authoritative read. Instead it STAMPS the returned row array with a
// non-enumerable `StaleReadInfo` marker. Downstream consumers
// (driftReport / promote) read the marker and REFUSE or explicitly flag the
// degraded read rather than treating stale as truth.
//
// The marker is a Symbol-keyed, non-enumerable property so it:
//   • never shows up in JSON.stringify / Object.entries / field iteration
//     (so it can't leak into a column, a drift value, or a backfill literal),
//   • survives a shallow `{ ...row }` clone? — NO. Symbols on the ARRAY are
//     not copied by `rows.map(r => ({...r}))`, so adapters re-stamp via
//     `propagateStale` after any clone (see airtable.ts).
// =====================================================================

/** Non-enumerable marker key for a degraded (stale-while-error) read. */
const STALE_READ = Symbol.for("@marktiderman/genesis-switchboard.staleRead");

/** Describes WHY/HOW a read degraded to stale last-known-good data. */
export interface StaleReadInfo {
  /** Correlates the served-stale event with the logged error. */
  readonly errorId: string;
  /** Resource whose refresh failed. */
  readonly resource: string;
  /** Human-readable cause (the underlying error's message). */
  readonly message: string;
  /** Epoch ms when the degradation was observed. */
  readonly at: number;
}

/**
 * Stamp a row array as a degraded (stale) read. Returns the SAME array for
 * chaining. The marker is non-enumerable so it never serializes into data.
 */
export function markStale<T>(rows: T[], info: StaleReadInfo): T[] {
  Object.defineProperty(rows, STALE_READ, {
    value: info,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return rows;
}

/** Read the staleness marker off a row array (or any value), if present. */
export function staleInfo(rows: unknown): StaleReadInfo | undefined {
  if (rows == null || (typeof rows !== "object" && typeof rows !== "function")) return undefined;
  const info = (rows as Record<symbol, unknown>)[STALE_READ];
  return (info as StaleReadInfo | undefined) ?? undefined;
}

/**
 * Copy a staleness marker from `source` onto `target` (used after a defensive
 * `{ ...row }` clone drops the array-level symbol). No-op when `source` is
 * fresh. Returns `target` for chaining.
 */
export function propagateStale<T>(source: unknown, target: T[]): T[] {
  const info = staleInfo(source);
  if (info) markStale(target, info);
  return target;
}
