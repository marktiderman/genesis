import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, Play, Trash2 } from "lucide-react";
import type { BaseRecord, DataProvider } from "@marktiderman/genesis-core/provider";
import {
  encodeRecordKey,
  isDataWriteError,
  type AuditEntry,
  type ResourceRelation,
  type ResourceSchema,
  type RowAction,
} from "@marktiderman/genesis-core/schema";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@marktiderman/genesis-ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@marktiderman/genesis-ui/alert-dialog";
import { Button } from "@marktiderman/genesis-ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@marktiderman/genesis-ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@marktiderman/genesis-ui/tabs";
import { singleKey, useSchema } from "../lib/relations";
import { displayText } from "../values";
import { RecordForm } from "./RecordForm";
import type { StudioFormConfig } from "../lib/form-config";

export interface RecordPanelProps {
  provider: DataProvider;
  sessionKey: unknown;
  schema: ResourceSchema;
  /** The record's id (`encodeRecordKey`). */
  id: string;
  onClose: () => void;
  /** Open another record (a related one), in its own table. */
  onOpenRecord: (resource: string, id: string) => void;
  onSaved: (row: Record<string, unknown>, audit?: AuditEntry) => void;
  onDeleted: (audit?: AuditEntry) => void;
  onFailed: (action: string, message: string) => void;
  /** A change from the History tab was undone. */
  onUndone?: (audit?: AuditEntry) => void;
  /** Sections and conditional fields for the form. */
  formConfig?: StudioFormConfig;
  /** A row action ran; `row` is null when it removed the row. */
  onActionRan?: (action: RowAction, row: Record<string, unknown> | null, audit?: AuditEntry) => void;
}

function versionOf(schema: ResourceSchema, row: Record<string, unknown> | undefined): string | null {
  const field = schema.version?.field;
  if (!field || !row || row[field] == null) return null;
  return String(row[field]);
}

/**
 * One record, in a side panel: its fields as a form, the records it links to
 * and from, and its audit history. The URL names it, so the link copies.
 */
export function RecordPanel(props: RecordPanelProps) {
  const { provider, sessionKey, schema, id } = props;
  const queryClient = useQueryClient();
  const recordKey = ["genesis-studio", sessionKey, "record", schema.name, id];
  const record = useQuery({
    queryKey: recordKey,
    retry: false,
    queryFn: async () => (await provider.getOne<BaseRecord>(schema.name, { id })).data as Record<string, unknown>,
  });
  const [conflict, setConflict] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const row = record.data;
  const title = row ? (displayText(row[schema.labelField ?? ""]) ?? id) : id;
  const editable = useMemo(() => new Set(schema.fields.filter((f) => f.permissions?.update).map((f) => f.name)), [schema]);
  const relations = schema.relations ?? [];

  async function save(values: Record<string, unknown>) {
    setConflict(null);
    try {
      const result = await provider.update<BaseRecord>(schema.name, { id, data: values as never, expectedVersion: versionOf(schema, row) });
      queryClient.setQueryData(recordKey, result.data);
      props.onSaved(result.data as Record<string, unknown>, result.audit);
    } catch (error) {
      if (isDataWriteError(error) && error.outcome === "conflict") {
        setConflict(error.message);
        if (error.current) {
          queryClient.setQueryData(recordKey, {
            ...row,
            ...error.current,
            ...(schema.version ? { [schema.version.field]: error.currentVersion ?? null } : {}),
          });
        } else {
          void record.refetch();
        }
      }
      props.onFailed("update", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async function remove() {
    try {
      const result = await provider.deleteOne(schema.name, { id, expectedVersion: versionOf(schema, row) });
      props.onDeleted(result.audit);
      props.onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConflict(message);
      props.onFailed("delete", message);
      void record.refetch();
    }
  }

  const [running, setRunning] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<RowAction | null>(null);
  async function runAction(action: RowAction) {
    setConflict(null);
    setRunning(action.name);
    try {
      const result = await provider.runAction!(schema.name, { id, action: action.name, expectedVersion: versionOf(schema, row) });
      props.onActionRan?.(action, result.data, result.audit);
      if (result.data) queryClient.setQueryData(recordKey, result.data);
      else props.onClose();
      void queryClient.invalidateQueries({ queryKey: ["genesis-studio", sessionKey, "history", schema.name, id] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConflict(message);
      props.onFailed(`action:${action.name}`, message);
      void record.refetch();
    } finally {
      setRunning(null);
    }
  }
  const actions = provider.runAction ? (schema.actions ?? []) : [];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl" data-testid="studio-record-panel">
        <SheetHeader>
          <SheetTitle className="truncate pr-8">{title}</SheetTitle>
          <SheetDescription>
            {schema.label ?? schema.name} · <span className="font-mono text-xs">{id}</span>
          </SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copyLink} testID="studio-copy-link">
            <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {copied ? "Link copied" : "Copy link"}
          </Button>
          {schema.access.delete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" testID="studio-delete">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {title}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The deletion is audited. It only goes through if nobody has changed the row since you opened it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void remove()} data-testid="studio-delete-confirm">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled title={schema.access.reasons?.delete}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Delete
            </Button>
          )}
          {actions.map((action) => (
            <Button
              key={action.name}
              type="button"
              variant="outline"
              size="sm"
              disabled={!row || running !== null}
              title={action.description}
              onClick={() => (action.confirm ? setConfirming(action) : void runAction(action))}
              testID={`studio-action-${action.name}`}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {running === action.name ? `${action.label}…` : action.label}
            </Button>
          ))}
        </div>
        <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirming?.confirm}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirming?.description ? `${confirming.description} ` : ""}It runs on this row as you see it now, and is audited.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const action = confirming;
                  setConfirming(null);
                  if (action) void runAction(action);
                }}
                data-testid="studio-action-confirm"
              >
                {confirming?.label}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {conflict && (
          <Alert variant="destructive" className="mt-3" data-testid="studio-record-conflict">
            <AlertTitle>Not saved</AlertTitle>
            <AlertDescription>{conflict} The form now shows the row as it is.</AlertDescription>
          </Alert>
        )}

        {record.isError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Couldn't open this record</AlertTitle>
            <AlertDescription>{record.error instanceof Error ? record.error.message : String(record.error)}</AlertDescription>
          </Alert>
        ) : (
          <Tabs defaultValue="details" className="mt-4">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              {relations.length > 0 && <TabsTrigger value="related">Related ({relations.length})</TabsTrigger>}
              <TabsTrigger value="history" disabled={!schema.access.history} title={schema.access.reasons?.history}>
                History
              </TabsTrigger>
              {schema.access.comment !== undefined && provider.comments && (
                <TabsTrigger value="comments" disabled={!schema.access.comment} title={schema.access.reasons?.comment}>
                  Comments
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="details" className="pt-2">
              {row ? (
                <RecordForm
                  provider={provider}
                  sessionKey={sessionKey}
                  mode="edit"
                  fields={schema.fields}
                  editable={editable}
                  row={row}
                  onSubmit={save}
                  submitLabel="Save changes"
                  config={props.formConfig}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
            </TabsContent>
            {relations.length > 0 && (
              <TabsContent value="related" className="space-y-5 pt-2">
                {row &&
                  relations.map((relation) => (
                    <RelatedSection
                      key={`${relation.kind}:${relation.resource}:${relation.field}`}
                      provider={provider}
                      sessionKey={sessionKey}
                      schema={schema}
                      row={row}
                      relation={relation}
                      onOpenRecord={props.onOpenRecord}
                    />
                  ))}
              </TabsContent>
            )}
            {schema.access.history && (
              <TabsContent value="history" className="pt-2">
                <History
                  provider={provider}
                  sessionKey={sessionKey}
                  resource={schema.name}
                  id={id}
                  onUndone={(audit) => {
                    void record.refetch();
                    props.onUndone?.(audit);
                  }}
                />
              </TabsContent>
            )}
            {schema.access.comment && provider.comments && (
              <TabsContent value="comments" className="pt-2">
                <Comments provider={provider} sessionKey={sessionKey} resource={schema.name} id={id} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RelatedSection({
  provider,
  sessionKey,
  schema,
  row,
  relation,
  onOpenRecord,
}: {
  provider: DataProvider;
  sessionKey: unknown;
  schema: ResourceSchema;
  row: Record<string, unknown>;
  relation: ResourceRelation;
  onOpenRecord: (resource: string, id: string) => void;
}) {
  const target = useSchema(provider, sessionKey, relation.resource);
  const ownKey = singleKey(schema);
  const query = useQuery({
    queryKey: ["genesis-studio", sessionKey, "related", schema.name, relation.kind, relation.resource, relation.field, row[ownKey ?? ""]],
    enabled: Boolean(target.data),
    retry: false,
    queryFn: async (): Promise<Record<string, unknown>[]> => {
      const targetKey = singleKey(target.data);
      if (relation.kind === "one") {
        const value = row[relation.field];
        if (value == null || !targetKey) return [];
        const r = await provider.getList<BaseRecord>(relation.resource, {
          pagination: { page: 1, perPage: 1 },
          filters: [{ field: targetKey, operator: "eq", value: String(value) }],
        });
        return r.data as Record<string, unknown>[];
      }
      const self = row[ownKey ?? ""];
      if (self == null) return [];
      if (relation.kind === "many") {
        const r = await provider.getList<BaseRecord>(relation.resource, {
          pagination: { page: 1, perPage: 25 },
          filters: [{ field: relation.field, operator: "eq", value: String(self) }],
        });
        return r.data as Record<string, unknown>[];
      }
      // through: the junction's rows for this record, then the rows they point at.
      const links = await provider.getList<BaseRecord>(relation.through!.resource, {
        pagination: { page: 1, perPage: 100 },
        filters: [{ field: relation.field, operator: "eq", value: String(self) }],
      });
      const ids = (links.data as Record<string, unknown>[]).map((l) => String(l[relation.through!.otherField]));
      if (!ids.length || !targetKey) return [];
      const r = await provider.getList<BaseRecord>(relation.resource, {
        pagination: { page: 1, perPage: Math.min(100, ids.length) },
        filters: [{ field: targetKey, operator: "in", value: ids }],
      });
      return r.data as Record<string, unknown>[];
    },
  });
  const heading = `${target.data?.label ?? relation.resource}${
    relation.kind === "one" ? ` (via ${relation.field})` : relation.kind === "through" ? ` (via ${relation.through!.resource})` : ""
  }`;
  const labelField = target.data?.labelField;

  return (
    <section data-testid={`studio-related-${relation.resource}`}>
      <h3 className="mb-1.5 text-sm font-semibold">{heading}</h3>
      {query.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !query.data?.length ? (
        <p className="text-xs text-muted-foreground">None you can see.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {query.data.map((related, index) => {
            const relatedId = target.data ? String(encodeRecordKey(target.data, related)) : String(index);
            return (
              <li key={relatedId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => onOpenRecord(relation.resource, relatedId)}
                >
                  <span className="truncate">{displayText(related[labelField ?? ""]) ?? relatedId}</span>
                  <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function History({
  provider,
  sessionKey,
  resource,
  id,
  onUndone,
}: {
  provider: DataProvider;
  sessionKey: unknown;
  resource: string;
  id: string;
  onUndone: (audit?: AuditEntry) => void;
}) {
  const [undoError, setUndoError] = useState<string | null>(null);
  const history = useQuery({
    queryKey: ["genesis-studio", sessionKey, "history", resource, id],
    enabled: Boolean(provider.history),
    retry: false,
    queryFn: () => provider.history!(resource, { id }),
  });
  if (history.isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (history.isError) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {history.error instanceof Error ? history.error.message : String(history.error)}
      </p>
    );
  }
  if (!history.data?.length) return <p className="text-xs text-muted-foreground">No audited changes yet.</p>;
  async function undo(entry: AuditEntry) {
    setUndoError(null);
    try {
      const result = await provider.undo!(resource, { auditId: entry.id });
      void history.refetch();
      onUndone(result.audit);
    } catch (error) {
      setUndoError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <>
    {undoError && (
      <p role="alert" className="mb-2 text-xs text-destructive" data-testid="studio-undo-error">
        {undoError}
      </p>
    )}
    <ol className="space-y-2" data-testid="studio-history">
      {history.data.map((entry) => {
        const fields = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])];
        return (
          <li key={entry.id} className="rounded-md border p-2 text-xs">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium capitalize">{entry.action === "run" ? `Ran ${entry.rowAction ?? "an action"}` : entry.action}</span>
              <span className="text-muted-foreground">by {entry.actor ?? "unknown"}</span>
              <time className="ml-auto text-muted-foreground">{entry.occurredAt}</time>
              {provider.undo && entry.action !== "run" && (
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => void undo(entry)}
                  title="Put this change back. Refused if the row has changed since."
                  data-testid="studio-history-undo"
                >
                  Undo
                </button>
              )}
            </div>
            <div className="mt-1 font-mono text-[11px]">
              {fields.map((field) => (
                <div key={field}>
                  {field}: {displayText(entry.before?.[field]) ?? "—"} → {displayText(entry.after?.[field]) ?? "—"}
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
    </>
  );
}

function Comments({
  provider,
  sessionKey,
  resource,
  id,
}: {
  provider: DataProvider;
  sessionKey: unknown;
  resource: string;
  id: string;
}) {
  const queryClient = useQueryClient();
  const key = ["genesis-studio", sessionKey, "comments", resource, id];
  const comments = useQuery({ queryKey: key, retry: false, queryFn: () => provider.comments!(resource, { id }) });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post() {
    if (!draft.trim() || !provider.addComment) return;
    setBusy(true);
    setError(null);
    try {
      await provider.addComment(resource, { id, body: draft });
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="studio-comments">
      {comments.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : comments.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {comments.error instanceof Error ? comments.error.message : String(comments.error)}
        </p>
      ) : !comments.data?.length ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ol className="space-y-2">
          {comments.data.map((c) => (
            <li key={c.id} className="rounded-md border p-2 text-sm">
              <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author}</span>
                <time className="ml-auto">{c.createdAt}</time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      {provider.addComment && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
        >
          <Textarea
            aria-label="New comment"
            value={draft}
            maxLength={10000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy || !draft.trim()} testID="studio-comment-post">
              {busy ? "Posting…" : "Comment"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
