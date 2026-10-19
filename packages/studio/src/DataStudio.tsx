import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Database, History, Lock, PencilLine, Plus, Table2, Trash2, Undo2, X } from "lucide-react";
import { GenesisProvider, type BaseRecord, type DataProvider } from "@marktiderman/genesis-core/provider";
import {
  encodeRecordKey,
  isDataWriteError,
  keyFields,
  type AuditEntry,
  type FieldSchema,
  type ResourceSchema,
  type ResourceSummary,
} from "@marktiderman/genesis-core/schema";
import { useSavedViews } from "@marktiderman/genesis-ui/data";
import { Button } from "@marktiderman/genesis-ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@marktiderman/genesis-ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@marktiderman/genesis-ui/alert";
import { cn } from "@marktiderman/genesis-ui/utils";
import { useHistoryRouter, type StudioLocation, type StudioRouter } from "./router";
import { choicesFor, displayText, editText, fieldLabel, parseDraft } from "./values";
import { exportCsv, downloadText } from "./lib/csv";
import { formatFilters, formatSorts, parseFilters, parseSorts } from "./lib/query-state";
import { usePageLinkLabels } from "./lib/relations";
import { RecordForm } from "./record/RecordForm";
import { RecordPanel } from "./record/RecordPanel";
import { ExportButton, FilterBuilder, GroupPicker, HideFields, NewRowButton, SearchBox, SortBuilder, ViewFieldPicker } from "./toolbar/Toolbar";
import { TableTabs, ViewsPanel } from "./workspace/ViewsPanel";
import { CellValue } from "./grid/cells";
import { KanbanView } from "./views/KanbanView";
import { CalendarView } from "./views/CalendarView";
import { boardFields, dateFields } from "./views/fields";
import { ImportDialog } from "./toolbar/ImportDialog";
import { BulkEditDialog } from "./toolbar/BulkEdit";
import { gridFields, SheetView } from "./sheet/SheetView";
import type { StudioFormConfig } from "./lib/form-config";

type Row = Record<string, unknown>;

/** One entry in the session's activity panel. */
export interface StudioActivity {
  id: string;
  at: Date;
  resource: string;
  field: string;
  /** The record's key, as shown to the user. */
  record: string;
  outcome: "saved" | "not_saved";
  /** What was attempted. Default `update`. */
  action?: "update" | "create" | "delete";
  message: string;
  /** Present when the edit committed with an audit entry from the `table` sink. */
  audit?: AuditEntry;
  /** True once this change has been undone. */
  undone?: boolean;
}

export interface DataStudioProps {
  /**
   * Where the data comes from: the studio handler's client
   * (`createStudioProvider` from `@marktiderman/genesis-studio-server/client`)
   * or any Genesis `DataProvider` that implements `describe` and
   * `listResources`.
   */
  provider: DataProvider;
  /**
   * URL state, from the app's router (see `createSearchParamsRouter`).
   * Default: the page's own query string, through the History API.
   */
  router?: StudioRouter;
  /** Shown in place of the studio while nobody is signed in. */
  signIn?: ReactNode;
  /**
   * Changes when the signed-in user does (their id, say). The studio drops
   * everything it loaded for the previous user and asks again. Not needed
   * with a provider that reports its session (`createSupabaseStudioProvider`).
   */
  sessionKey?: string | number | null;
  /** Heading above the table list. Default "Data"; `null` for none (the app's own page header names it). */
  title?: string | null;
  /**
   * `card` (default): the studio draws its own frame. `plain`: no frame, so
   * it sits flush inside an app's layout, under its own header and nav,
   * like any other page of the app.
   */
  variant?: "card" | "plain";
  /** Rows per page. Default 50. */
  perPage?: number;
  /**
   * Record-form layout per resource (`schema.table`): sections, and fields
   * shown only when a condition holds. Code first; see `StudioFormConfig`.
   */
  forms?: Readonly<Record<string, StudioFormConfig>>;
  className?: string;
}

const PER_PAGE = 50;
const SEARCH_DEBOUNCE_MS = 300;

function isUnauthenticated(error: unknown): boolean {
  return isDataWriteError(error) && error.outcome === "unauthenticated";
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The Data Studio: a sidebar of the tables this user may see, and a sheet of
 * the selected one where a cell is edited in place. Every edit carries the
 * version it was read at, so a stale edit is refused rather than saved over
 * someone else's, and the outcome — saved with its audit entry, or not saved
 * and why — is shown on screen.
 *
 * It renders inside its own `GenesisProvider`, so it works whether or not
 * the app already has one.
 *
 * @stability Experimental
 */
export function DataStudio(props: DataStudioProps) {
  const historyRouter = useHistoryRouter();
  const router = props.router ?? historyRouter;
  // A provider that knows who is signed in (the Supabase one) keys the
  // studio's data to that user, so the app needn't pass a sessionKey.
  const session = (props.provider as { session?: StudioSessionSource }).session;
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  useEffect(() => session?.subscribe(setSessionUser), [session]);
  const sessionKey = props.sessionKey !== undefined ? props.sessionKey : session ? sessionUser : null;
  return (
    <GenesisProvider provider={props.provider}>
      {/* The scope standalone.css resets, for apps without Tailwind. */}
      <div data-genesis-studio="">
        <StudioWorkspace {...props} router={router} sessionKey={sessionKey} />
      </div>
    </GenesisProvider>
  );
}

/** A provider's report of who is signed in (see `createSupabaseStudioProvider`). */
export interface StudioSessionSource {
  subscribe(listener: (userId: string | null) => void): () => void;
}

function StudioWorkspace({
  provider,
  router,
  signIn,
  sessionKey = null,
  title = "Data",
  variant = "card",
  perPage = PER_PAGE,
  forms,
  className,
}: DataStudioProps & { router: StudioRouter }) {
  const queryClient = useQueryClient();
  const [activity, setActivity] = useState<StudioActivity[]>([]);
  // The provider whose token was refused. Signing in again, even as the same
  // user, gives a new provider (a new token), which ends the signed-out state.
  const [refusedProvider, setRefusedProvider] = useState<DataProvider | null>(null);
  const signedOut = refusedProvider !== null && refusedProvider === provider;
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const setSignedOut = useCallback((value: boolean) => setRefusedProvider(value ? providerRef.current : null), []);

  // A new user sees nothing the previous one loaded.
  useEffect(() => {
    setRefusedProvider(null);
    setActivity([]);
    void queryClient.resetQueries({ queryKey: ["genesis-studio"] });
  }, [sessionKey, queryClient]);

  const resources = useQuery({
    queryKey: ["genesis-studio", sessionKey, "resources"],
    queryFn: () => {
      if (!provider.listResources) throw new Error("This data provider can't list its resources.");
      return provider.listResources();
    },
    retry: (count, error) => !isUnauthenticated(error) && count < 2,
  });

  useEffect(() => {
    if (isUnauthenticated(resources.error)) setSignedOut(true);
  }, [resources.error]);

  // The same user signed in again: ask again with the new token. Declared
  // after the queries, so their fetchers already use the new provider.
  useEffect(() => {
    if (refusedProvider && refusedProvider !== provider) {
      setRefusedProvider(null);
      void queryClient.resetQueries({ queryKey: ["genesis-studio", sessionKey] });
    }
  }, [provider, refusedProvider, queryClient, sessionKey]);

  /**
   * Undo a change from its audit entry: a compensating write, itself
   * audited, that the server refuses if the row has moved on since.
   */
  const undo = useCallback(
    async (entry: StudioActivity) => {
      if (!provider.undo || !entry.audit || entry.undone) return;
      try {
        const result = await provider.undo(entry.resource, { auditId: entry.audit.id });
        setActivity((prev) => prev.map((e) => (e.id === entry.id ? { ...e, undone: true } : e)));
        void queryClient.invalidateQueries({ queryKey: ["genesis-studio", sessionKey] });
        setActivity((prev) =>
          [
            {
              id: `${Date.now()}-undo`,
              at: new Date(),
              resource: entry.resource,
              field: entry.field,
              record: entry.record,
              outcome: "saved" as const,
              action: "update" as const,
              message: "Undone, with its own audit entry.",
              ...(result.audit ? { audit: result.audit, undone: true } : {}),
            },
            ...prev,
          ].slice(0, 50),
        );
      } catch (error) {
        setActivity((prev) =>
          [
            {
              id: `${Date.now()}-undo-failed`,
              at: new Date(),
              resource: entry.resource,
              field: entry.field,
              record: entry.record,
              outcome: "not_saved" as const,
              message: errorText(error),
            },
            ...prev,
          ].slice(0, 50),
        );
      }
    },
    [provider, queryClient, sessionKey],
  );

  const record = useCallback((entry: Omit<StudioActivity, "id" | "at">) => {
    setActivity((prev) =>
      [{ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, at: new Date() }, ...prev].slice(0, 50),
    );
  }, []);

  if (signedOut) {
    return (
      <div className={cn("flex min-h-[320px] items-center justify-center p-6", className)} data-testid="studio-sign-in">
        {signIn ?? <p className="text-sm text-muted-foreground">Sign in to use the studio.</p>}
      </div>
    );
  }

  const selected = router.location.resource;
  const list = resources.data ?? [];

  return (
    <div className={cn("w-full space-y-3", className)}>
      <div className={variant === "card" ? "overflow-hidden rounded-lg border bg-background" : "min-w-0"} data-testid="studio" data-variant={variant}>
        {(title !== null || resources.isLoading || resources.isError) && (
          <div className={cn("flex items-center gap-2", variant === "card" ? "border-b px-3 py-2" : "pb-3")}>
            {title !== null &&
              (variant === "card" ? (
                <>
                  <Database className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-semibold">{title}</span>
                </>
              ) : (
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              ))}
            {resources.isLoading && <span className="text-xs text-muted-foreground">Loading tables…</span>}
            {resources.isError && (
              <span role="alert" className="text-xs text-destructive">
                {errorText(resources.error)}
              </span>
            )}
          </div>
        )}
        <TableTabs resources={list} selected={selected} onSelect={(resource) => router.navigate({ resource })} variant={variant} />
        <main className="min-w-0" data-testid="studio-main">
          {selected ? (
            <Sheet
              key={selected}
              provider={provider}
              resource={selected}
              sessionKey={sessionKey}
              router={router}
              perPage={perPage}
              onActivity={record}
              onSignedOut={() => setSignedOut(true)}
              formConfig={forms?.[selected]}
              onUndoLatest={() => {
                const latest = activity.find((e) => e.resource === selected && e.outcome === "saved" && e.audit && e.audit.action !== "run" && !e.undone);
                if (latest) void undo(latest);
              }}
            />
          ) : (
            <div
              className="flex min-h-[320px] flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground"
              data-testid="studio-empty"
            >
              <Table2 className="h-6 w-6" aria-hidden />
              <p className="text-sm">{list.length ? "Pick a table to open it." : "No tables to show yet."}</p>
            </div>
          )}
        </main>
      </div>
      <ActivityPanel entries={activity} onUndo={provider.undo ? (entry) => void undo(entry) : undefined} />
    </div>
  );
}

function Sheet({
  provider,
  resource,
  sessionKey,
  router,
  perPage,
  onActivity,
  onSignedOut,
  formConfig,
  onUndoLatest,
}: {
  provider: DataProvider;
  resource: string;
  sessionKey: string | number | null;
  router: StudioRouter;
  perPage: number;
  onActivity: (entry: Omit<StudioActivity, "id" | "at">) => void;
  onSignedOut: () => void;
  formConfig?: StudioFormConfig;
  onUndoLatest: () => void;
}) {
  const queryClient = useQueryClient();
  const { location } = router;
  const page = location.page ?? 1;
  const sorts = useMemo(() => parseSorts(location.sort), [location.sort]);
  const filters = useMemo(() => parseFilters(location.filters), [location.filters]);
  const search = location.search ?? "";
  const group = location.group;
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped to remount the page after a saved view sets column visibility.
  const [viewEpoch, setViewEpoch] = useState(0);
  const [bulkIds, setBulkIds] = useState<string[] | null>(null);
  const view = location.view ?? "table";
  const sheetView = view === "sheet";
  const savedViews = useSavedViews(`genesis-studio:views:${resource}`);
  const hiddenKey = `genesis-studio:hidden:${resource}`;
  const [hidden, setHiddenState] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(hiddenKey) ?? "[]");
      return new Set(Array.isArray(stored) ? stored.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set();
    }
  });
  const setHidden = useCallback(
    (next: Set<string>) => {
      setHiddenState(next);
      try {
        localStorage.setItem(hiddenKey, JSON.stringify([...next]));
      } catch {
        // Hidden fields are a convenience; the grid works without storage.
      }
    },
    [hiddenKey],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState(location.search ?? "");

  const schemaQuery = useQuery({
    queryKey: ["genesis-studio", sessionKey, "describe", resource],
    queryFn: () => {
      if (!provider.describe) throw new Error("This data provider can't describe its resources.");
      return provider.describe(resource);
    },
    retry: false,
  });
  const schema = schemaQuery.data;
  const capabilities = useQuery({
    queryKey: ["genesis-studio", sessionKey, "capabilities", resource],
    enabled: Boolean(provider.capabilities),
    retry: false,
    queryFn: () => provider.capabilities!(resource),
  }).data;

  // Grouping sorts by the group field first, so each group is contiguous.
  const effectiveSorts = useMemo(
    () => (group ? [{ field: group, order: "asc" as const }, ...sorts.filter((s) => s.field !== group)] : sorts),
    [group, sorts],
  );
  const listKey = useMemo(
    () => ["genesis-studio", sessionKey, "list", resource, page, perPage, location.sort ?? "", search, location.filters ?? "", group ?? ""],
    [sessionKey, resource, page, perPage, location.sort, search, location.filters, group],
  );
  const listQuery = useQuery({
    queryKey: listKey,
    enabled: Boolean(schema),
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: () =>
      provider.getList<BaseRecord>(resource, {
        pagination: { page, perPage },
        sort: effectiveSorts[0],
        sorts: effectiveSorts,
        filters,
        search: search ? { query: search, fields: [] } : undefined,
      }),
  });

  const failure = schemaQuery.error ?? listQuery.error;
  useEffect(() => {
    if (isUnauthenticated(failure)) onSignedOut();
  }, [failure, onSignedOut]);

  // Debounce search into the URL; typing replaces rather than pushes history.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const navigate = useCallback(
    (patch: Partial<StudioLocation>, replace = false) => router.navigate({ ...location, resource, ...patch }, { replace }),
    [router, location, resource],
  );

  const rows = (listQuery.data?.data ?? []) as Row[];
  const keyed = Boolean(schema && keyFields(schema).length > 0);
  const keys = useMemo(() => {
    const map = new Map<Row, string>();
    rows.forEach((row, index) => map.set(row, schema && keyed ? String(encodeRecordKey(schema, row)) : `row-${index}`));
    return map;
  }, [rows, schema, keyed]);
  const linkLabels = usePageLinkLabels(provider, sessionKey, schema?.fields ?? [], rows);

  const replaceRow = useCallback(
    (oldRow: Row, next: Row) => {
      queryClient.setQueryData(listKey, (prev: { data: Row[]; total: number } | undefined) =>
        prev ? { ...prev, data: prev.data.map((r) => (r === oldRow ? next : r)) } : prev,
      );
    },
    [queryClient, listKey],
  );
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["genesis-studio", sessionKey, "list", resource] });
    void queryClient.invalidateQueries({ queryKey: ["genesis-studio", sessionKey, "history", resource] });
  }, [queryClient, sessionKey, resource]);

  const openRecord = useCallback(
    (target: string, id: string) =>
      target === resource ? navigate({ record: id }) : router.navigate({ resource: target, record: id }),
    [navigate, router, resource],
  );

  // Stable while the schema is, so a background refetch doesn't reset the
  // new-row form under the user's typing.
  const createFields = useMemo(() => new Set(schema?.createFields ?? []), [schema]);
  const fieldsForCreate = useMemo(() => schema?.fields.filter((f) => createFields.has(f.name)) ?? [], [schema, createFields]);

  async function runExport() {
    if (!schema) return;
    setExporting(0);
    setNotice(null);
    try {
      const { csv, rows: count, truncated } = await exportCsv({
        provider,
        resource,
        fields: schema.fields,
        sorts: effectiveSorts,
        filters,
        search,
        onProgress: setExporting,
      });
      downloadText(`${resource}.csv`, csv);
      setNotice(
        truncated
          ? `Exported the first ${count.toLocaleString()} matching rows. Narrow the list to export the rest.`
          : `Exported ${count.toLocaleString()} rows.`,
      );
    } catch (error) {
      setNotice(`Export failed: ${errorText(error)}`);
    } finally {
      setExporting(null);
    }
  }

  async function create(values: Record<string, unknown>) {
    if (!schema) return;
    try {
      const result = await provider.create<BaseRecord>(resource, { data: values as never });
      setCreating(false);
      refresh();
      const id = String(encodeRecordKey(schema, result.data as Row));
      onActivity({ resource, field: "", record: id, outcome: "saved", action: "create", message: result.audit ? "Added, with its audit entry." : "Added.", ...(result.audit ? { audit: result.audit } : {}) });
      navigate({ record: id });
    } catch (error) {
      if (isUnauthenticated(error)) onSignedOut();
      onActivity({ resource, field: "", record: "new row", outcome: "not_saved", action: "create", message: errorText(error) });
      throw error;
    }
  }

  if (schemaQuery.isError && !isUnauthenticated(schemaQuery.error)) {
    return (
      <Alert variant="destructive" data-testid="studio-describe-error">
        <AlertTitle>Couldn't open {resource}</AlertTitle>
        <AlertDescription>{errorText(schemaQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  const editable = schema?.fields.filter((f) => f.permissions?.update).length ?? 0;
  const boardChoices = schema ? boardFields(schema) : [];
  const dateChoices = schema ? dateFields(schema) : [];
  const keyedView = (view === "kanban" || view === "calendar") && keyed;
  const viewChoices = view === "kanban" ? boardChoices : view === "calendar" ? dateChoices : [];
  const viewField = viewChoices.find((f) => f.name === location.by) ?? viewChoices[0];
  const altView = keyedView && viewField ? view : null;

  const gridView = !altView;
  const pageCount = Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / perPage));
  const total = listQuery.data?.total ?? 0;
  const selectable = Boolean(schema && keyed && ((schema.access.update && provider.updateMany) || (schema.access.delete && provider.deleteMany)));
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pageIds = rows.map((r) => keys.get(r) ?? "");
  // A selection belongs to the rows on screen: a new page, filter, search or
  // sort starts with none, so a bulk action never reaches rows out of view.
  const listIdentity = JSON.stringify(listKey);
  useEffect(() => {
    setSelected(new Set());
  }, [listIdentity]);
  const toggleAll = () =>
    setSelected((prev) => (pageIds.every((id) => prev.has(id)) ? new Set() : new Set(pageIds)));
  const canAdd = Boolean(schema?.access.create);

  async function deleteSelected() {
    if (!schema) return;
    const ids = [...selected];
    const chosen = rows.filter((r) => ids.includes(keys.get(r) ?? ""));
    // Never act on fewer rows than were confirmed.
    if (chosen.length !== ids.length) {
      setSelected(new Set());
      setNotice("Some selected rows aren't on this page any more. Select the rows again.");
      return;
    }
    if (!window.confirm(`Delete ${ids.length} record${ids.length === 1 ? "" : "s"}? All of them go, or none do.`)) return;
    let result;
    try {
      result = await provider.deleteMany!(resource, {
        items: chosen.map((r) => ({ id: encodeRecordKey(schema, r), expectedVersion: versionOf(schema, r) })),
      });
    } catch (error) {
      if (isUnauthenticated(error)) onSignedOut();
      refresh();
      const message = `Nothing was deleted: ${errorText(error)}`;
      setNotice(message);
      onActivity({ resource, field: "", record: `${ids.length} rows`, outcome: "not_saved", action: "delete", message });
      return;
    }
    refresh();
    setSelected(new Set());
    if (result.ok) {
      setNotice(`Deleted ${result.count} records in one transaction.`);
      // One entry per row, each with its audit entry, so each can be undone.
      if (result.audit?.length) {
        result.audit.forEach((audit) =>
          onActivity({ resource, field: "", record: JSON.stringify(audit.key), outcome: "saved", action: "delete", message: "Deleted, with its audit entry.", audit }),
        );
      } else {
        onActivity({ resource, field: "", record: `${result.count} rows`, outcome: "saved", action: "delete", message: "Deleted, each row audited." });
      }
    } else {
      const message = `Nothing was deleted: ${(result.failures ?? []).length} of ${ids.length} records couldn't be (${result.failures?.[0]?.message ?? ""}).`;
      setNotice(message);
      onActivity({ resource, field: "", record: `${ids.length} rows`, outcome: "not_saved", action: "delete", message });
    }
  }

  const gridFor = (items: Row[], firstRowNumber: number, label?: string, withFooter = true) =>
    schema && (
      <SheetView
        provider={provider}
        schema={schema}
        rows={items}
        keys={keys}
        linkLabels={linkLabels}
        hidden={hidden}
        label={label}
        firstRowNumber={firstRowNumber}
        {...(selectable ? { selected, onToggleSelect: toggleSelect, onToggleAll: toggleAll } : {})}
        onOpenRecord={keyed ? (id) => navigate({ record: id }) : undefined}
        footer={
          withFooter && canAdd ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              onClick={() => setCreating(true)}
              data-testid="studio-add-record"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add a record
            </button>
          ) : undefined
        }
        onSaved={(updates) => {
          if (updates.length === 1) replaceRow(updates[0]!.old, updates[0]!.next);
          else refresh();
          void queryClient.invalidateQueries({ queryKey: ["genesis-studio", sessionKey, "record", resource] });
          for (const u of updates) {
            onActivity({
              resource,
              field: Object.keys(u.audit?.after ?? {}).filter((f) => f !== schema.version?.field).join(", "),
              record: keys.get(u.old) ?? "",
              outcome: "saved",
              message: u.audit ? "Saved, with its audit entry." : "Saved.",
              ...(u.audit ? { audit: u.audit } : {}),
            });
          }
        }}
        onFailed={(message) => {
          refresh();
          onActivity({ resource, field: "", record: "", outcome: "not_saved", message });
        }}
        onUndo={onUndoLatest}
        onNotice={setNotice}
      />
    );

  return (
    <div className="flex min-h-[480px] flex-col md:flex-row" data-testid="studio-sheet">
      {schema && (
        <ViewsPanel
          view={altView ?? "grid"}
          available={{ grid: true, kanban: keyed && boardChoices.length > 0, calendar: keyed && dateChoices.length > 0 }}
          onChange={(next) => navigate({ view: next === "grid" ? undefined : next, by: undefined, month: undefined, record: undefined })}
          saved={savedViews.savedViews}
          onDelete={savedViews.deleteView}
          onSave={(name) =>
            savedViews.saveView(name, {
              sort: location.sort ?? null,
              search: location.search ?? null,
              filters: location.filters ?? null,
              group: location.group ?? null,
              view: location.view ?? null,
              by: location.by ?? null,
              hidden: [...hidden],
            })
          }
          onLoad={(item) => {
            const view = savedViews.loadViewFilters(item.id) ?? {};
            if (Array.isArray(view.hidden)) setHidden(new Set(view.hidden.filter((x): x is string => typeof x === "string")));
            const str = (v: unknown) => (typeof v === "string" ? v : undefined);
            const nextView = str(view.view);
            setSearchDraft(str(view.search) ?? "");
            router.navigate({
              resource,
              sort: str(view.sort),
              search: str(view.search),
              filters: str(view.filters),
              group: str(view.group),
              view: nextView === "kanban" || nextView === "calendar" ? nextView : undefined,
              by: str(view.by),
            });
          }}
        />
      )}
      <div className="min-w-0 flex-1 space-y-2 p-2 md:p-3">
        {schema && !schema.access.update && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="studio-read-only">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Read-only: {(schema.access.reason ?? "you can view this table but not edit it.").replace(/^Read-only: /, "")}
          </p>
        )}
        {schema && (
          <div className="flex flex-wrap items-center gap-1" data-testid="studio-toolbar">
            {selected.size === 0 && gridView && <HideFields fields={gridFields(schema)} hidden={hidden} onChange={setHidden} />}
            {selected.size === 0 && (capabilities?.filterOperators?.length ?? 1) > 0 && (
              <FilterBuilder fields={schema.fields} filters={filters} onChange={(next) => navigate({ filters: formatFilters(next), page: 1 })} />
            )}
            {selected.size === 0 && gridView && <GroupPicker fields={schema.fields} group={group} onChange={(next) => navigate({ group: next, page: 1 })} />}
            {selected.size === 0 && capabilities?.sort !== false && (
              <SortBuilder fields={schema.fields} sorts={sorts} onChange={(next) => navigate({ sort: formatSorts(next), page: 1 })} />
            )}
            {altView && viewField && (
              <ViewFieldPicker
                label={altView === "kanban" ? "Columns by" : "Dates by"}
                fields={viewChoices}
                value={viewField.name}
                onChange={(by) => navigate({ by })}
              />
            )}
            {selected.size > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-muted px-2 text-sm" data-testid="studio-selection">
                {selected.size} selected
                {schema.access.update && provider.updateMany && (
                  <Button type="button" variant="ghost" size="sm" testID="studio-bulk-set" onClick={() => setBulkIds([...selected])}>
                    <PencilLine className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Set a field…
                  </Button>
                )}
                {schema.access.delete && provider.deleteMany && (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" testID="studio-bulk-delete" onClick={() => void deleteSelected()}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Delete
                  </Button>
                )}
                <button type="button" aria-label="Clear the selection" className="rounded p-0.5 hover:bg-background" onClick={() => setSelected(new Set())}>
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            )}
            <span className="ml-auto flex items-center gap-1">
              <SearchBox
                value={searchDraft}
                onChange={(text) => {
                  setSearchDraft(text);
                  clearTimeout(searchTimer.current);
                  searchTimer.current = setTimeout(() => navigate({ search: text || undefined, page: 1 }, true), SEARCH_DEBOUNCE_MS);
                }}
              />
              <ExportButton onExport={() => void runExport()} busy={exporting !== null} progress={exporting ?? 0} />
              {schema.access.create !== undefined && (
                <ImportDialog
                  provider={provider}
                  schema={schema}
                  onImported={(count) => {
                    refresh();
                    setNotice(`Imported ${count.toLocaleString()} rows in one transaction.`);
                    onActivity({ resource, field: "", record: `${count} rows`, outcome: "saved", action: "create", message: "Imported, each row audited." });
                  }}
                />
              )}
              {schema.access.create !== undefined && (
                <NewRowButton allowed={canAdd} reason={schema.access.reasons?.create} onClick={() => setCreating(true)} />
              )}
            </span>
          </div>
        )}
        {notice && (
          <p className="text-xs text-muted-foreground" role="status" data-testid="studio-notice">
            {notice}
          </p>
        )}
      {schema && altView === "kanban" && viewField && (
        <KanbanView
          key={`${viewField.name}|${location.filters ?? ""}|${search}|${location.sort ?? ""}`}
          provider={provider}
          schema={schema}
          sessionKey={sessionKey}
          field={viewField}
          filters={filters}
          sorts={sorts}
          search={search}
          onOpenRecord={(id) => navigate({ record: id })}
          onMoved={(record, audit) => {
            refresh();
            onActivity({ resource, field: viewField.name, record, outcome: "saved", message: audit ? "Moved, with its audit entry." : "Moved.", ...(audit ? { audit } : {}) });
          }}
          onFailed={(record, message) => {
            refresh();
            onActivity({ resource, field: viewField.name, record, outcome: "not_saved", message });
          }}
          onSignedOut={onSignedOut}
        />
      )}
      {schema && altView === "calendar" && viewField && (
        <CalendarView
          provider={provider}
          schema={schema}
          sessionKey={sessionKey}
          field={viewField}
          month={location.month}
          onMonthChange={(month) => navigate({ month })}
          filters={filters}
          sorts={sorts}
          search={search}
          onOpenRecord={(id) => navigate({ record: id })}
          onSignedOut={onSignedOut}
        />
      )}
        {gridView && (
          <div className="space-y-3" data-testid="studio-grid">
            {(schemaQuery.isLoading || listQuery.isLoading) && <p className="px-1 py-6 text-sm text-muted-foreground">Loading…</p>}
            {listQuery.isError && !isUnauthenticated(listQuery.error) && (
              <Alert variant="destructive">
                <AlertTitle>Couldn't load the records</AlertTitle>
                <AlertDescription>
                  {errorText(listQuery.error)}{" "}
                  <button type="button" className="underline" onClick={() => void listQuery.refetch()}>
                    Try again
                  </button>
                </AlertDescription>
              </Alert>
            )}
            {schema && listQuery.data && !group && gridFor(rows, (page - 1) * perPage + 1)}
            {schema && listQuery.data && group && (
              <div className="space-y-4" data-testid="studio-groups">
                {groupRows(rows, group).map(([value, groupItems]) => {
                  const field = schema.fields.find((f) => f.name === group);
                  return (
                    <section key={value ?? "__none"} data-testid="studio-group-section" className="space-y-1">
                      <h3 className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{field ? fieldLabel(field) : group}</span>
                        {value === null ? (
                          <span className="text-muted-foreground">Empty</span>
                        ) : field ? (
                          <CellValue field={field} value={value} />
                        ) : (
                          value
                        )}
                        <span className="text-xs text-muted-foreground">{groupItems.length}</span>
                      </h3>
                      {gridFor(groupItems, rows.indexOf(groupItems[0]!) + (page - 1) * perPage + 1, `${schema.label ?? resource}: ${value ?? "empty"}`, false)}
                    </section>
                  );
                })}
              </div>
            )}
            {listQuery.data && (
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground" data-testid="studio-footer">
                <span>
                  {total.toLocaleString()} record{total === 1 ? "" : "s"}
                </span>
                {pageCount > 1 && (
                  <span className="ml-auto flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" disabled={page <= 1} onClick={() => navigate({ page: page - 1 })} aria-label="Previous page">
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    Page {page} of {pageCount}
                    <Button type="button" variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => navigate({ page: page + 1 })} aria-label="Next page">
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {schema && location.record && (
        <RecordPanel
          provider={provider}
          sessionKey={sessionKey}
          schema={schema}
          id={location.record}
          onClose={() => navigate({ record: undefined })}
          onOpenRecord={openRecord}
          formConfig={formConfig}
          onUndone={(audit) => {
            refresh();
            onActivity({ resource, field: "", record: location.record!, outcome: "saved", message: "Undone, with its own audit entry.", ...(audit ? { audit, undone: true } : {}) });
          }}
          onSaved={(row, audit) => {
            refresh();
            onActivity({ resource, field: Object.keys(audit?.after ?? {}).join(", "), record: location.record!, outcome: "saved", message: audit ? "Saved, with its audit entry." : "Saved.", ...(audit ? { audit } : {}) });
            void row;
          }}
          onActionRan={(action, row, audit) => {
            refresh();
            onActivity({
              resource,
              field: "",
              record: location.record!,
              outcome: "saved",
              message: `${action.label}: done${row ? "" : ", and the row is gone"}${audit ? ", with its audit entry" : ""}.`,
              ...(audit ? { audit } : {}),
            });
          }}
          onDeleted={(audit) => {
            refresh();
            onActivity({ resource, field: "", record: location.record!, outcome: "saved", action: "delete", message: audit ? "Deleted, with its audit entry." : "Deleted.", ...(audit ? { audit } : {}) });
          }}
          onFailed={(action, message) =>
            onActivity({ resource, field: "", record: location.record!, outcome: "not_saved", action: action === "delete" ? "delete" : "update", message })
          }
        />
      )}
      {schema && bulkIds && (
        <BulkEditDialog
          schema={schema}
          count={bulkIds.length}
          open
          onOpenChange={(open) => !open && setBulkIds(null)}
          onApply={async (data) => {
            const chosen = rows.filter((r) => bulkIds.includes(keys.get(r) ?? ""));
            if (chosen.length !== bulkIds.length) {
              throw new Error("Some selected rows aren't on this page any more. Select the rows again.");
            }
            const result = await provider.updateMany!(resource, {
              changes: chosen.map((r) => ({ id: encodeRecordKey(schema, r), data, expectedVersion: versionOf(schema, r) })),
            });
            refresh();
            if (result.ok) {
              setNotice(`Saved ${result.count} rows in one transaction.`);
              (result.audit ?? []).forEach((audit) =>
                onActivity({ resource, field: Object.keys(data).join(", "), record: JSON.stringify(audit.key), outcome: "saved", message: "Saved, with its audit entry.", audit }),
              );
            }
            return result;
          }}
        />
      )}
      {schema && (
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" data-testid="studio-create-dialog">
            <DialogHeader>
              <DialogTitle>New {schema.label ?? resource} row</DialogTitle>
              <DialogDescription>Only fields you may set are shown. The new row is audited.</DialogDescription>
            </DialogHeader>
            <RecordForm
              provider={provider}
              sessionKey={sessionKey}
              mode="create"
              fields={fieldsForCreate}
              editable={createFields}
              onSubmit={create}
              submitLabel="Add row"
              onCancel={() => setCreating(false)}
              config={formConfig}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function versionOf(schema: ResourceSchema, row: Row): string | null {
  const field = schema.version?.field;
  return field && row[field] != null ? String(row[field]) : null;
}

const NO_ACTIONS = {
  update: async () => {
    throw new Error("Not available here.");
  },
  remove: async () => {
    throw new Error("Not available here.");
  },
  refetch: () => {},
};

/** Rows of one page split by a field's value, in the order they arrived. */
function groupRows(items: Row[], field: string): Array<[string | null, Row[]]> {
  const groups = new Map<string | null, Row[]>();
  for (const item of items) {
    const value = displayText(item[field]);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value)!.push(item);
  }
  return [...groups.entries()];
}

function schemaSubtitle(schema: ResourceSchema | undefined, editable: number): string | undefined {
  if (!schema) return undefined;
  const parts = [schema.name];
  if (schema.access.update) parts.push(`${editable} of ${schema.fields.length} fields editable`);
  if (schema.version) parts.push(`edits checked against ${schema.version.field}`);
  return parts.join(" · ");
}

const OUTCOME_LABEL = {
  update: { saved: "Saved", not_saved: "Not saved" },
  create: { saved: "Added", not_saved: "Not added" },
  delete: { saved: "Deleted", not_saved: "Not deleted" },
} as const;

function ActivityPanel({ entries, onUndo }: { entries: StudioActivity[]; onUndo?: (entry: StudioActivity) => void }) {
  return (
    <details aria-label="This session's edits" className="group rounded-lg border bg-card" data-testid="studio-activity">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium group-open:border-b">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden />
        This session's edits
        {entries.length > 0 && <span className="text-xs font-normal text-muted-foreground">{entries.length}</span>}
        {entries[0] && (
          <span className={cn("ml-2 truncate text-xs font-normal", entries[0].outcome === "saved" ? "text-muted-foreground" : "text-destructive")}>
            {entries[0].message}
          </span>
        )}
      </summary>
      {entries.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          Click a cell to edit it. Each save is checked against the latest version of the row, and audited.
        </p>
      ) : (
        <ol className="divide-y" aria-live="polite">
          {entries.map((entry) => (
            <li key={entry.id} className="px-3 py-2 text-xs" data-testid={`studio-activity-${entry.outcome}`}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={entry.outcome === "saved" ? "font-medium text-foreground" : "font-medium text-destructive"}>
                  {OUTCOME_LABEL[entry.action ?? "update"][entry.outcome]}
                </span>
                <span className="text-muted-foreground">
                  {[entry.resource, entry.field, entry.record].filter(Boolean).join(" · ")}
                </span>
                <time className="ml-auto text-muted-foreground" dateTime={entry.at.toISOString()}>
                  {entry.at.toLocaleTimeString()}
                </time>
                {onUndo && entry.outcome === "saved" && entry.audit && entry.audit.action !== "run" && !entry.undone && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onUndo(entry)}
                    data-testid="studio-activity-undo"
                  >
                    <Undo2 className="h-3 w-3" aria-hidden />
                    Undo
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-muted-foreground">{entry.message}</p>
              {entry.audit && <AuditLine audit={entry.audit} />}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

function AuditLine({ audit }: { audit: AuditEntry }) {
  const changes = Object.keys(audit.after ?? {}).map((field) => ({
    field,
    before: displayText(audit.before?.[field]) ?? "—",
    after: displayText(audit.after?.[field]) ?? "—",
  }));
  return (
    <div className="mt-1 rounded bg-muted/50 px-2 py-1 font-mono text-[11px]" data-testid="studio-audit-entry">
      <div className="text-muted-foreground">
        audit {audit.id.slice(0, 8)} · {audit.occurredAt} · by {audit.actor ?? "unknown"}
      </div>
      {changes.map((c) => (
        <div key={c.field}>
          {c.field}: {c.before} → {c.after}
        </div>
      ))}
    </div>
  );
}
