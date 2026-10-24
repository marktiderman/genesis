/**
 * Checking a block's `props` for `parseForm`: the shared helpers every content and field kind's
 * `checkProps` uses, so each kind states its own settings once and they are reported the same way.
 */

/**
 * A kind's check of its `props` (an object, `{}` when the block has none). Report through
 * `check`, with paths under `props` (`"max"`, `"columns[0].key"`); `parseForm` prefixes each
 * with the block's (`blocks[3].props.`).
 */
export type PropsCheck = (props: Readonly<Record<string, unknown>>, check: PropsChecker) => void;

/**
 * Names an id, key or hidden input may not take: they collide with `Object.prototype`
 * (`__proto__`, `constructor`, `toString`…) when used as a record key.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype));

export const isPlainRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const isWholeNumber = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
export const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The helpers a `PropsCheck` reports through. Paths are relative to `props`. */
export interface PropsChecker {
  /** Report a problem with the setting at `path`. */
  issue(path: string, message: string): void;
  /** A required string (non-empty with `nonEmpty`). */
  text(v: unknown, path: string, nonEmpty?: boolean): void;
  /** An optional string. */
  optionalText(v: unknown, path: string): void;
  /** An optional true or false. */
  optionalBoolean(v: unknown, path: string): void;
  /** An optional whole number of at least `floor`. */
  optionalInt(v: unknown, path: string, floor: number): void;
  /** `low` may not exceed `high` when both are whole numbers. */
  ordered(low: unknown, high: unknown, path: string, what: string): void;
  /** An identifier: a non-empty string that is not an `Object.prototype` name. */
  name(v: unknown, path: string, what: string): v is string;
}

/**
 * A `PropsChecker` that reports to `report` with `prefix` before each path (`""` for a path of
 * `props` itself). `parseForm` makes one per block.
 */
export function propsChecker(prefix: string, report: (path: string, message: string) => void): PropsChecker {
  const at = (path: string) => (path ? `${prefix}.${path}` : prefix);
  const issue = (path: string, message: string) => report(at(path), message);
  return {
    issue,
    text(v, path, nonEmpty = false) {
      if (typeof v !== "string" || (nonEmpty && !v)) issue(path, nonEmpty ? "Required." : "Required text.");
    },
    optionalText(v, path) {
      if (v !== undefined && typeof v !== "string") issue(path, "Must be text.");
    },
    optionalBoolean(v, path) {
      if (v !== undefined && typeof v !== "boolean") issue(path, "Must be true or false.");
    },
    optionalInt(v, path, floor) {
      if (v !== undefined && !(isWholeNumber(v) && v >= floor)) issue(path, `Must be a whole number of ${floor} or more.`);
    },
    ordered(low, high, path, what) {
      if (isWholeNumber(low) && isWholeNumber(high) && low > high) issue(path, `Can't be more than the ${what}.`);
    },
    name(v, path, what): v is string {
      if (typeof v !== "string" || !v) {
        issue(path, `${what} must be a non-empty string.`);
        return false;
      }
      if (RESERVED_NAMES.has(v)) {
        issue(path, `"${v}" is reserved and cannot be used as ${what.toLowerCase()}.`);
        return false;
      }
      return true;
    },
  };
}
