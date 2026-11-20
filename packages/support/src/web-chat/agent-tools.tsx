/**
 * The help desk's tools for its agents, beside the inbox: `SupportSavedRepliesAdmin`, where a
 * tenant's saved replies are written (agents insert one with `!` in a reply), and
 * `SupportAgentReports`, the help desk's numbers over a date range. Both read and write through
 * the support client (migration 0014) and refuse no one themselves: the database does.
 *
 * Saved replies sit on genesis-ui's `InboxLayout` and `InboxPage`, as the help center's admin does;
 * the app keeps which one is open in its router (`replyId`: an id, `"new"`, or null). The report's
 * numbers are genesis-ui's `StatCard`s. `SupportAgentsAdmin` is who answers a desk (its admins add and
 * remove them), and `SupportMyMentions` where the signed-in agent was mentioned in a note.
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
  InlineAlert,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  cn,
  toast,
  type InboxItem,
} from "@marktiderman/genesis-ui";
import { StatCard } from "@marktiderman/genesis-ui/data";
import { SupportError, type AgentMention, type SavedReply, type SupportClient, type SupportPerson, type TicketAgentRole } from "../client";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { waitedFor } from "./agent-inbox";
import { scopeOf, useResolvedTenant } from "./tenant";
import { listView, ViewList } from "./list-view";
import { PersonSearch, useSupportDesks, type SupportFindPeople } from "./desks";
import type { ResolveUser } from "@marktiderman/genesis-chat/web";

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
        <InlineAlert variant={message.failed ? "destructive" : "success"} description={message.text} testID="genesis-support-saved-message" />
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
                <AlertDialogCancel data-testid="genesis-support-saved-delete-cancel">{copy.savedReplies.cancel}</AlertDialogCancel>
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
        <InlineAlert variant="destructive" description={copy.reports.invalidRange} testID="genesis-support-reports-invalid" />
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
              <ViewList
                view={byRequesterView(copy)}
                rows={data.byRequester.map((g, i): ByRequesterRow => ({ id: String(i), label: g.label ?? copy.reports.unknownRequester, open: g.open }))}
                testId="genesis-support-reports-by-requester-list"
              />
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

type ByRequesterRow = { id: string; label: string; open: number } & Record<string, unknown>;

function byRequesterView(copy: SupportCopy) {
  return listView<ByRequesterRow>("support_open_by_customer", { title: copy.reports.byRequester, noun: copy.reports.customerNoun, nounPlural: copy.reports.customerNounPlural, emptyTitle: copy.reports.none }, [
    { name: "label", label: copy.reports.customer },
    { name: "open", label: copy.reports.openCount, type: "number", display: "number" },
  ]);
}

// ── Agents ────────────────────────────────────────────────────────────────────

export interface SupportAgentsAdminProps {
  client: SupportClient;
  /** Whose help desk. Null is the app's own. Left out, the client's `tenantId`, else the app's own. */
  tenantId?: string | null;
  /** Finds the app's people by name or email, to add one. Without it, the list only removes. */
  findPeople?: SupportFindPeople;
  copy?: SupportCopyOverrides;
  /** Every refused or failed read and change, for reporting. */
  onError?: (error: unknown) => void;
  className?: string;
}

const agentKeys = {
  list: (scope: string) => ["genesis-support", "agents", scope] as const,
};

type AgentRow = { id: string; name: string } & Record<string, unknown>;

/**
 * A help desk's agents (`staffList`), for its admins: add someone (`findPeople`) as an agent or an
 * admin, or remove one (`setAgent`). Only the desk's admins see it; the database refuses anyone else.
 */
export function SupportAgentsAdmin(props: SupportAgentsAdminProps) {
  const tenant = useResolvedTenant(props.client, props.tenantId);
  if (tenant.failed) return <EmptyState title={resolveSupportCopy(props.copy).agents.loadFailed} />;
  if (!tenant.ready) return <Skeleton className="h-40 w-full" />;
  return <AgentsAdmin key={scopeOf(props.client, tenant.tenantId)} {...props} tenantId={tenant.tenantId} />;
}

function AgentsAdmin({ client, tenantId = null, findPeople, copy: copyOverrides, onError, className }: SupportAgentsAdminProps) {
  const copy = useMemo(() => resolveSupportCopy(copyOverrides), [copyOverrides]);
  const queryClient = useQueryClient();
  const roleId = useId();
  const desks = useSupportDesks(client);
  // `setAgent` takes the desk's tenant: the app's own desk by its id.
  const desk = desks.data?.find((d) => (tenantId === null ? d.isDefault : d.tenantId === tenantId));
  const manage = Boolean(desk?.manage && client.setAgent);
  const agents = useQuery({ queryKey: agentKeys.list(scopeOf(client, tenantId)), queryFn: () => required(client.staffList)({ tenantId }), enabled: manage });
  const [person, setPerson] = useState<SupportPerson | null>(null);
  const [role, setRole] = useState<TicketAgentRole>("agent");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const reported = useRef(onError);
  reported.current = onError;
  useEffect(() => {
    if (agents.error) reported.current?.(agents.error);
  }, [agents.error]);
  const view = useMemo(
    () => listView<AgentRow>("support_agents", { title: copy.agents.title, noun: copy.agents.noun, nounPlural: copy.agents.nounPlural, emptyTitle: copy.agents.emptyTitle, emptyBody: copy.agents.emptyBody }, [{ name: "name", label: copy.agents.name }]),
    [copy],
  );
  if (!manage || !desk) return null;
  const set = async (personId: string, next: TicketAgentRole | null) => {
    setBusy(true);
    setFailed(false);
    try {
      await client.setAgent!(desk.tenantId, personId, next);
      await queryClient.invalidateQueries({ queryKey: agentKeys.list(scopeOf(client, tenantId)) });
      return true;
    } catch (error) {
      setFailed(true);
      reported.current?.(error);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!person) return;
    if (await set(person.id, role)) {
      toast.success(fill(copy.agents.added, { name: person.name?.trim() || copy.agents.unnamed }));
      setPerson(null);
    }
  };
  const remove = async (row: AgentRow) => {
    if (await set(row.id, null)) toast.success(copy.agents.removed);
    else throw new Error(copy.agents.failed);
  };
  return (
    <section data-testid="genesis-support-agents" aria-label={copy.agents.title} className={cn("flex flex-col gap-3", className)}>
      <ViewList
        view={view}
        rows={agents.data?.map((a): AgentRow => ({ id: a.id, name: a.name?.trim() || copy.agents.unnamed }))}
        loading={agents.isPending}
        error={agents.isError}
        errorMessage={copy.agents.loadFailed}
        onRetry={() => void agents.refetch()}
        onDelete={remove}
        confirmDelete={{ title: copy.agents.removeConfirmTitle, description: copy.agents.removeConfirmBody, confirmLabel: copy.agents.remove, cancelLabel: copy.savedReplies.cancel }}
        testId="genesis-support-agents-list"
      />
      {findPeople ? (
        <form onSubmit={(e) => void add(e)} className="flex flex-col gap-2" aria-label={copy.agents.add} data-testid="genesis-support-agents-add">
          <PersonSearch
            client={client}
            findPeople={findPeople}
            value={person}
            onChange={setPerson}
            words={{ search: copy.agents.search, placeholder: copy.agents.searchPlaceholder, noMatches: copy.agents.noMatches, unnamed: copy.agents.unnamed }}
            testId="genesis-support-agents"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor={roleId}>{copy.agents.role}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as TicketAgentRole)}>
              <SelectTrigger id={roleId} className="w-40" data-testid="genesis-support-agents-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">{copy.agents.roles.agent}</SelectItem>
                <SelectItem value="admin">{copy.agents.roles.admin}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="self-start" disabled={!person || busy} data-testid="genesis-support-agents-add-send">
            {copy.agents.add}
          </Button>
        </form>
      ) : null}
      {failed ? <InlineAlert variant="destructive" description={copy.agents.failed} testID="genesis-support-agents-failed" /> : null}
    </section>
  );
}

// ── My mentions ───────────────────────────────────────────────────────────────

export interface SupportMyMentionsProps {
  client: SupportClient;
  /** Names who wrote the note. */
  resolveUser: ResolveUser;
  /** Opens the ticket the note is on (the agent inbox, at that ticket). */
  onOpen: (ticketId: string) => void;
  copy?: SupportCopyOverrides;
  onError?: (error: unknown) => void;
  className?: string;
}

type MentionRow = AgentMention & { by: string } & Record<string, unknown>;

/** Where the signed-in agent was mentioned in an internal note (`agentMentions`, migration 0014), newest first; each opens its ticket. */
export function SupportMyMentions({ client, resolveUser, onOpen, copy: copyOverrides, onError, className }: SupportMyMentionsProps) {
  const copy = useMemo(() => resolveSupportCopy(copyOverrides), [copyOverrides]);
  const mentions = useQuery({ queryKey: ["genesis-support", "mentions", scopeOf(client, null)], queryFn: () => required(client.agentMentions)(), enabled: Boolean(client.agentMentions) });
  const reported = useRef(onError);
  reported.current = onError;
  useEffect(() => {
    if (mentions.error) reported.current?.(mentions.error);
  }, [mentions.error]);
  const view = useMemo(
    () =>
      listView<MentionRow>("support_my_mentions", { title: copy.mentions.title, noun: copy.mentions.noun, nounPlural: copy.mentions.nounPlural, emptyTitle: copy.mentions.emptyTitle, emptyBody: copy.mentions.emptyBody }, [
        { name: "by", label: copy.mentions.by },
        { name: "createdAt", label: copy.mentions.at, type: "datetime", display: "datetime" },
      ]),
    [copy],
  );
  const cells = useMemo(
    () => ({
      by: (m: MentionRow) => (
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => onOpen(m.reportId)} data-testid={`genesis-support-mention-${m.id}`}>
          {m.by}
        </Button>
      ),
    }),
    [onOpen],
  );
  if (!client.agentMentions) return null;
  return (
    <section data-testid="genesis-support-mentions" aria-label={copy.mentions.title} className={className}>
      <ViewList
        view={view}
        rows={mentions.data?.map((m): MentionRow => ({ ...m, by: m.authorId ? resolveUser(m.authorId).name : copy.desks.logSomeone }))}
        loading={mentions.isPending}
        error={mentions.isError}
        errorMessage={copy.mentions.loadFailed}
        onRetry={() => void mentions.refetch()}
        cells={cells}
        testId="genesis-support-mentions-list"
      />
    </section>
  );
}
