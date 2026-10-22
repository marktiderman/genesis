/** Typing hidden inputs. Shared by the engine and the server, so both type them identically. */
import { isPlainObject } from "./events";
import type { FormDefinition, HiddenInput, Json } from "./types";

/** Longest string a hidden input accepts. Longer values are dropped. */
export const MAX_HIDDEN_STRING_LENGTH = 1000;

/** A plain decimal: an optional `-`, digits, and an optional fraction. */
const DECIMAL = /^-?\d+(\.\d+)?$/;

export interface CoerceHiddenOptions {
  /** Coerce only inputs with these sources; the rest are reported in `ignored`. Default: all. */
  sources?: readonly HiddenInput["source"][];
}

export interface CoercedHidden {
  /** Declared inputs, typed. */
  values: Record<string, Json>;
  /** Names dropped: undeclared, from another source, or not convertible to the declared type. */
  ignored: string[];
}

/**
 * Convert one raw value to a hidden input's declared type, or `undefined` when
 * it cannot be. Only string, number and boolean primitives are accepted.
 * - `string`: a string (at most 1000 characters), or a number or boolean as text.
 * - `number`: a finite number, or a plain decimal string such as `"12"`, `"-3"`
 *   or `"2.5"`. No spaces, hex, exponents or `""`.
 * - `boolean`: `true`/`false`, or the strings `"true"`/`"false"`.
 */
export function coerceHiddenValue(value: unknown, type: HiddenInput["type"]): Json | undefined {
  if (typeof value === "string" && value.length > MAX_HIDDEN_STRING_LENGTH) return undefined;
  if (type === "string") {
    if (typeof value === "string") return value;
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return String(value);
    return undefined;
  }
  if (type === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value !== "string" || !DECIMAL.test(value)) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/**
 * Type raw hidden inputs (from a query string, the host app or the server)
 * by the definition's declarations. `undefined` values are skipped silently.
 */
export function coerceHidden(
  definition: FormDefinition,
  raw: Record<string, unknown> | undefined,
  options: CoerceHiddenOptions = {},
): CoercedHidden {
  const declared = new Map((definition.hidden ?? []).map((h) => [h.name, h]));
  const values: Record<string, Json> = {};
  const ignored: string[] = [];
  if (!isPlainObject(raw)) return { values, ignored };
  for (const name of Object.keys(raw)) {
    const value = raw[name];
    if (value === undefined) continue;
    const spec = declared.get(name);
    if (!spec || (options.sources && !options.sources.includes(spec.source))) {
      ignored.push(name);
      continue;
    }
    const coerced = coerceHiddenValue(value, spec.type);
    if (coerced === undefined) ignored.push(name);
    else Object.defineProperty(values, name, { value: coerced, enumerable: true, writable: true, configurable: true });
  }
  return { values, ignored };
}
