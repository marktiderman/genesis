// ResourceView: one line for a list screen (docs/RESOURCE-VIEW.md). It maps a view from
// genesis-core/resource-view onto ResourcePage, so it is not a second list page: paging, search,
// the peek, the form, delete, saved views and slots are all ResourcePage's. Every ResourcePage
// prop still works as an escape hatch, and the screen's own props win over the view.

import { useMemo, type ReactNode } from "react";
import type { DataRow, FilterParam, ResourceContract } from "@marktiderman/genesis-core";
import type { DisplayHint, ResourceView as View, ResolvedFormField } from "@marktiderman/genesis-core/resource-view";
import { ResourcePage, type ResourceAction, type ResourcePageProps } from "../ResourcePage";
import type { ResourceFormFieldDef, FieldType } from "../ResourceFormField";
import { useResourceTable, type ResourceTableState } from "../use-resource-table";
import { useDisplayCell } from "./display";

type Row = Record<string, unknown>;
type Filter = Readonly<Record<string, string | number | boolean | null>>;

/** What a screen sets. Anything else ResourcePage takes passes straight through. */
export interface ResourceViewOptions {
  /** `page` (default), `embedded` inside a page or tab, or `compact` for a narrow side panel. */
  layout?: "page" | "embedded" | "compact";
  /** A column preset the view defines (`"compact"`). Default: the preset's own, then `default`. */
  columns?: string;
  /** A tab the view defines: its columns and its filter. */
  preset?: string;
  /** Equality filters sent to the server (`{ client_id: id }`); `null` means "is empty". */
  filter?: Filter;
  /** How rows show first. The user's own pick is remembered. */
  mode?: "table" | "grid" | "list";
  title?: string;
  subtitle?: string;
}

export type ResourceViewProps<T extends Row = Row> = ResourceViewOptions &
  Omit<Partial<ResourcePageProps<T>>, "resource" | "columns" | "variant" | "title" | "subtitle"> & {
    /**
     * Draw some cells this screen's own way, by column key (an avatar beside a name). The step
     * before a slot: the column, its label, sorting and visibility stay the view's.
     */
    cells?: Partial<Record<string, (row: T) => ReactNode>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
    view: View<ResourceContract<any>, T & DataRow>;
  };

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

function formField(f: ResolvedFormField, editable: boolean): ResourceFormFieldDef {
  const options = f.field.enumValues?.map((value) => ({ value, label: value }));
  return {
    key: f.field.name,
    label: f.label,
    type: options ? "select" : (FORM_TYPE[f.display] ?? "text"),
    required: f.required,
    ...(options ? { options } : {}),
    ...(f.max !== undefined ? { maxLength: f.max } : {}),
    ...(f.sectionTitle ? { group: f.sectionTitle } : {}),
    ...(f.visible ? { visible: f.visible } : {}),
    ...(editable ? {} : { readOnlyOnEdit: true }),
  };
}

function filterParams(filter: Filter | undefined): FilterParam[] {
  return Object.entries(filter ?? {}).map(([field, value]) =>
    value === null ? { field, operator: "is_null" as const } : { field, operator: "eq" as const, value },
  );
}

/**
 * The ResourcePage props a view and a screen's options make. `useResourceView` and
 * `<ResourceView>` both use it; call it yourself to hand the props to your own layout.
 */
export function useResourceViewProps<T extends Row>(props: ResourceViewProps<T>): ResourcePageProps<T> {
  const { view, layout = "page", columns: columnPreset, preset, filter, mode, title, subtitle, can, resourceOptions, cells, ...rest } = props;
  const cell = useDisplayCell();
  const tab = preset ? view.definition.presets?.[preset] : undefined;
  if (preset && !tab) {
    throw new Error(`ResourceView(${view.resource}): no preset "${preset}"`);
  }
  const presetName = columnPreset ?? tab?.columns ?? "default";

  const columns = useMemo(
    () =>
      view.columns(presetName).map((c) => ({
        key: c.key,
        header: c.label,
        // A computed column has no database column to sort by.
        ...(c.field ? {} : { sortable: false, accessor: (row: T) => c.value(row as T & DataRow) }),
        render: (row: T) => (cells?.[c.key] ? cells[c.key]!(row) : cell(c as never, row)),
      })),
    [view, presetName, cell, cells],
  );

  // The peek shows the view's full column list, drawn like the cells (so `when` hides there too),
  // never every key of the row: sensitive values and columns the view leaves out stay out.
  const detailFields = useMemo(
    () =>
      view.columns().map((c) => ({
        key: c.key,
        label: c.label,
        render: (_value: unknown, row: T) => (cells?.[c.key] ? cells[c.key]!(row) : cell(c as never, row)),
      })),
    [view, cell, cells],
  );

  // By value, so an inline `filter={{ client_id }}` doesn't rebuild the form every render.
  const filterKey = JSON.stringify(filter ?? {});

  // The form lists only fields a writer may send. A field that can't change after create is
  // shown read-only when editing.
  const formFields = useMemo(() => {
    const editable = new Set(view.writable("edit"));
    const writable = new Set(view.writable("create"));
    const shown = view
      .form("create")
      // JSON and lists need editors of their own; the plain form would send them back as text.
      .filter((f) => writable.has(f.field.name) && f.display !== "json" && !f.field.array)
      .map((f) => formField(f, editable.has(f.field.name)));
    // The screen's filter fills those fields on create (the client a session belongs to). Hidden,
    // and never sent on edit, where only changed fields go.
    const keys = new Set(shown.map((f) => f.key));
    const filled = Object.entries(JSON.parse(filterKey) as Filter)
      .filter(([key]) => !keys.has(key) && view.field(key))
      .map(([key, value]): ResourceFormFieldDef => ({ key, type: "hidden", hidden: true, defaultValue: value }));
    return [...shown, ...filled];
  }, [view, filterKey]);

  const defaultFilters = useMemo(
    () => [...filterParams(tab?.filter as Filter | undefined), ...filterParams(filter), ...(resourceOptions?.defaultFilters ?? [])],
    [tab, filter, resourceOptions?.defaultFilters],
  );

  // Guards only narrow: the view's rule AND the screen's own `can`.
  const allows = useMemo(
    () => (action: ResourceAction, item?: T) => {
      if (can && !can(action, item)) return false;
      if (action === "create") return view.can("create") === true;
      if (!item) return true;
      return view.can(action === "edit" ? "update" : "delete", item as T & DataRow) === true;
    },
    [view, can],
  );

  const orderBy = view.definition.orderBy;
  const copy = view.definition.copy;
  const searchFields = rest.searchFields ?? (view.labelField ? [view.labelField] : undefined);
  return {
    resource: view.resource,
    title: title ?? view.title,
    ...((subtitle ?? copy?.subtitle) ? { subtitle: subtitle ?? copy?.subtitle } : {}),
    columns,
    variant: layout === "page" ? "page" : "embedded",
    ...(mode ? { defaultView: mode } : layout === "compact" ? { defaultView: "list" as const } : {}),
    ...(view.labelField ? { titleField: view.labelField } : {}),
    getTitle: (row: T) => view.summary(row as T & DataRow).title,
    // Never ResourcePage's default (the second column's raw value, which skips `when`).
    getSubtitle: (row: T) => view.summary(row as T & DataRow).subtitle,
    detailFields,
    // Server paging by default: a list never loads a whole table to search it in the browser.
    pagination: "server",
    formFields,
    allowCreate: formFields.length > 0,
    allowEdit: formFields.length > 0,
    allowDelete: true,
    can: allows,
    ...(copy?.create ? { createLabel: copy.create } : {}),
    ...(copy?.empty?.title ? { emptyMessage: copy.empty.title } : {}),
    ...(copy?.empty?.body ? { emptyDescription: copy.empty.body } : {}),
    ...(searchFields ? { searchFields } : {}),
    ...rest,
    resourceOptions: {
      ...resourceOptions,
      ...(defaultFilters.length ? { defaultFilters } : {}),
      ...(orderBy && !resourceOptions?.defaultSort
        ? { defaultSort: { field: orderBy.field, order: orderBy.direction ?? "asc" } }
        : {}),
    },
  } as ResourcePageProps<T>;
}

/**
 * A list screen from a view, in one line:
 *
 * ```tsx
 * <ResourceView view={brandsView} />
 * <ResourceView view={sessionsView} layout="embedded" filter={{ client_id: id }} columns="compact" />
 * ```
 *
 * Customise in steps: a screen setting, then the view (every screen gets it), then a slot
 * (`slots`, `renderDetail`, `toolbar`), then `useResourceView` with your own layout.
 */
export function ResourceView<T extends Row = Row>(props: ResourceViewProps<T>) {
  return <ResourcePage<T> {...useResourceViewProps(props)} />;
}

/** The headless form: the same state as `useResourceTable`, from a view. */
export function useResourceView<T extends Row = Row>(props: ResourceViewProps<T>): ResourceTableState<T> {
  return useResourceTable<T>(useResourceViewProps(props));
}
