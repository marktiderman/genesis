import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, History, Lock, Table2 } from "lucide-react";
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
import { ResourcePage, type ResourceColumnDef } from "@marktiderman/genesis-ui/data";
import { Alert, AlertDescription, AlertTitle } from "@marktiderman/genesis-ui/alert";
import { cn } from "@marktiderman/genesis-ui/utils";
import type { StudioLocation, StudioRouter } from "./router";
import { choicesFor, displayText, editText, parseDraft } from "./values";

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
  message: string;
  /** Present when the edit committed with an audit entry from the `table` sink. */
  audit?: AuditEntry;
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
    <div className={cn("flex min-h-[480px] w-full flex-col gap-4 md:flex-row", className)} data-testid="studio">
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
        <ActivityPanel entries={activity} />
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
    <nav aria-label="Tables" className="w-full shrink-0 rounded-lg border bg-card md:w-60" data-testid="studio-sidebar">
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

function parseSort(sort: string | undefined): { field: string; order: "asc" | "desc" } | undefined {
  if (!sort) return undefined;
  const at = sort.lastIndexOf(":");
  const field = at > 0 ? sort.slice(0, at) : sort;
  const order = sort.slice(at + 1) === "desc" ? "desc" : "asc";
  return field ? { field, order } : undefined;
}

function Sheet({
  provider,
  resource,
  sessionKey,
  router,
  perPage,
  onActivity,
  onSignedOut,
}: {
  provider: DataProvider;
  resource: string;
  sessionKey: string | number | null;
  router: StudioRouter;
  perPage: number;
  onActivity: (entry: Omit<StudioActivity, "id" | "at">) => void;
  onSignedOut: () => void;
}) {
  const queryClient = useQueryClient();
  const { location } = router;
  const page = location.page ?? 1;
  const sort = parseSort(location.sort);
  const search = location.search ?? "";

  const schemaQuery = useQuery({
    queryKey: ["genesis-studio", sessionKey, "describe", resource],
    queryFn: () => {
      if (!provider.describe) throw new Error("This data provider can't describe its resources.");
      return provider.describe(resource);
    },
    retry: false,
  });
  const schema = schemaQuery.data;

  const listKey = useMemo(
    () => ["genesis-studio", sessionKey, "list", resource, page, perPage, location.sort ?? "", search],
    [sessionKey, resource, page, perPage, location.sort, search],
  );
  const listQuery = useQuery({
    queryKey: listKey,
    enabled: Boolean(schema),
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: () =>
      provider.getList<BaseRecord>(resource, {
        pagination: { page, perPage },
        sort,
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

  const replaceRow = useCallback(
    (oldRow: Row, next: Row) => {
      queryClient.setQueryData(listKey, (prev: { data: Row[]; total: number } | undefined) =>
        prev ? { ...prev, data: prev.data.map((r) => (r === oldRow ? next : r)) } : prev,
      );
    },
    [queryClient, listKey],
  );

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
        if (isDataWriteError(error) && error.outcome === "conflict" && error.current) {
          // Show the row as it is now, so the next edit starts from their change.
          replaceRow(row, {
            ...row,
            ...error.current,
            ...(versionField ? { [versionField]: error.currentVersion ?? null } : {}),
          });
        }
        if (isDataWriteError(error) && error.outcome === "gone") {
          void queryClient.invalidateQueries({ queryKey: listKey });
        }
        onActivity({ resource, field: field.name, record: recordLabel, outcome: "not_saved", message: errorText(error) });
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    [schema, keys, provider, resource, replaceRow, onActivity, onSignedOut, queryClient, listKey],
  );

  const columns = useMemo<ResourceColumnDef<Row>[]>(() => {
    if (!schema) return [];
    return schema.fields.map((field) => {
      const options = choicesFor(field);
      return {
        key: field.name,
        header: field.name,
        sortable: true,
        accessor: (row: Row) => editText(row[field.name]),
        render: (row: Row) => {
          const text = displayText(row[field.name]);
          return text === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="block max-w-[320px] truncate" title={text}>
              {text}
            </span>
          );
        },
        ...(field.permissions?.update
          ? {
              editable: {
                type: options ? ("select" as const) : ("text" as const),
                ...(options ? { options } : {}),
                onSave: (row: Row, draft: string) => save(field, row, draft),
              },
            }
          : {}),
      };
    });
  }, [schema, save]);

  if (schemaQuery.isError && !isUnauthenticated(schemaQuery.error)) {
    return (
      <Alert variant="destructive" data-testid="studio-describe-error">
        <AlertTitle>Couldn't open {resource}</AlertTitle>
        <AlertDescription>{errorText(schemaQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  const editable = schema?.fields.filter((f) => f.permissions?.update).length ?? 0;

  return (
    <div className="space-y-3" data-testid="studio-sheet">
      {schema && !schema.access.update && (
        <Alert data-testid="studio-read-only">
          <Lock className="h-4 w-4" aria-hidden />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>{schema.access.reason ?? "You can view this table but not edit it."}</AlertDescription>
        </Alert>
      )}
      <ResourcePage<Row>
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
        onSortChange={(next) => navigate({ sort: next ? `${next.field}:${next.order}` : undefined, page: 1 })}
        onSearchChange={(text) => {
          clearTimeout(searchTimer.current);
          searchTimer.current = setTimeout(() => navigate({ search: text || undefined, page: 1 }, true), SEARCH_DEBOUNCE_MS);
        }}
        loading={schemaQuery.isLoading || listQuery.isLoading}
        error={listQuery.isError && !isUnauthenticated(listQuery.error)}
        errorMessage={listQuery.error ? errorText(listQuery.error) : undefined}
        onRetry={() => void listQuery.refetch()}
        columnVisibilityKey={`genesis-studio:${resource}`}
        resizeKey={`genesis-studio:${resource}`}
        viewSettingsKey={`genesis-studio:${resource}`}
        stickyFirstColumn
      />
    </div>
  );
}

function schemaSubtitle(schema: ResourceSchema | undefined, editable: number): string | undefined {
  if (!schema) return undefined;
  const parts = [schema.name];
  if (schema.access.update) parts.push(`${editable} of ${schema.fields.length} fields editable`);
  if (schema.version) parts.push(`edits checked against ${schema.version.field}`);
  return parts.join(" · ");
}

function ActivityPanel({ entries }: { entries: StudioActivity[] }) {
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
                  {entry.outcome === "saved" ? "Saved" : "Not saved"}
                </span>
                <span className="text-muted-foreground">
                  {entry.resource} · {entry.field} · {entry.record}
                </span>
                <time className="ml-auto text-muted-foreground" dateTime={entry.at.toISOString()}>
                  {entry.at.toLocaleTimeString()}
                </time>
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
