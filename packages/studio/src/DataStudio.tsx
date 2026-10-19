import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, History, Lock, Maximize2, PencilLine, Table2, Trash2, Undo2 } from "lucide-react";
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
import { DataTable, ResourcePage, useSavedViews, type ResourceColumnDef } from "@marktiderman/genesis-ui/data";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@marktiderman/genesis-ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@marktiderman/genesis-ui/alert";
import { cn } from "@marktiderman/genesis-ui/utils";
import type { StudioLocation, StudioRouter } from "./router";
import { choicesFor, displayText, editText, parseDraft } from "./values";
import { exportCsv, downloadText } from "./lib/csv";
import { formatFilters, formatSorts, parseFilters, parseSorts } from "./lib/query-state";
import { usePageLinkLabels } from "./lib/relations";
import { RecordForm } from "./record/RecordForm";
import { RecordPanel } from "./record/RecordPanel";
import { ExportButton, FilterBuilder, GroupPicker, NewRowButton, SortBuilder, ViewSwitch } from "./toolbar/Toolbar";
import { ImportDialog } from "./toolbar/ImportDialog";
import { BulkEditDialog } from "./toolbar/BulkEdit";
import { SheetView } from "./sheet/SheetView";
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
  /** URL state, from the app's router. See `createSearchParamsRouter` and `useHistoryRouter`. */
  router: StudioRouter;
  /** Shown in place of the studio while nobody is signed in. */
  signIn?: ReactNode;
  /**
   * Changes when the signed-in user does (their id, say). The studio drops
   * everything it loaded for the previous user and asks again.
   */
  sessionKey?: string | number | null;
  /** Heading above the table list. Default "Data". */
  title?: string;
  /** Rows per page. Default 25. */
  perPage?: number;
  /**
   * Record-form layout per resource (`schema.table`): sections, and fields
   * shown only when a condition holds. Code first; see `StudioFormConfig`.
   */
  forms?: Readonly<Record<string, StudioFormConfig>>;
  className?: string;
}

const PER_PAGE = 25;
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
  return (
    <GenesisProvider provider={props.provider}>
      <StudioWorkspace {...props} />
    </GenesisProvider>
  );
}

function StudioWorkspace({
  provider,
  router,
  signIn,
  sessionKey = null,
  title = "Data",
  perPage = PER_PAGE,
  forms,
  className,
}: DataStudioProps) {
  const queryClient = useQueryClient();
  const [activity, setActivity] = useState<StudioActivity[]>([]);
  const [signedOut, setSignedOut] = useState(false);

  // A new user sees nothing the previous one loaded.
  useEffect(() => {
    setSignedOut(false);
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
    <div className={cn("flex min-h-[480px] w-full flex-col gap-4 lg:flex-row", className)} data-testid="studio">
      <TableSidebar
        title={title}
        resources={list}
        selected={selected}
        loading={resources.isLoading}
        error={resources.isError ? errorText(resources.error) : null}
        onSelect={(resource) => router.navigate({ resource })}
      />
      <main className="min-w-0 flex-1 space-y-4" data-testid="studio-main">
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
              const latest = activity.find((e) => e.resource === selected && e.outcome === "saved" && e.audit && !e.undone);
              if (latest) void undo(latest);
            }}
          />
        ) : (
          <div
            className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-muted-foreground"
            data-testid="studio-empty"
          >
            <Table2 className="h-6 w-6" aria-hidden />
            <p className="text-sm">{list.length ? "Pick a table to open it." : "No tables to show yet."}</p>
          </div>
        )}
        <ActivityPanel entries={activity} onUndo={provider.undo ? (entry) => void undo(entry) : undefined} />
      </main>
    </div>
  );
}

function TableSidebar({
  title,
  resources,
  selected,
  loading,
  error,
  onSelect,
}: {
  title: string;
  resources: ResourceSummary[];
  selected?: string;
  loading: boolean;
  error: string | null;
  onSelect: (resource: string) => void;
}) {
  return (
    <nav aria-label="Tables" className="w-full shrink-0 self-start rounded-lg border bg-card lg:w-56" data-testid="studio-sidebar">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
        <Database className="h-4 w-4 text-muted-foreground" aria-hidden />
        {title}
      </div>
      {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Loading tables…</p>}
      {error && (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <ul className="p-1">
        {resources.map((r) => {
          const active = r.name === selected;
          return (
            <li key={r.name}>
              <button
                type="button"
                onClick={() => onSelect(r.name)}
                aria-current={active ? "page" : undefined}
                title={r.access.update ? r.name : `${r.name} — ${r.access.reason ?? "Read-only"}`}
                data-testid={`studio-table-${r.name}`}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <span className="truncate">{r.label ?? r.name}</span>
                {!r.access.update && (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Read-only" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
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
  const sheetView = location.view === "sheet";
  const savedViews = useSavedViews(`genesis-studio:views:${resource}`);

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

  const save = useCallback(
    async (field: FieldSchema, row: Row, draft: string) => {
      if (!schema) return;
      if (draft === editText(row[field.name])) return; // nothing changed
      const recordLabel = keys.get(row) ?? "";
      const versionField = schema.version?.field;
      const expectedVersion = versionField ? (row[versionField] == null ? null : String(row[versionField])) : null;
      try {
        const result = await provider.update<BaseRecord>(resource, {
          id: encodeRecordKey(schema, row),
          data: { [field.name]: parseDraft(field, draft) },
          expectedVersion,
        });
        replaceRow(row, result.data as Row);
        void queryClient.invalidateQueries({ queryKey: ["genesis-studio", sessionKey, "record", resource] });
        onActivity({
          resource,
          field: field.name,
          record: recordLabel,
          outcome: "saved",
          message: result.audit ? "Saved, with its audit entry." : "Saved.",
          ...(result.audit ? { audit: result.audit } : {}),
        });
      } catch (error) {
        if (isUnauthenticated(error)) onSignedOut();
        if (isDataWriteError(error) && error.outcome === "conflict") {
          if (error.current) {
            // Show the row as it is now, so the next edit starts from their change.
            replaceRow(row, {
              ...row,
              ...error.current,
              ...(versionField ? { [versionField]: error.currentVersion ?? null } : {}),
            });
          } else {
            refresh();
          }
        }
        if (isDataWriteError(error) && error.outcome === "gone") refresh();
        onActivity({ resource, field: field.name, record: recordLabel, outcome: "not_saved", message: errorText(error) });
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    [schema, keys, provider, resource, replaceRow, onActivity, onSignedOut, queryClient, sessionKey, refresh],
  );

  const openRecord = useCallback(
    (target: string, id: string) =>
      target === resource ? navigate({ record: id }) : router.navigate({ resource: target, record: id }),
    [navigate, router, resource],
  );

  const columns = useMemo<ResourceColumnDef<Row>[]>(() => {
    if (!schema) return [];
    const open: ResourceColumnDef<Row> = {
      key: "__genesis_open",
      header: "",
      sortable: false,
      accessor: () => "",
      render: (row: Row) => (
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Open record"
          title="Open record"
          onClick={(e) => {
            e.stopPropagation();
            navigate({ record: keys.get(row) });
          }}
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      ),
    };
    return [
      ...(keyed ? [open] : []),
      ...schema.fields.map((field) => {
        const options = choicesFor(field);
        const labels = linkLabels.get(field.name);
        // Links are edited in the record's form, with a picker; a bare id in a cell is a trap.
        const inlineEditable = field.permissions?.update && !field.references;
        return {
          key: field.name,
          header: field.name,
          sortable: capabilities?.sort !== false,
          accessor: (row: Row) => editText(row[field.name]),
          render: (row: Row) => {
            const raw = row[field.name];
            const text = displayText(raw);
            if (text === null) return <span className="text-muted-foreground">—</span>;
            const label = field.references ? labels?.get(String(raw)) : undefined;
            const reason = !field.permissions?.update ? field.permissions?.reason : undefined;
            return (
              <span className="block max-w-[320px] truncate" title={reason ? `${text} — ${reason}` : text}>
                {label ?? text}
                {label && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{text}</span>}
              </span>
            );
          },
          ...(inlineEditable
            ? {
                editable: {
                  type: options ? ("select" as const) : ("text" as const),
                  ...(options ? { options } : {}),
                  onSave: (row: Row, draft: string) => save(field, row, draft),
                },
              }
            : {}),
        };
      }),
    ];
  }, [schema, save, keyed, keys, navigate, linkLabels, capabilities]);

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
      onActivity({ resource, field: "", record: id, outcome: "saved", action: "create", message: "Added, with its audit entry.", ...(result.audit ? { audit: result.audit } : {}) });
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
  const createFields = new Set(schema?.createFields ?? []);
  const fieldsForCreate = schema?.fields.filter((f) => createFields.has(f.name)) ?? [];

  const tableFor = (items: Row[]) => (
    <DataTable<Row>
      items={items}
      columns={columns.map((c) => ({
        key: c.key,
        header: c.header ?? c.key,
        sortable: false,
        render: c.render ? (item: Row, value: unknown) => c.render!(item, value, NO_ACTIONS) : undefined,
        accessor: c.accessor,
        editable: c.editable,
      }))}
      getKey={(row) => keys.get(row) ?? ""}
      pagination={false}
      columnVisibility={false}
      density="compact"
    />
  );

  return (
    <div className="space-y-3" data-testid="studio-sheet">
      {schema && !schema.access.update && (
        <Alert data-testid="studio-read-only">
          <Lock className="h-4 w-4" aria-hidden />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>{schema.access.reason ?? "You can view this table but not edit it."}</AlertDescription>
        </Alert>
      )}
      {schema && (
        <div className="flex flex-wrap items-center gap-2" data-testid="studio-toolbar">
          {(capabilities?.filterOperators?.length ?? 1) > 0 && (
            <FilterBuilder fields={schema.fields} filters={filters} onChange={(next) => navigate({ filters: formatFilters(next), page: 1 })} />
          )}
          {capabilities?.multiSort !== false && capabilities?.sort !== false && (
            <SortBuilder fields={schema.fields} sorts={sorts} onChange={(next) => navigate({ sort: formatSorts(next), page: 1 })} />
          )}
          <ViewSwitch view={sheetView ? "sheet" : "table"} onChange={(next) => navigate({ view: next === "sheet" ? "sheet" : undefined })} />
          {!sheetView && (
            <GroupPicker fields={schema.fields} group={group} onChange={(next) => navigate({ group: next, page: 1 })} />
          )}
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
            <NewRowButton allowed={Boolean(schema.access.create)} reason={schema.access.reasons?.create} onClick={() => setCreating(true)} />
          )}
        </div>
      )}
      {notice && (
        <p className="text-xs text-muted-foreground" role="status" data-testid="studio-notice">
          {notice}
        </p>
      )}
      <ResourcePage<Row>
        key={viewEpoch}
        title={schema?.label ?? resource}
        subtitle={schemaSubtitle(schema, editable)}
        data={rows}
        total={listQuery.data?.total ?? 0}
        columns={columns}
        getKey={(row) => keys.get(row) ?? ""}
        detail="none"
        page={page}
        perPage={perPage}
        onPageChange={(next) => navigate({ page: next })}
        onSortChange={(next) => navigate({ sort: formatSorts(next ? [next] : []), page: 1 })}
        onSearchChange={(text) => {
          clearTimeout(searchTimer.current);
          searchTimer.current = setTimeout(() => navigate({ search: text || undefined, page: 1 }, true), SEARCH_DEBOUNCE_MS);
        }}
        // Seed the search box and sort control from the URL, so a deep link
        // or a reload shows why the rows are filtered. Sheet remounts per
        // table, so mount-time seeding is enough.
        initialFilters={[
          ...(search ? [{ field: "__search__", operator: "contains" as const, value: search }] : []),
          ...(sorts[0] ? [{ field: "__sort__", operator: "eq" as const, value: `${sorts[0].field}:${sorts[0].order}` }] : []),
        ]}
        capabilities={capabilities}
        renderTable={
          sheetView && schema
            ? (items: Row[]) => (
                <SheetView
                  provider={provider}
                  schema={schema}
                  rows={items}
                  keys={keys}
                  linkLabels={linkLabels}
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
              )
            : group
            ? (items: Row[]) => (
                <div className="space-y-4" data-testid="studio-groups">
                  {groupRows(items, group).map(([value, groupItems]) => (
                    <section key={value ?? "__none"} data-testid="studio-group-section">
                      <h3 className="mb-1.5 text-sm font-semibold">
                        {group}: {value ?? "—"} <span className="font-normal text-muted-foreground">({groupItems.length} on this page)</span>
                      </h3>
                      {tableFor(groupItems)}
                    </section>
                  ))}
                </div>
              )
            : undefined
        }
        bulkActions={
          schema && !sheetView && keyed
            ? [
                ...(schema.access.update && provider.updateMany
                  ? [{ label: "Set a field…", icon: PencilLine, testId: "studio-bulk-set", onAction: (ids: string[]) => setBulkIds(ids) }]
                  : []),
                ...(schema.access.delete && provider.deleteMany
                  ? [
                      {
                        label: "Delete",
                        icon: Trash2,
                        variant: "destructive" as const,
                        testId: "studio-bulk-delete",
                        onAction: async (ids: string[]) => {
                          if (!window.confirm(`Delete ${ids.length} row${ids.length === 1 ? "" : "s"}? All of them go, or none do.`)) return;
                          const chosen = rows.filter((r) => ids.includes(keys.get(r) ?? ""));
                          const result = await provider.deleteMany!(resource, {
                            items: chosen.map((r) => ({ id: encodeRecordKey(schema, r), expectedVersion: versionOf(schema, r) })),
                          });
                          refresh();
                          if (result.ok) {
                            setNotice(`Deleted ${result.count} rows in one transaction.`);
                            onActivity({ resource, field: "", record: `${result.count} rows`, outcome: "saved", action: "delete", message: "Deleted, each row audited." });
                          } else {
                            const message = `Nothing was deleted: ${(result.failures ?? []).length} of ${ids.length} rows couldn't be (${result.failures?.[0]?.message ?? ""}).`;
                            setNotice(message);
                            onActivity({ resource, field: "", record: `${ids.length} rows`, outcome: "not_saved", action: "delete", message });
                          }
                        },
                      },
                    ]
                  : []),
              ]
            : undefined
        }
        savedViews={savedViews.savedViews}
        canSaveViews
        onSaveView={(name) => {
          let hidden: unknown = null;
          try {
            hidden = JSON.parse(localStorage.getItem(`dt-vis-genesis-studio:${resource}`) ?? "null");
          } catch {
            hidden = null;
          }
          savedViews.saveView(name, {
            sort: location.sort ?? null,
            search: location.search ?? null,
            filters: location.filters ?? null,
            group: location.group ?? null,
            columns: hidden,
          });
        }}
        onLoadView={(view) => {
          try {
            if (view.columns) localStorage.setItem(`dt-vis-genesis-studio:${resource}`, JSON.stringify(view.columns));
          } catch {
            // Column choices are a convenience; the view still applies without them.
          }
          router.navigate({
            resource,
            ...(typeof view.sort === "string" ? { sort: view.sort } : {}),
            ...(typeof view.search === "string" ? { search: view.search } : {}),
            ...(typeof view.filters === "string" ? { filters: view.filters } : {}),
            ...(typeof view.group === "string" ? { group: view.group } : {}),
          });
          setViewEpoch((n) => n + 1);
        }}
        onDeleteView={savedViews.deleteView}
        loading={schemaQuery.isLoading || listQuery.isLoading}
        error={listQuery.isError && !isUnauthenticated(listQuery.error)}
        errorMessage={listQuery.error ? errorText(listQuery.error) : undefined}
        onRetry={() => void listQuery.refetch()}
        columnVisibilityKey={`genesis-studio:${resource}`}
        resizeKey={`genesis-studio:${resource}`}
        viewSettingsKey={`genesis-studio:${resource}`}
        stickyFirstColumn
      />
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
          onDeleted={(audit) => {
            refresh();
            onActivity({ resource, field: "", record: location.record!, outcome: "saved", action: "delete", message: "Deleted, with its audit entry.", ...(audit ? { audit } : {}) });
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
    <section aria-label="This session's edits" className="rounded-lg border bg-card" data-testid="studio-activity">
      <h2 className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden />
        This session's edits
      </h2>
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
                {onUndo && entry.outcome === "saved" && entry.audit && !entry.undone && (
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
    </section>
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
