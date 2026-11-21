/**
 * Reading values by full key from what a support function takes as `settings` (`resolveSettings`'
 * result, or the values alone). Internal: not exported from the package.
 */
import type { ResolvedSettings } from "@marktiderman/genesis-config/settings";

/** What a support function takes as `settings`. */
type SettingsInput = Pick<ResolvedSettings, "values"> | { readonly [key: string]: unknown };

/** The value at `key`, only when it is the object's own. */
export function own(values: { readonly [key: string]: unknown }, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}

/** The values by full key. */
export function valuesOf(input: SettingsInput | null | undefined): { readonly [key: string]: unknown } {
  if (!input) return {};
  // A ResolvedSettings (or `{ values }`): no full key is ever called `values` (keys are `namespace.key`).
  const maybe = own(input as { readonly [key: string]: unknown }, "values");
  if (typeof maybe === "object" && maybe !== null && !Array.isArray(maybe)) return maybe as { readonly [key: string]: unknown };
  return input as { readonly [key: string]: unknown };
}
