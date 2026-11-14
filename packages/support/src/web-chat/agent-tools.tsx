/**
 * The help desk's tools for its agents, beside the inbox: `SupportSavedRepliesAdmin`, where a
 * tenant's saved replies are written (agents insert one with `!` in a reply), and
 * `SupportAgentReports`, the help desk's numbers over a date range. Both read and write through
 * the support client (migration 0014) and refuse no one themselves: the database does.
 *
 * Saved replies sit on genesis-ui's `InboxLayout` and `InboxPage`, as the help center's admin does;
 * the app keeps which one is open in its router (`replyId`: an id, `"new"`, or null). The report's
 * numbers are genesis-ui's `StatCard`s.
 *
 * @stability Beta
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Button,
  EmptyState,
  InboxLayout,
  InboxPage,
  Input,
  Label,
  Skeleton,
  Textarea,
  cn,
  type InboxItem,
} from "@marktiderman/genesis-ui";
import { StatCard } from "@marktiderman/genesis-ui/data";
import { SupportError, type SavedReply, type SupportClient } from "../client";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { waitedFor } from "./agent-inbox";
import { scopeOf, useResolvedTenant } from "./tenant";

export interface SupportSavedRepliesAdminProps {
  client: SupportClient;
  /** Whose saved replies. Null is the app's own. Left out, the client's `tenantId`, else the app's own. */
  tenantId?: string | null;
  /** The open saved reply, from the app's router: its id, `"new"`, or null. */
  replyId: string | null;
  onReplyChange: (id: string | null) => void;
  copy?: SupportCopyOverrides;
  /** Every refused or failed read and change, for reporting. */
  onError?: (error: unknown) => void;
  className?: string;
}

const NEW = "new";
const savedKeys = {
  all: ["genesis-support", "saved-replies"] as const,
  list: (scope: string) => ["genesis-support", "saved-replies", scope] as const,
};

function required<T>(method: T | undefined): NonNullable<T> {
  if (!method) throw new SupportError("This support client has no agent tools.", "0A000", "agentTools");
  return method as NonNullable<T>;
}

function savedFailure(error: unknown, copy: SupportCopy): string {
  const code = error instanceof SupportError ? error.code : undefined;
  if (code === "23505") return copy.savedReplies.titleTaken;
  if (code === "22023" || code === "23514") return copy.savedReplies.invalid;
  return copy.savedReplies.failed;
}

interface SavedEditorProps {
  client: SupportClient;
  tenantId: string | null;
  reply: SavedReply | null;
  copy: SupportCopy;
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onError: ((error: unknown) => void) | undefined;
}

/** Keyed by reply, so it never shows the last one's words. */
function SavedEditor({ client, tenantId, reply, copy, onSaved, onDeleted, onError }: SavedEditorProps) {
  const ids = { title: useId(), body: useId() };
  const [title, setTitle] = useState(reply?.title ?? "");
  const [body, setBody] = useState(reply?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ failed: boolean; text: string } | null>(null);
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!title.trim() || !body.trim()) {
      setMessage({ failed: true, text: copy.savedReplies.invalid });
      return;
    }
    setSaving(true);
    setMessage(null);
    required(client.saveSavedReply)({ id: reply?.id ?? null, tenantId, title: title.trim(), body })
      .then((id) => {
        setMessage({ failed: false, text: copy.savedReplies.saved });
        onSaved(id);
      })
      .catch((error: unknown) => {
        setMessage({ failed: true, text: savedFailure(error, copy) });
        onError?.(error);
      })
      .finally(() => setSaving(false));
  };
  const remove = () => {
    if (!reply) return;
    required(client.deleteSavedReply)(reply.id)
      .then(onDeleted)
      .catch((error: unknown) => {
        setMessage({ failed: true, text: savedFailure(error, copy) });
        onError?.(error);
      });
  };
  return (
    <form onSubmit={save} data-testid="genesis-support-saved-editor" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={ids.title}>{copy.savedReplies.title}</Label>
        <Input id={ids.title} value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} data-testid="genesis-support-saved-title" />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor={ids.body}>{copy.savedReplies.body}</Label>
        <Textarea id={ids.body} value={body} rows={10} maxLength={10000} aria-describedby={`${ids.body}-hint`} onChange={(e) => setBody(e.target.value)} data-testid="genesis-support-saved-body" />
        <p id={`${ids.body}-hint`} className="text-xs text-muted-foreground">
          {copy.savedReplies.bodyHint}
        </p>
      </div>
      {message ? (
        <p role={message.failed ? "alert" : "status"} data-testid="genesis-support-saved-message" className={message.failed ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving} aria-busy={saving} data-testid="genesis-support-saved-save">
          {saving ? copy.savedReplies.saving : copy.savedReplies.save}
        </Button>
        {reply ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" data-testid="genesis-support-saved-delete">
                {copy.savedReplies.delete}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{copy.savedReplies.deleteConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{copy.savedReplies.deleteConfirmBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{copy.savedReplies.cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={remove} data-testid="genesis-support-saved-delete-confirm">
                  {copy.savedReplies.delete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </form>
  );
}

/** A tenant's saved replies, for its agents: the list, and the one open for editing. */
export function SupportSavedRepliesAdmin(props: SupportSavedRepliesAdminProps) {
  const tenant = useResolvedTenant(props.client, props.tenantId);
  if (tenant.failed) return <EmptyState title={resolveSupportCopy(props.copy).savedReplies.errorTitle} description={resolveSupportCopy(props.copy).savedReplies.errorBody} />;
  if (!tenant.ready) return <Skeleton className="h-64 w-full" />;
  return <SavedRepliesAdmin key={scopeOf(props.client, tenant.tenantId)} {...props} tenantId={tenant.tenantId} />;
}

function SavedRepliesAdmin({ client, tenantId = null, replyId, onReplyChange, copy: copyOverrides, onError, className }: SupportSavedRepliesAdminProps) {
  const copy = useMemo(() => resolveSupportCopy(copyOverrides), [copyOverrides]);
  const queryClient = useQueryClient();
  const report = useRef(onError);
  report.current = onError;
  const scope = scopeOf(client, tenantId);
  const list = useQuery({ queryKey: savedKeys.list(scope), queryFn: () => required(client.savedReplies)({ tenantId }) });
  useEffect(() => {
    if (list.error) report.current?.(list.error);
  }, [list.error]);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: savedKeys.all });
  const items = useMemo<InboxItem[]>(() => (list.data ?? []).map((r) => ({ id: r.id, title: r.title, preview: r.body })), [list.data]);
  const opening = replyId && replyId !== NEW ? replyId : null;
  const open = opening ? (list.data ?? []).find((r) => r.id === opening) : undefined;

  const editor =
    replyId === NEW ? (
      <SavedEditor key="new" client={client} tenantId={tenantId} reply={null} copy={copy} onSaved={(id) => { refresh(); onReplyChange(id); }} onDeleted={() => onReplyChange(null)} onError={onError} />
    ) : opening && list.isPending ? (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    ) : open ? (
      <SavedEditor key={open.id} client={client} tenantId={tenantId} reply={open} copy={copy} onSaved={refresh} onDeleted={() => { refresh(); onReplyChange(null); }} onError={onError} />
    ) : (
      <div data-testid="genesis-support-saved-none">
        <EmptyState title={opening ? copy.savedReplies.notFound : copy.savedReplies.pickTitle} {...(opening ? {} : { description: copy.savedReplies.pickBody })} />
      </div>
    );

  return (
    <InboxLayout
      {...(className ? { className } : {})}
      testID="genesis-support-saved-admin"
      threadOpen={Boolean(replyId)}
      onBack={() => onReplyChange(null)}
      labels={{ list: copy.savedReplies.listLabel, thread: copy.savedReplies.body, back: copy.messenger.back }}
      list={
        <InboxPage
          testID="genesis-support-saved-list"
          header={
            <div className="border-b p-3">
              <Button onClick={() => onReplyChange(NEW)} data-testid="genesis-support-saved-new">
                {copy.savedReplies.newReply}
              </Button>
            </div>
          }
          items={items}
          selectedId={opening}
          onSelect={(id) => onReplyChange(id)}
          loading={list.isPending}
          error={list.isError}
          errorTitle={copy.savedReplies.errorTitle}
          errorBody={copy.savedReplies.errorBody}
          emptyTitle={copy.savedReplies.emptyTitle}
          emptyBody={copy.savedReplies.emptyBody}
          hasMore={false}
          label={copy.savedReplies.listLabel}
        />
      }
      thread={editor}
    />
  );
}

export interface SupportAgentReportsProps {
  client: SupportClient;
  /** Whose help desk. Null is the app's own. Left out, the client's `tenantId`, else the app's own. */
  tenantId?: string | null;
  /** The range's first day (controlled), `YYYY-MM-DD` in the viewer's zone. Default 30 days ago. */
  from?: string;
  /** Its last day, included. Default today. */
  to?: string;
  onRangeChange?: (range: { from: string; to: string }) => void;
  copy?: SupportCopyOverrides;
  /** Every refused or failed read, for reporting. */
  onError?: (error: unknown) => void;
  className?: string;
}

/** A day as `YYYY-MM-DD` in the viewer's own zone. */
function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The start of a `YYYY-MM-DD` day in the viewer's zone, or null for anything else. */
function startOf(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A median time as the row's short durations, or the copy's "none". */
function durationOf(seconds: number | null, copy: SupportCopy): string {
  if (seconds === null) return copy.reports.none;
  return waitedFor(new Date(0).toISOString(), copy, seconds * 1000);
}

/** The help desk's numbers over a range of days: opened, closed, median first response and time to close, open now and by customer. */
export function SupportAgentReports(props: SupportAgentReportsProps) {
  const tenant = useResolvedTenant(props.client, props.tenantId);
  if (tenant.failed) return <EmptyState title={resolveSupportCopy(props.copy).reports.errorTitle} description={resolveSupportCopy(props.copy).reports.errorBody} />;
  if (!tenant.ready) return <Skeleton className="h-40 w-full" />;
  return <AgentReports key={scopeOf(props.client, tenant.tenantId)} {...props} tenantId={tenant.tenantId} />;
}

function AgentReports({ client, tenantId = null, from: fromProp, to: toProp, onRangeChange, copy: copyOverrides, onError, className }: SupportAgentReportsProps) {
  const copy = useMemo(() => resolveSupportCopy(copyOverrides), [copyOverrides]);
  const ids = { from: useId(), to: useId() };
  const [own, setOwn] = useState(() => {
    const today = new Date();
    return { from: dayOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)), to: dayOf(today) };
  });
  const range = { from: fromProp ?? own.from, to: toProp ?? own.to };
  const change = (next: { from: string; to: string }) => {
    if (fromProp === undefined || toProp === undefined) setOwn(next);
    onRangeChange?.(next);
  };
  const start = startOf(range.from);
  const lastDay = startOf(range.to);
  // The last day counts whole: the range runs to the next day's start.
  const end = lastDay ? new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1) : null;
  const valid = Boolean(start && end && start < end && end.getTime() - start!.getTime() <= 366 * 86_400_000);
  const report = useQuery({
    queryKey: ["genesis-support", "agent-report", scopeOf(client, tenantId), range.from, range.to],
    queryFn: () => required(client.agentReport)({ tenantId, from: start, to: end }),
    enabled: valid,
  });
  const reported = useRef(onError);
  reported.current = onError;
  useEffect(() => {
    if (report.error) reported.current?.(report.error);
  }, [report.error]);

  const data = report.data;
  return (
    <section data-testid="genesis-support-reports" aria-busy={report.isFetching} className={cn("flex flex-col gap-4", className)}>
      <fieldset className="flex flex-wrap items-end gap-3">
        <legend className="sr-only">{copy.reports.rangeLabel}</legend>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.from}>{copy.reports.from}</Label>
          <Input id={ids.from} type="date" value={range.from} max={range.to} onChange={(e) => change({ ...range, from: e.target.value })} data-testid="genesis-support-reports-from" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.to}>{copy.reports.to}</Label>
          <Input id={ids.to} type="date" value={range.to} min={range.from} onChange={(e) => change({ ...range, to: e.target.value })} data-testid="genesis-support-reports-to" />
        </div>
      </fieldset>
      {!valid ? (
        <p role="alert" className="text-sm text-destructive" data-testid="genesis-support-reports-invalid">
          {copy.reports.invalidRange}
        </p>
      ) : report.isError ? (
        <EmptyState title={copy.reports.errorTitle} description={copy.reports.errorBody} />
      ) : !data ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label={copy.reports.opened} value={data.opened} />
            <StatCard label={copy.reports.closed} value={data.closed} color="success" />
            <StatCard label={copy.reports.openNow} value={data.openNow} color="info" />
            <StatCard label={copy.reports.firstResponse} value={durationOf(data.medianFirstResponseSeconds, copy)} color="muted" />
            <StatCard label={copy.reports.timeToClose} value={durationOf(data.medianCloseSeconds, copy)} color="muted" />
          </div>
          {data.byRequester.length ? (
            <section aria-labelledby={`${ids.from}-by`} className="flex flex-col gap-2" data-testid="genesis-support-reports-by-requester">
              <h3 id={`${ids.from}-by`} className="text-sm font-semibold">
                {copy.reports.byRequester}
              </h3>
              <ul className="flex flex-col divide-y rounded-md border">
                {data.byRequester.map((g) => (
                  <li key={g.label ?? ""} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="truncate">{g.label ?? copy.reports.unknownRequester}</span>
                    <span className="tabular-nums" aria-label={fill(copy.agentInbox.count, { count: g.open })}>
                      {g.open}
                    </span>
                  </li>
                ))}
              </ul>
              {data.byRequesterCapped ? (
                <p className="text-xs text-muted-foreground" data-testid="genesis-support-reports-by-requester-capped">
                  {fill(copy.reports.byRequesterCapped, { count: data.byRequester.reduce((sum, g) => sum + g.open, 0).toLocaleString() })}
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
