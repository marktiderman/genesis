// scopeValues: a view's scope keys, read from ViewerScope's `scope`, as a screen's `filter`.

import type { ResourceScope } from "../hooks/viewer-scope";
import { ViewDefinitionError } from "./define-view";
import type { ResourceView } from "./types";

type ScopeValue = string | number | boolean | null;

const camel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * The view's declared scope keys with their values from the viewer's scope, ready to pass as a
 * screen's `filter`: `scope: ["practice_id"]` reads `scope.practice_id`, then `scope.practiceId`.
 *
 * ```tsx
 * <ResourceView view={brandsView} filter={scopeValues(brandsView, useViewerScope().scope)} />
 * ```
 *
 * In development a declared key with no single value (missing, `undefined`, or a list) throws
 * {@link ViewDefinitionError}, so a screen mounted outside its scope fails loudly. In production
 * it is left out; row-level security still decides what the viewer reads.
 */
export function scopeValues(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  view: Pick<ResourceView<any, any>, "resource" | "definition">,
  scope: ResourceScope | null | undefined,
): Readonly<Record<string, ScopeValue>> {
  const out: Record<string, ScopeValue> = {};
  const missing: string[] = [];
  for (const key of (view.definition.scope ?? []) as readonly string[]) {
    const value = scope && Object.hasOwn(scope, key) ? scope[key] : scope?.[camel(key)];
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
    else missing.push(key);
  }
  if (missing.length && process.env.NODE_ENV !== "production") {
    throw new ViewDefinitionError(
      view.resource,
      missing.map((key) => `scope "${key}" has no single value in ViewerScope's scope`),
    );
  }
  return Object.freeze(out);
}
