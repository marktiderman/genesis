/**
 * Version numbers: the store version an app reports (`1.4.0`, `1.10`) and
 * the minimum a policy sets. Only plain dotted numbers count (one to four
 * parts, as App Store Connect and Play accept). Anything else (`1.2-beta`,
 * `latest`, an empty string, a number too large to compare exactly) does not
 * parse, and a comparison with it has no answer (`null`), so a malformed
 * minimum can never block anyone.
 */

const VERSION = /^\d+(?:\.\d+){0,3}$/;

/** `"1.10"` → `[1, 10, 0, 0]`; `null` when it isn't a plain dotted version. */
export function parseVersion(value: unknown): number[] | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!VERSION.test(text)) return null;
  const parts = text.split(".").map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  while (parts.length < 4) parts.push(0);
  return parts;
}

/** -1, 0 or 1 as `a` is older than, the same as or newer than `b`; `null` when either doesn't parse. */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 4; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

/** True only when both parse and `installed` is older than `minimum`. Fails open. */
export function isBelowMinimum(installed: unknown, minimum: unknown): boolean {
  return compareVersions(installed, minimum) === -1;
}
