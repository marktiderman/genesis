// A link's picker (docs/RESOURCE-VIEW.md, "Links in forms"): which linked rows it lists. Pure, no
// React: web's RelationField and native's link picker both send what `filters` returns through
// the provider, so row-level security still decides what the viewer can pick.

import type { FilterParam } from "../provider/types";
import type { FieldReference } from "../schema/types";
import type { ResourceScope } from "../hooks/viewer-scope";
import { isDevelopment, reportError } from "../errors";
import { ViewDefinitionError } from "./errors";
import { scopeFilter } from "./scope";
import type { LinkFilter, LinkedView, ResolvedLink, ViewLink } from "./types";

// A field name only goes into a request's `sort`, so nothing else rides along in it.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A screen's or a picker's filter as provider filters: a single value is `eq`, `null` is
 * `is_null` and a list is `in`.
 */
export function filterParams(filter: LinkFilter | null | undefined): FilterParam[] {
  return Object.entries(filter ?? {}).map(([field, value]): FilterParam =>
    value === null
      ? { field, operator: "is_null" }
      : Array.isArray(value)
        ? { field, operator: "in", value: [...(value as readonly (string | number)[])] }
        : { field, operator: "eq", value: value as string | number | boolean },
  );
}

/** Problems with a `link` as written, for defineView to report with the rest. */
export function linkProblems(name: string, link: unknown, reference: FieldReference | undefined): string[] {
  if (link === undefined) return [];
  const where = `fields.${name}.link`;
  if (!reference) return [`${where} is set, but "${name}" isn't a link`];
  if (!link || typeof link !== "object" || Array.isArray(link)) return [`${where} isn't an object`];
  const l = link as ViewLink;
  const problems: string[] = [];
  if (l.view !== undefined && typeof l.view !== "function") problems.push(...linkedViewProblems(where, l.view, reference, l.preset));
  else if (l.view === undefined && l.preset !== undefined) problems.push(`${where}.preset needs a view`);
  if (l.preset !== undefined && typeof l.preset !== "string") problems.push(`${where}.preset isn't a preset name`);
  if (l.filter !== undefined && typeof l.filter !== "function" && (!l.filter || typeof l.filter !== "object" || Array.isArray(l.filter))) {
    problems.push(`${where}.filter isn't a filter or a function`);
  }
  if (
    l.searchFields !== undefined &&
    (!Array.isArray(l.searchFields) || l.searchFields.some((f) => typeof f !== "string" || !IDENTIFIER.test(f)))
  ) {
    problems.push(`${where}.searchFields isn't a list of field names`);
  }
  if (l.orderBy === "view") {
    if (l.view === undefined) problems.push(`${where}.orderBy "view" needs a view`);
  } else if (l.orderBy !== undefined) {
    const o = l.orderBy as { field?: unknown; direction?: unknown } | null;
    if (!o || typeof o !== "object" || typeof o.field !== "string" || !IDENTIFIER.test(o.field)) {
      problems.push(`${where}.orderBy isn't "view" or { field, direction }`);
    } else if (o.direction !== undefined && o.direction !== "asc" && o.direction !== "desc") {
      problems.push(`${where}.orderBy.direction is "asc" or "desc", not ${String(o.direction)}`);
    }
  }
  return problems;
}

function linkedViewProblems(where: string, view: unknown, reference: FieldReference, preset: string | undefined): string[] {
  const v = view as LinkedView | null;
  if (!v || typeof v !== "object" || typeof v.resource !== "string") return [`${where}.view isn't a view`];
  // A view of another resource would list rows the link can't hold.
  if (v.resource !== reference.resource) return [`${where}.view is a view of "${v.resource}", but the link points at "${reference.resource}"`];
  if (preset !== undefined && !Object.hasOwn(v.definition.presets ?? {}, preset)) {
    return [`${where}.preset "${preset}" isn't one of ${v.resource}'s presets`];
  }
  return [];
}

/**
 * The resolved picker for a link: `owner` is the view's resource (for errors), `labelField` the
 * view field's own. A `view` given as a function is read, and checked, on the first `filters`.
 */
export function resolveLink(
  owner: string,
  name: string,
  reference: FieldReference,
  link: ViewLink | undefined,
  labelField: string | undefined,
): ResolvedLink {
  let linked: LinkedView | undefined;
  let read = false;
  const linkedView = (): LinkedView | undefined => {
    if (read) return linked;
    read = true;
    linked = typeof link?.view === "function" ? link.view() : link?.view;
    if (linked && typeof link?.view === "function") {
      const problems = linkedViewProblems(`fields.${name}.link`, linked, reference, link.preset);
      if (problems.length) {
        const error = new ViewDefinitionError(owner, problems);
        // Read while a form renders: in development the mistake fails loudly; in production the
        // form still opens, its picker listing the linked resource under row-level security only.
        if (isDevelopment()) throw error;
        reportError(error, { source: "core:resource-view-link", tags: { resource: owner } });
        linked = undefined;
      }
    }
    return linked;
  };
  // No `link.view`: Genesis keeps no registry of views or tenant columns by resource, so nothing
  // here can add the linked resource's scope. The data provider's row-level security narrows the
  // list, and the server must refuse a cross-tenant link (docs/RESOURCE-VIEW.md, "Links in forms").
  return Object.freeze({
    resource: reference.resource,
    field: reference.field,
    // Read when asked: a view given as a function may not exist yet while this one is defined.
    get labelField() {
      return labelField ?? linkedView()?.labelField;
    },
    ...(link?.searchFields ? { searchFields: Object.freeze([...link.searchFields]) } : {}),
    // Read when asked, like the naming field: `"view"` reads a view given as a function.
    get orderBy() {
      const order = link?.orderBy === "view" ? linkedView()?.definition.orderBy : link?.orderBy;
      if (!order || typeof order.field !== "string" || !IDENTIFIER.test(order.field)) return undefined;
      return Object.freeze({ field: order.field, direction: order.direction === "desc" ? ("desc" as const) : ("asc" as const) });
    },
    filters(scope?: ResourceScope | null, values: Readonly<Record<string, unknown>> = {}): FilterParam[] {
      const view = linkedView();
      const preset = view ? view.definition.presets?.[link?.preset ?? "default"]?.filter : undefined;
      const own = typeof link?.filter === "function" ? link.filter(values) : link?.filter;
      // The linked view's own list rules first, then the link's: a later field wins.
      return filterParams({ ...(view ? scopeFilter(view, scope) : {}), ...(preset as LinkFilter | undefined), ...own });
    },
  });
}
