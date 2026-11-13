// A view's form as ResourceForm's fields (docs/RESOURCE-VIEW.md, "Screen"): built once here for
// ResourceView's own form and for a standalone `<ResourceForm view={…}>`, so the two can't drift.
// Only fields a writer may send; links are pickers over the linked rows; what the screen's
// `filter` and `defaults` fix starts the form (or fills it hidden).

import { useMemo } from "react";
import { fieldControl, useViewer, type FilterParam, type ResourceContract } from "@marktiderman/genesis-core";
import type { ResourceScope } from "@marktiderman/genesis-core/hooks";
import { scopeFilter, type DisplayHint, type ResolvedFormField, type ResourceView as View } from "@marktiderman/genesis-core/resource-view";
import type { FieldType, ResourceFormFieldDef } from "../ResourceFormField";
import type { Filter } from "./view-list";

type Scalar = string | number | boolean | null;
type Defaults = Readonly<Record<string, Scalar>>;

const FORM_TYPE: Partial<Record<DisplayHint, FieldType>> = {
  longText: "textarea",
  json: "textarea",
  number: "number",
  currency: "number",
  percent: "number",
  boolean: "checkbox",
  badge: "select",
  date: "date",
  url: "url",
  image: "url",
  email: "email",
};

// A phone number has no display hint of its own (it shows as text), so the form reads the
// contract's declared `control: "tel"` (or its older `widget`). Never guessed from the column's name. RecordView's inline
// fields use it too.
export function formType(f: ResolvedFormField, hasOptions: boolean): FieldType {
  if (hasOptions) return "select";
  if (fieldControl(f.field) === "tel" && f.display === "text") return "tel";
  return FORM_TYPE[f.display] ?? "text";
}

function formField(
  f: ResolvedFormField,
  editable: boolean,
  scope: ResourceScope | null | undefined,
  /** A list the screen's filter holds this link to (`{ owner_id: ["a", "b"] }`): the picker offers only those. */
  within?: readonly (string | number)[],
): ResourceFormFieldDef {
  const options = f.options?.map((o) => ({ value: o.value, label: o.label }));
  const link = f.link;
  const held: FilterParam[] = link && within ? [{ field: link.field, operator: "in", value: [...within] }] : [];
  const order = link?.orderBy;
  return {
    key: f.field.name,
    label: f.label,
    type: link && !options ? "relation" : formType(f, Boolean(options)),
    // A link is a picker over the linked rows (through the provider, under the linked view's
    // scope and default filter), never a typed id.
    ...(link && !options
      ? {
          relation: {
            resource: link.resource,
            valueField: link.field,
            ...(link.labelField ? { labelField: link.labelField } : {}),
            ...(link.searchFields ? { searchFields: [...link.searchFields] } : {}),
            ...(order ? { orderBy: { field: order.field, direction: order.direction, ...(order.nulls ? { nulls: order.nulls } : {}) } } : {}),
            keys: "row" as const,
            filters: (values: Readonly<Record<string, unknown>>) => [...link.filters(scope, values), ...held],
            ...(f.missingLabel ? { missingLabel: f.missingLabel } : {}),
          },
        }
      : {}),
    required: f.required,
    // What an input left empty sends: nothing on a create (the column's default applies), null on an edit.
    ...(f.field.nullable !== undefined ? { nullable: f.field.nullable } : {}),
    ...(f.field.hasDefault || f.field.generated ? { hasDefault: true } : {}),
    ...(options ? { options } : {}),
    ...(f.max !== undefined ? { maxLength: f.max } : {}),
    ...(f.autoComplete ? { autoComplete: f.autoComplete } : {}),
    ...(f.inputMode ? { inputMode: f.inputMode } : {}),
    ...(f.enterKeyHint ? { enterKeyHint: f.enterKeyHint } : {}),
    ...(f.sectionTitle ? { group: f.sectionTitle } : {}),
    ...(f.visible ? { visible: f.visible } : {}),
    ...(editable ? {} : { readOnlyOnEdit: true }),
  };
}

/** The single values of a filter: what a new row made from the list starts with. */
export function singleValues(filter: Filter): Defaults {
  return Object.fromEntries(Object.entries(filter).filter(([, value]) => !Array.isArray(value))) as Defaults;
}

/** What a form over a view starts from, besides the view. */
export interface ViewFormOptions {
  /**
   * The list's filter (`{ client_id: id }`): a single value starts a new row (a field the form
   * doesn't show is filled hidden, and a link it pins stays out of the form), and a list holds a
   * link's picker to those rows.
   */
  filter?: Filter | undefined;
  /** Values a new row starts with, sent on create only. The filter wins a clash. */
  defaults?: Defaults | undefined;
  /**
   * Whether a new row takes the viewer's scope (default true): inside a `ViewerScope`, the view's
   * `scope` keys start it (filled hidden), as a list over the view would. `filter` wins a clash.
   */
  scoped?: boolean | undefined;
}

/**
 * The fields of a view's form, as ResourceForm takes them: what `<ResourceView>` builds its own
 * form from. The viewer's scope narrows link pickers. Call it for a form of your own layout, or
 * pass the view to `<ResourceForm view={…}>`, which calls it. Without a view, no fields.
 *
 * @stability Beta
 */
export function useViewFormFields(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract and row
  view: View<ResourceContract<any>, any> | undefined,
  options: ViewFormOptions = {},
): ResourceFormFieldDef[] {
  const viewer = useViewer();
  const { scoped = true } = options;
  // The viewer's scope first, then the screen's filter over it: a list's own order.
  const filter: Filter = scoped && view ? { ...scopeFilter(view, viewer.scope), ...options.filter } : (options.filter ?? {});
  // By value, so an inline `filter={{ client_id }}` doesn't rebuild the form every render.
  const filterKey = JSON.stringify(filter);
  const defaultsKey = JSON.stringify(options.defaults ?? {});
  const scopeKey = JSON.stringify(viewer.scope ?? null);
  return useMemo(() => {
    // No view (a ResourceForm given `fields`): nothing to build.
    if (!view) return [];
    // The form lists only fields a writer may send. A field that can't change after create is
    // shown read-only when editing.
    const editable = new Set(view.writable("edit"));
    const writable = new Set(view.writable("create"));
    // What a new row starts with: the defaults, then the filter over them, so a new row stays in
    // the list it was made from.
    const screenFilter = JSON.parse(filterKey) as Filter;
    const pinned = singleValues(screenFilter);
    // A link the filter holds to a list (`in`) picks only among the list's rows, so a save never
    // moves the row out of this list.
    const lists = new Map(
      Object.entries(screenFilter ?? {}).filter((e): e is [string, readonly (string | number)[]] => Array.isArray(e[1])),
    );
    const starts: Defaults = { ...(JSON.parse(defaultsKey) as Defaults), ...pinned };
    const scope = JSON.parse(scopeKey) as ResourceScope | null;
    const shown = view
      .form("create")
      // JSON and lists need editors of their own; the plain form would send them back as text.
      .filter((f) => writable.has(f.field.name) && f.display !== "json" && !f.field.array)
      // A link the list's filter pins (a client's sessions, a record's list section) is the list's
      // own: filled hidden below, never a picker that would move the row out of this list.
      .filter((f) => !(f.link && Object.hasOwn(pinned, f.field.name)))
      .map((f) => {
        const def = formField(f, editable.has(f.field.name), scope, lists.get(f.field.name));
        // A value the filter fixes is the list's: the page's URL never replaces it.
        const fixed = Object.hasOwn(pinned, def.key) ? { fromUrl: false } : {};
        return Object.hasOwn(starts, def.key) ? { ...def, ...fixed, defaultValue: starts[def.key] } : def;
      });
    // They fill the fields the form doesn't show too (the client a session belongs to): hidden,
    // and never sent on edit.
    const keys = new Set(shown.map((f) => f.key));
    const filled = Object.entries(starts)
      .filter(([key]) => !keys.has(key) && view.field(key))
      .map(([key, value]): ResourceFormFieldDef => ({ key, type: "hidden", hidden: true, readOnlyOnEdit: true, defaultValue: value }));
    return [...shown, ...filled];
  }, [view, filterKey, defaultsKey, scopeKey]);
}
