// ResourceView: one line for a list screen (docs/RESOURCE-VIEW.md). It maps a view from
// genesis-core/resource-view onto ResourcePage, so it is not a second list page: paging, search,
// the peek, the form, delete, saved views and slots are all ResourcePage's. Every ResourcePage
// prop still works as an escape hatch, and the screen's own props win over the view.

import { useMemo, type ReactNode } from "react";
import { useViewer, type DataRow, type ResourceContract } from "@marktiderman/genesis-core";
import { plural, rowPicture, type ResourceView as View } from "@marktiderman/genesis-core/resource-view";
import { ResourcePage, type ResourceAction, type ResourcePageProps } from "../ResourcePage";
import { useResourceTable, type ResourceTableState } from "../use-resource-table";
import { useDisplayCell } from "./display";
import { useResourceViewDefaults } from "./defaults";
import type { ViewModeDefault } from "../../../hooks/use-view-preference";
import { ResourceCalendar, type ResourceCalendarOptions } from "./ResourceCalendar";
import { RowAvatar } from "./RowAvatar";
import { useViewDetailFields, useViewListParams, type Filter } from "./view-list";
import { useViewFormFields } from "./view-form";

type Row = Record<string, unknown>;
type Scalar = string | number | boolean | null;
type Defaults = Readonly<Record<string, Scalar>>;

/** What a screen sets. Anything else ResourcePage takes passes straight through. */
export interface ResourceViewOptions {
  /** `page` (default), `embedded` inside a page or tab, or `compact` for a narrow side panel. */
  layout?: "page" | "embedded" | "compact";
  /** A column preset the view defines (`"compact"`). Default: the preset's own, then `default`. */
  columns?: string | undefined;
  /** A tab the view defines: its columns and its filter. */
  preset?: string;
  /**
   * Filters sent to the server (`{ client_id: id }`); `null` means "is empty" and a list means
   * "any of" (`{ status: ["open", "blocked"] }`). A new row gets the single values too, never a list.
   */
  filter?: Filter;
  /**
   * Whether the list follows the viewer's scope (default true): inside a `ViewerScope` or
   * `WorkspaceScope`, the view's `scope` keys filter the list and start new rows, with no screen
   * code. The screen's own `filter` wins over a scope key it also sets. `false` for a list that
   * deliberately looks past the scope.
   */
  scoped?: boolean;
  /**
   * Values a new row starts with (`{ author_scope: viewer.scope }`), sent on create only. Unlike
   * `filter`, they don't narrow the list. A field the form shows starts at the value instead.
   */
  defaults?: Defaults;
  /**
   * How rows show first. The user's own pick is remembered. `{ mobile: "grid", desktop: "table" }`
   * picks per screen size (cards on a phone); without a mode, an app-wide
   * `ResourceViewDefaultsProvider phoneMode` does the same for every `layout="page"` list. `calendar` places the
   * rows by the view's `calendar` block instead: one request per visible window, a click opens the
   * peek. Calendar is never stored as the user's pick, so other lists of the resource don't open
   * in it, and no phone default turns into it.
   */
  mode?: ViewModeDefault | "calendar" | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
}

export type ResourceViewProps<T extends Row = Row> = ResourceViewOptions &
  Omit<Partial<ResourcePageProps<T>>, "resource" | "columns" | "variant" | "title" | "subtitle"> & {
    /**
     * Draw some cells this screen's own way, by column key (an avatar beside a name). The step
     * before a slot: the column, its label, sorting and visibility stay the view's.
     */
    cells?: Partial<Record<string, (row: T) => ReactNode>>;
    /**
     * With `mode="calendar"`: overrides the view's `calendar` block (layout, weeks, the anchor) and
     * adds what it can't hold (dot colours, `onSelect`, lanes' labels).
     */
    calendar?: ResourceCalendarOptions<T>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
    view: View<ResourceContract<any>, T & DataRow>;
  };

// Moved to view-form.ts, which `<ResourceForm view>` shares; still exported from here.
export { formType } from "./view-form";

/** A column's width (px) by what it shows, for `sizeColumns`. */
const COLUMN_WIDTH: Partial<Record<string, number>> = {
  badge: 130,
  number: 96,
  currency: 110,
  percent: 90,
  boolean: 80,
  date: 120,
  datetime: 150,
  url: 160,
  email: 200,
};

/**
 * `sizeColumns`: the record's name column (the view's labelField, else the first) takes the spare
 * width; the others get a width for what they hold, so a title isn't cut short beside an equal
 * share for an id or a badge. When the label field isn't a column, the text columns share the
 * rest and only badges, numbers and dates are sized. Two columns or fewer are left alone.
 */
function columnWidth(c: { key: string; display: string }, index: number, all: readonly { key: string }[], labelField: string | undefined): number | undefined {
  if (all.length < 3) return undefined;
  const named = all.some((x) => x.key === labelField);
  const grows = named ? c.key === labelField : labelField ? false : index === 0;
  if (grows) return undefined;
  const fixed = COLUMN_WIDTH[c.display];
  return named || !labelField ? (fixed ?? 140) : fixed;
}

/**
 * The ResourcePage props a view and a screen's options make. `useResourceView` and
 * `<ResourceView>` both use it; call it yourself to hand the props to your own layout.
 */
export function useResourceViewProps<T extends Row>(props: ResourceViewProps<T>): ResourcePageProps<T> {
  const {
    // preset, filter and scoped are read by useViewListParams; taken out here so they aren't passed on.
    view, layout = "page", columns: columnPreset, preset: _preset, filter: _filter, scoped: _scoped, defaults, mode, title, subtitle, can, resourceOptions, cells, tree: screenTree,
    calendar: _calendar,
    noun: screenNoun, nounPlural: screenNounPlural, formTitles: screenFormTitles, countFormat: screenCountFormat,
    ...rest
  } = props;
  const cell = useDisplayCell();
  const viewer = useViewer();
  const listDefaults = useResourceViewDefaults();
  const { filter, filters: defaultFilters, tab } = useViewListParams(props);
  const presetName = columnPreset ?? tab?.columns ?? "default";

  const columns = useMemo(
    () =>
      view.columns(presetName).map((c, index, all) => {
        const draw = (row: T) => (cells?.[c.key] ? cells[c.key]!(row) : cell(c as never, row));
        const width = listDefaults.sizeColumns ? columnWidth(c, index, all, view.labelField) : undefined;
        return {
          key: c.key,
          header: c.label,
          ...(width ? { width } : {}),
          // A computed column has no database column to sort by.
          ...(c.field ? {} : { sortable: false, accessor: (row: T) => c.value(row as T & DataRow) }),
          // The summary's picture sits beside the first column.
          render:
            index === 0
              ? (row: T) => {
                  const picture = rowPicture(view.summary(row as T & DataRow));
                  return picture ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <RowAvatar picture={picture} />
                      <span className="min-w-0 truncate">{draw(row)}</span>
                    </span>
                  ) : (
                    draw(row)
                  );
                }
              : draw,
        };
      }),
    [view, presetName, cell, cells, listDefaults.sizeColumns],
  );

  // The peek: sensitive values and columns the view leaves out stay out.
  const detailFields = useViewDetailFields(view, cells);

  // The form: the same builder `<ResourceForm view>` uses. `filter` already holds the scope.
  const formFields = useViewFormFields(view, { filter, defaults, scoped: false });

  // Guards only narrow: the view's rule AND the screen's own `can`. They read the viewer, so a
  // new viewer or new roles asks them again.
  const allows = useMemo(
    () => (action: ResourceAction, item?: T) => {
      if (can && !can(action, item)) return false;
      if (action === "create") return view.can("create", viewer) === true;
      if (!item) return true;
      return view.can(action === "edit" ? "update" : "delete", item as T & DataRow, viewer) === true;
    },
    [view, can, viewer],
  );

  const orderBy = view.definition.orderBy;
  const copy = view.definition.copy;
  // The form's words, each from the screen's `formTitles` over the view's `copy.form`.
  const formWords = {
    create: screenFormTitles?.create ?? copy?.form?.createTitle,
    edit: screenFormTitles?.edit ?? copy?.form?.editTitle,
    createSubmit: screenFormTitles?.createSubmit ?? copy?.form?.createSubmit,
    editSubmit: screenFormTitles?.editSubmit ?? copy?.form?.editSubmit,
    createDescription: screenFormTitles?.createDescription ?? copy?.form?.createDescription,
    editDescription: screenFormTitles?.editDescription ?? copy?.form?.editDescription,
  };
  const givenWords = Object.fromEntries(Object.entries(formWords).filter(([, words]) => !!words));
  const formTitles = Object.keys(givenWords).length ? (givenWords as NonNullable<ResourcePageProps<T>["formTitles"]>) : undefined;
  // Tree mode (`tree`) needs every row: a page of a tree would cut parents from their children,
  // and a server-side search would drop the ancestors that give a match its place.
  if (screenTree && rest.pagination !== undefined && rest.pagination !== "client") {
    throw new Error(
      `ResourceView(${view.resource}): tree needs every row on the client; pagination="${rest.pagination}" can't page a tree. Leave pagination unset.`,
    );
  }
  const searchFields = rest.searchFields ?? (view.labelField ? [view.labelField] : undefined);
  return {
    resource: view.resource,
    title: title ?? view.title,
    ...((subtitle ?? copy?.subtitle) ? { subtitle: subtitle ?? copy?.subtitle } : {}),
    columns,
    variant: layout === "page" ? "page" : "embedded",
    // The screen's mode first, then a compact list's rows, then the app's phone default. A
    // screen's own `defaultView` (in `rest`) still overrides all three. The phone default is a
    // full page's only: an embedded list hides the view switch, so cards there would have no
    // way back to the table.
    ...(mode && mode !== "calendar"
      ? { defaultView: mode }
      : layout === "compact"
        ? { defaultView: "list" as const }
        : layout === "page" && listDefaults.phoneMode
          ? { defaultView: { mobile: listDefaults.phoneMode, desktop: "table" as const } }
          : {}),
    ...(view.labelField ? { titleField: view.labelField } : {}),
    getTitle: (row: T) => view.summary(row as T & DataRow).title,
    // Never ResourcePage's default (the second column's raw value, which skips `when`).
    getSubtitle: (row: T) => view.summary(row as T & DataRow).subtitle,
    detailFields,
    // Server paging by default: a list never loads a whole table to search it in the browser.
    // A tree loads every row (up to `clientRowLimit`, with the page's "only N loaded" warning).
    pagination: screenTree ? "client" : "server",
    ...(screenTree ? { tree: screenTree } : {}),
    formFields,
    // Only the view's own fields make a form: the hidden ones a filter or defaults add don't.
    allowCreate: formFields.some((f) => !f.hidden),
    allowEdit: formFields.some((f) => !f.hidden),
    allowDelete: true,
    can: allows,
    // The record's name for the count and the form: the screen's, else the view's (its copy, then
    // the contract's). A screen noun without a plural gets that noun's plural, never the view's.
    noun: screenNoun ?? view.noun,
    nounPlural: screenNounPlural ?? (screenNoun ? plural(screenNoun) : view.nounPlural),
    // Per entry: a screen's title or count words replace only the ones it names.
    ...(copy?.count || screenCountFormat ? { countFormat: { ...copy?.count, ...screenCountFormat } } : {}),
    ...(formTitles ? { formTitles } : {}),
    ...(copy?.create ? { createLabel: copy.create } : {}),
    ...(copy?.empty?.title ? { emptyMessage: copy.empty.title } : {}),
    ...(copy?.empty?.body ? { emptyDescription: copy.empty.body } : {}),
    ...(searchFields ? { searchFields } : {}),
    ...rest,
    // The app's `clipCells` and `sizeColumns` under the screen's own table props, which win.
    ...(listDefaults.clipCells || listDefaults.sizeColumns
      ? {
          slotProps: {
            ...rest.slotProps,
            table: {
              ...(listDefaults.clipCells ? { clipCells: true } : {}),
              ...(listDefaults.sizeColumns ? { minWidth: "auto" as const } : {}),
              ...rest.slotProps?.table,
            },
          },
        }
      : {}),
    // The app's `pagerJumps`, under the screen's own.
    ...(listDefaults.pagerJumps && rest.pagerJumps === undefined ? { pagerJumps: true } : {}),
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
 * <ResourceView view={leaguesView} tree={{ getParentId: (l) => l.parent_id, defaultExpanded: 1 }} />
 * ```
 *
 * Customise in steps: a screen setting, then the view (every screen gets it), then a slot
 * (`slots`, `renderDetail`, `toolbar`), then `useResourceView` with your own layout.
 */
export function ResourceView<T extends Row = Row>(props: ResourceViewProps<T>) {
  // Two components, so switching `mode` to and from calendar swaps children rather than hooks.
  if (props.mode === "calendar") return <ResourceViewCalendar<T> {...props} />;
  return <ResourceViewPage<T> {...props} />;
}

function ResourceViewPage<T extends Row>(props: ResourceViewProps<T>) {
  return <ResourcePage<T> {...useResourceViewProps(props)} />;
}

/** `mode="calendar"`: the same view, scope and filters, placed by a date field. */
function ResourceViewCalendar<T extends Row>(props: ResourceViewProps<T>) {
  const { view, calendar, title, subtitle, className, cells } = props;
  const words = subtitle ?? view.definition.copy?.subtitle;
  const { filters, select, enabled, live } = useViewListParams(props);
  return (
    <ResourceCalendar<T>
      {...(calendar ?? {})}
      view={view}
      filters={filters}
      {...(select !== undefined ? { select } : {})}
      enabled={enabled}
      {...(live !== undefined ? { live } : {})}
      {...(cells ? { cells } : {})}
      title={title ?? view.title}
      {...(words ? { subtitle: words } : {})}
      {...(className ? { className } : {})}
    />
  );
}

/** The headless form: the same state as `useResourceTable`, from a view. */
export function useResourceView<T extends Row = Row>(props: ResourceViewProps<T>): ResourceTableState<T> {
  if (props.mode === "calendar") {
    throw new Error(`useResourceView(${props.view.resource}): calendar mode has no table state; render <ResourceView mode="calendar"> or <ResourceCalendar>`);
  }
  return useResourceTable<T>(useResourceViewProps(props));
}
