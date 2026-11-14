"use client";

// The inbox view type (ADR 0017): any view drawn as a three-pane inbox, on the parts Genesis
// already has. InboxLayout positions the panes, InboxViews is the rail (the view's segments with
// their counts, and saved views), InboxPage is the list (paged through the provider by
// useViewList), and the open record is its RecordView (the view's record view, or a document
// page) or the app's own reading pane (`renderReading`: a ticket thread, a conversation).

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  resourceKeys,
  useDataProvider,
  useViewer,
  type BaseRecord,
  type DataRow,
  type FilterParam,
  type ResourceContract,
} from "@marktiderman/genesis-core";
import { useCapabilities, useListState, useOne, useSegmentCounts } from "@marktiderman/genesis-core/hooks";
import type { InboxItem } from "@marktiderman/genesis-core/conversation";
import { defineRecordView, rowPicture, type AnyRecordView, type RecordView as RecordViewDef, type ResourceView as View } from "@marktiderman/genesis-core/resource-view";
import { InboxLayout } from "../../patterns/messaging/inbox-layout";
import { InboxPage } from "../../patterns/messaging/inbox-page";
import { InboxViews, type InboxView } from "../../patterns/messaging/inbox-views";
import { EmptyState } from "../../patterns/empty-state";
import { Chip } from "../../resource/chip";
import { Input } from "../../ui/input";
import { ConfirmDeleteDialog } from "../ConfirmDeleteDialog";
import { DataBulkBar } from "../DataBulkBar";
import { fillMessage, useUiMessages } from "../../../messages";
import { RecordView } from "./RecordView";
import { RowAvatar } from "./RowAvatar";
import { recordViewOf } from "./record-open";
import { useViewList } from "./use-view-list";
import { ListModelContext, defaultSavedViewStore, useListActions, useViewSavedViews, ViewFilterControls } from "./list-controls";
import { useResourceViewDefaults } from "./defaults";
import type { ResourceViewProps } from "./ResourceView";

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
type AnyView<T extends Row> = View<ResourceContract<any>, T & DataRow>;

/**
 * What `<ResourceView type="inbox">` takes beside the view (ResourceView's `inbox` prop).
 *
 * @stability Beta
 */
export interface ResourceInboxOptions<T extends Row = Row> {
  /**
   * The open record's key, held by the app (its router's URL param), like a peek. A key no row
   * has (deleted, or hidden from this viewer) shows the reading pane's "Not available".
   */
  selected?: string | null | undefined;
  /** A row was opened (its key) or closed (null). Without `selected`, the inbox keeps it itself. */
  onSelectedChange?: ((key: string | null) => void) | undefined;
  /**
   * The reading pane: the app's own (a ticket's thread and its reply box, a conversation). Default
   * the view's record view, or a document page of its fields.
   */
  renderReading?: ((row: T, parts: { close: () => void }) => ReactNode) | undefined;
  /** The context sidebar beside the reading pane (who it's from, linked work). Optional. */
  renderContext?: ((row: T) => ReactNode) | undefined;
  /** Rows per page; reaching the list's end asks for the next. Default 25. */
  perPage?: number | undefined;
  /** Remember the context sidebar open or closed in this browser, under this key. */
  contextStorageKey?: string | undefined;
}

/** A document page of the view's own fields, for an inbox whose view names no record view. */
function documentPage<T extends Row>(view: AnyView<T>): AnyRecordView {
  const preview = view.definition.inbox?.preview as string | undefined;
  const properties = view
    .columns()
    .filter((c) => c.field && c.key !== view.labelField && c.key !== preview)
    .map((c) => c.key);
  return defineRecordView(view as never, {
    template: "document",
    sections: [],
    document: { properties, ...(preview ? { body: preview } : {}) },
  }) as unknown as AnyRecordView;
}

/**
 * A view as a three-pane inbox: the rail of its segments (with counts) and saved views, a list of
 * rows like messages (unread in bold, a preview line, a relative time, a badge), and the open
 * record. Narrow screens show one pane at a time with Back. Keys: j and k move, e runs the view's
 * done action, Escape closes.
 *
 * ```tsx
 * <ResourceView view={ticketsView} type="inbox" inbox={{ selected: search.id, onSelectedChange: (id) => navigate({ search: { id } }) }} />
 * ```
 *
 * @stability Beta
 */
export function ResourceInbox<T extends Row = Row>(props: ResourceViewProps<T>) {
  const { view, inbox: options = {}, preset, filter, scoped, resourceOptions, live, onEdit, onDelete, onAction, recordView: recordViewProp, filterSlot, refusals, className } = props;
  const m = useUiMessages();
  const viewer = useViewer();
  const provider = useDataProvider();
  const queryClient = useQueryClient();
  const defaults = useResourceViewDefaults();
  const shared = useContext(ListModelContext);
  const own = useListState({
    view: view as never,
    url: undefined,
    store: defaults.savedViews ?? defaultSavedViewStore(),
    currentKey: view.resource,
    defaultSegment: props.defaultSegment,
    defaultType: "inbox",
    types: ["inbox"],
    rememberType: false,
  });
  const state = shared?.state ?? own;
  const block = view.definition.inbox ?? {};

  // ── The list: paged through the provider, newest first by the inbox's time unless the view orders it ──
  const [perPage, setPerPage] = useState(options.perPage ?? 25);
  const timeSort = !view.definition.orderBy && block.time ? { field: block.time as string, order: "desc" as const } : undefined;
  const listFilters = state.filters;
  const list = useViewList<T>(view, {
    ...(preset !== undefined ? { preset } : {}),
    ...(filter !== undefined ? { filter } : {}),
    ...(scoped !== undefined ? { scoped } : {}),
    ...(live !== undefined ? { live } : {}),
    resourceOptions: { ...resourceOptions, defaultFilters: [...(resourceOptions?.defaultFilters ?? []), ...listFilters] },
    perPage,
    ...(timeSort ? { sort: timeSort } : {}),
  });

  // A saved view's search and sort come back; the list's own reach the list state, for saving.
  const restoreNonce = state.restore.nonce;
  useEffect(() => {
    if (!restoreNonce) return;
    list.setSearch(state.restore.search);
    list.setSort(state.restore.sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per restore
  }, [restoreNonce]);
  const observe = state.observeQuery;
  useEffect(() => {
    observe({ search: list.search, sort: list.sort ? { field: list.sort.field, order: list.sort.order } : null });
  }, [observe, list.search, list.sort]);

  // ── The rail: segments with counts, then saved views ──
  const segments = view.segments();
  const baseFilters: FilterParam[] = useMemo(() => [...list.params.filters.filter((f) => !listFilters.includes(f)), ...state.valueFilters], [list.params.filters, listFilters, state.valueFilters]);
  const counted = useSegmentCounts(view as never, baseFilters, { enabled: list.params.enabled });
  const saved = useViewSavedViews(view as never, defaults.savedViews ?? undefined, state, { columns: "default", url: undefined });
  const [savedActive, setSavedActive] = useState<string | null>(null);
  const railOn = (block.rail ?? (segments.length ? "segments" : "none")) === "segments" && (segments.length > 0 || (saved.savedViews?.length ?? 0) > 0);
  const railViews: InboxView[] = [
    ...segments.map((s) => {
      const n = counted[s.id];
      return { id: `segment:${s.id}`, label: s.label, ...(typeof n === "number" ? { count: n } : {}) };
    }),
    ...(saved.savedViews ?? []).map((v) => ({ id: `saved:${v.id}`, label: v.name })),
  ];
  const railActive = savedActive ? `saved:${savedActive}` : state.segment ? `segment:${state.segment}` : null;
  const rail = railOn ? (
    <InboxViews
      views={railViews}
      activeId={railActive}
      sections={[
        ...(segments.length ? [{ title: m.inbox.views, ids: segments.map((s) => `segment:${s.id}`) }] : []),
        ...(saved.savedViews?.length ? [{ title: m.inbox.saved, ids: saved.savedViews.map((v) => `saved:${v.id}`) }] : []),
      ]}
      onSelect={(id) => {
        if (id.startsWith("segment:")) {
          setSavedActive(null);
          state.setSegment(id.slice("segment:".length));
        } else {
          const savedId = id.slice("saved:".length);
          const item = saved.savedViews?.find((v) => v.id === savedId);
          if (item) {
            setSavedActive(savedId);
            saved.onLoadView?.(item.filters);
          }
        }
      }}
      testID="resource-inbox-views"
    />
  ) : undefined;

  // ── The open record: the app's key, else this inbox's own ──
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const selected = options.selected !== undefined ? options.selected : ownSelected;
  const onSelectedChange = options.onSelectedChange;
  const markRead = view.inboxActions().markRead;
  const runAction = useCallback(
    async (name: string, row: T) => {
      if (onAction) await onAction(name, row);
      else if (provider.runAction) await provider.runAction(view.resource, { id: list.keyOf(row), action: name });
      await queryClient.invalidateQueries({ queryKey: resourceKeys(view.resource).all });
    },
    [onAction, provider, view.resource, list, queryClient],
  );
  const select = useCallback(
    (key: string | null) => {
      if (options.selected === undefined) setOwnSelected(key);
      onSelectedChange?.(key);
      // Opening an unread row runs the view's own markRead action, when it declares one.
      const row = key === null ? undefined : list.rows.find((r) => list.keyOf(r) === key);
      if (row && markRead && view.inboxRow(row as T & DataRow).unread && view.canAction(markRead, row as T & DataRow, viewer) === true) {
        void runAction(markRead, row).catch(() => undefined);
      }
    },
    [options.selected, onSelectedChange, list, markRead, view, viewer, runAction],
  );
  const onPage = selected === null ? undefined : list.rows.find((r) => list.keyOf(r) === selected);
  // A row not on the loaded page is read on its own, in the list's scope: a resource read from a
  // function that takes its scope from the list's filters (a tenant, say) reads it in that scope.
  const fetched = useOne<T & BaseRecord>(view.resource, selected !== null && !onPage ? selected : null, {
    enabled: selected !== null && !onPage && list.params.enabled,
    scope: list.params.filters,
  });
  const openRow: T | null = onPage ?? ((fetched.data as T | undefined) ?? null);
  const gone = selected !== null && !openRow && !fetched.isLoading;
  const close = useCallback(() => select(null), [select]);

  // ── Actions: the row's own (a menu on each row), the bulk bar, and delete ──
  const actions = useListActions<T>(view, {
    refusals: refusals ?? view.definition.refusals ?? "disable",
    ...(onAction ? { onRun: onAction as (name: string, row: T) => void | Promise<void> } : {}),
  });
  const [pickedAll, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const lastPicked = useRef<string | null>(null);
  // Only picks the person can see count: a segment, filter or search change hides the rest.
  const pickedRows = list.rows.filter((r) => pickedAll.has(list.keyOf(r)));
  const picked: ReadonlySet<string> = new Set(pickedRows.map((r) => list.keyOf(r)));
  const [deleting, setDeleting] = useState<T | null>(null);
  const { data: caps } = useCapabilities(view.resource, { enabled: !onDelete && props.allowDelete !== false });
  // The reading pane's Edit and Delete: the screen's `can`, then the view's guard, on the open row.
  const can = props.can;
  const allows = (action: "edit" | "delete", row: T) =>
    (!can || can(action, row)) && view.can(action === "edit" ? "update" : "delete", row as T & DataRow, viewer) === true;
  const deleteHandler =
    onDelete ??
    (props.allowDelete !== false
      ? (row: T) => {
          setDeleting(row);
        }
      : undefined);
  const deleteRow = deleteHandler && openRow && allows("delete", openRow) ? deleteHandler : undefined;
  const editRow = onEdit && openRow && allows("edit", openRow) ? onEdit : undefined;

  // ── The list's rows, as InboxPage draws them ──
  const items: InboxItem[] = list.rows.map((row) => {
    const r = view.inboxRow(row as T & DataRow);
    const who = r.from ?? (r.avatar ? r.title : undefined);
    const picture = who || r.avatar ? rowPicture({ title: who ?? r.title, image: { ...(r.avatar ? { src: r.avatar } : {}), name: who ?? r.title } }) : null;
    const menu = actions.rowMenu(row, {}).filter((item) => !item.reason);
    return {
      id: list.keyOf(row),
      title: r.title,
      unread: r.unread,
      ...(r.preview ? { preview: r.preview } : {}),
      ...(r.time ? { timestamp: r.time } : {}),
      ...(r.from ? { meta: r.from } : {}),
      ...(picture ? { avatar: <RowAvatar picture={picture} /> } : {}),
      ...(r.badge ? { trailing: <Chip tone={r.badge.tone ?? "muted"}>{r.badge.label}</Chip> } : {}),
      ...(menu.length ? { swipeActions: menu.map((item) => ({ id: item.key, label: item.label, onPress: item.onSelect, ...(item.destructive ? { destructive: true } : {}) })) } : {}),
    };
  });
  const keys = items.map((i) => i.id);
  const move = (step: number) => {
    if (!keys.length) return;
    const at = selected === null ? -1 : keys.indexOf(selected);
    const next = keys[Math.min(keys.length - 1, Math.max(0, at + step))];
    if (next !== undefined) select(next);
  };
  const done = view.inboxActions().done;

  const recordView = useMemo(() => (recordViewOf(view, recordViewProp) as AnyRecordView | undefined) ?? documentPage(view), [view, recordViewProp]);
  const reading = openRow ? (
    <div className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="resource-inbox-reading">
      {options.renderReading ? (
        options.renderReading(openRow, { close })
      ) : (
        <RecordView<T>
          view={recordView as unknown as RecordViewDef<ResourceContract<never>, T & DataRow>}
          row={openRow}
          presentation="peek"
          {...(onAction ? { onAction } : {})}
          {...(editRow ? { onEdit: editRow } : {})}
          {...(deleteRow ? { onDelete: deleteRow } : {})}
          testID="resource-inbox-record"
        />
      )}
    </div>
  ) : (
    <div className="flex flex-1 items-center justify-center p-6" data-testid={gone ? "resource-inbox-gone" : "resource-inbox-nothing"}>
      <EmptyState title={gone ? m.inbox.goneTitle : m.inbox.pickTitle} description={gone ? m.inbox.goneBody : m.inbox.pickBody} />
    </div>
  );

  const bulk = actions.bulkActions;
  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background p-2">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-semibold">{props.title ?? view.title}</h2>
          {shared?.switcher ? <span className="ml-auto">{shared.switcher}</span> : null}
        </div>
        <Input
          aria-label={m.inbox.search}
          placeholder={m.inbox.search}
          inputMode="search"
          autoComplete="off"
          value={list.search}
          onChange={(e) => list.setSearch(e.target.value)}
          className="h-9"
          data-testid="resource-inbox-search"
        />
        {view.filters().length || filterSlot ? (
          <div className="flex flex-wrap items-center gap-2">
            <ViewFilterControls view={view as never} state={state} />
            {filterSlot}
          </div>
        ) : null}
        {bulk.length && picked.size ? (
          <DataBulkBar
            selected={new Set(picked)}
            totalCount={list.rows.length}
            onToggleAll={() => setPicked(picked.size === list.rows.length ? new Set() : new Set(keys))}
            onClearSelection={() => setPicked(new Set())}
            actions={bulk.map((a) => ({
              label: a.label,
              icon: Check,
              ...(a.variant ? { variant: a.variant } : {}),
              ...(a.testId ? { testId: a.testId } : {}),
              reason: a.reason?.(pickedRows),
              onClick: () => {
                void a.onAction([...picked], { rows: pickedRows, allMatching: false, query: { filters: list.params.filters, sorts: list.sort ? [list.sort] : [] } });
                setPicked(new Set());
              },
            }))}
          />
        ) : null}
      </div>
      <InboxPage
        items={items}
        selectedId={selected}
        onSelect={(key) => select(key)}
        loading={list.loading}
        error={Boolean(list.error)}
        hasMore={list.total !== undefined ? list.rows.length < list.total : list.hasMore}
        loadingMore={list.fetching && !list.loading}
        onEndReached={() => setPerPage((n) => n + (options.perPage ?? 25))}
        label={view.title}
        {...(view.definition.copy?.empty?.title ? { emptyTitle: view.definition.copy.empty.title } : {})}
        {...(view.definition.copy?.empty?.body ? { emptyBody: view.definition.copy.empty.body } : {})}
        {...(bulk.length
          ? {
              checked: picked,
              onCheckedChange: (key: string, on: boolean, { shiftKey }: { shiftKey: boolean }) => {
                setPicked((current) => {
                  const next = new Set(current);
                  const from = lastPicked.current === null ? -1 : keys.indexOf(lastPicked.current);
                  const to = keys.indexOf(key);
                  const range = shiftKey && from >= 0 && to >= 0 ? keys.slice(Math.min(from, to), Math.max(from, to) + 1) : [key];
                  for (const k of range) {
                    if (on) next.add(k);
                    else next.delete(k);
                  }
                  return next;
                });
                lastPicked.current = key;
              },
            }
          : {})}
        checkLabel={(title: string) => fillMessage(m.table.selectRow, { name: title })}
        testID="resource-inbox-list"
      />
    </div>
  );

  return (
    <div data-slot="inbox" className={className ?? "h-[calc(100dvh-10rem)] min-h-96 rounded-lg border"} data-testid="resource-inbox">
      <InboxLayout
        {...(rail ? { views: rail } : {})}
        activeViewLabel={railViews.find((v) => v.id === railActive)?.label ?? ""}
        list={listPane}
        thread={reading}
        {...(openRow && options.renderContext ? { context: options.renderContext(openRow) } : {})}
        {...(options.contextStorageKey ? { contextStorageKey: options.contextStorageKey } : {})}
        threadOpen={selected !== null}
        onBack={close}
        labels={{ views: m.inbox.views, list: view.title, thread: openRow ? view.inboxRow(openRow as T & DataRow).title : m.inbox.pickTitle, back: m.inbox.back, context: m.inbox.details, toggleContext: m.inbox.details }}
        shortcuts={{
          onNext: () => move(1),
          onPrevious: () => move(-1),
          onBack: close,
          // e: the view's done action, as its row menu runs it (its confirm, once at a time).
          ...(done && openRow
            ? {
                onClose: () => {
                  actions.run(done, openRow);
                },
              }
            : {}),
        }}
        testID="resource-inbox-layout"
      />
      <ConfirmDeleteDialog
        open={deleting !== null}
        kind={caps?.softDelete ? "recycle" : "permanent"}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await provider.deleteOne(view.resource, { id: list.keyOf(deleting) });
          if (selected === list.keyOf(deleting)) close();
          setDeleting(null);
          await queryClient.invalidateQueries({ queryKey: resourceKeys(view.resource).all });
        }}
      />
      {actions.confirming ? (
        <ConfirmDeleteDialog
          open
          onOpenChange={(open) => !open && actions.setConfirming(null)}
          onConfirm={async () => {
            await actions.confirming?.run();
          }}
          title={actions.confirming.title}
          description=""
          confirmLabel={actions.confirming.label}
        />
      ) : null}
    </div>
  );
}
