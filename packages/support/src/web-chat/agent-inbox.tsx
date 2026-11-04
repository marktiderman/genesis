/**
 * The help desk's agent inbox on the web: a tenant's queues (Mine, Unassigned, All), the tickets in
 * one, the open ticket's thread with reply and internal note, and a details panel.
 *
 * Support brings the data and actions; genesis-ui's `InboxLayout`, `InboxViews`, `InboxPage` and
 * `ThreadPage` do all the drawing. The app keeps which ticket is open in its router
 * (`ticketId`, `onTicketChange`), and fills the details panel with its own cards (`context`).
 *
 * Needs a TanStack QueryClientProvider, and a support client made with the `chat` option for
 * internal notes and live threads. It reads through the client (migration 0009), so genesis-chat's
 * ChatProvider isn't needed.
 *
 * @stability Beta
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EmptyState,
  InboxLayout,
  InboxPage,
  InboxViews,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  ThreadPage,
  cn,
  type InboxItem,
  type InboxPageProps,
  type InboxShortcuts,
  type ThreadAttachment,
  type ThreadMessage,
  type ThreadPageProps,
  type ThreadPageSlotMap,
} from "@marktiderman/genesis-ui";
import type { ResolveUser } from "@marktiderman/genesis-chat/web";
import { reportHeading, SupportError, type AgentTicket, type SupportClient, type SupportReply, type TicketInboxView } from "../client";
import { fill, resolveSupportCopy, type SupportCopy, type SupportCopyOverrides } from "../copy";
import { isSitePath } from "../routes";
import { supportWebKeys } from "./report-thread";
import { TicketControls } from "./staff-thread";

/** The agent inbox's query keys, under genesis-support's root. */
export const supportInboxKeys = {
  all: ["genesis-support", "agent-inbox"] as const,
  list: (tenantId: string | null, view: TicketInboxView) => ["genesis-support", "agent-inbox", "list", tenantId, view] as const,
  counts: (tenantId: string | null) => ["genesis-support", "agent-inbox", "counts", tenantId] as const,
  ticket: (tenantId: string | null, id: string) => ["genesis-support", "agent-inbox", "ticket", tenantId, id] as const,
  replies: (id: string) => ["genesis-support", "agent-inbox", "replies", id] as const,
};

export interface SupportAgentInboxProps {
  /** A support client, made with the `chat` option for internal notes and live threads. */
  client: SupportClient;
  /** Whose help desk: the viewer's current workspace. Left out or null, the app's own tickets. */
  tenantId?: string | null;
  /** The open ticket, from the app's router. */
  ticketId: string | null;
  /** A ticket was opened, or (null) closed: change the route. */
  onTicketChange: (id: string | null) => void;
  /** The queue shown (controlled). Keep it in the URL if it should survive a reload. */
  view?: TicketInboxView;
  onViewChange?: (view: TicketInboxView) => void;
  /** Uncontrolled: the queue to start on. Default `mine`. */
  defaultView?: TicketInboxView;
  /** Which queues to offer, in order. Default Mine, Unassigned, All. */
  views?: readonly TicketInboxView[];
  /** Names people: requesters and agents. */
  resolveUser: ResolveUser;
  /** Who a ticket can be given to, by login. Without it there is no assignee picker. */
  agents?: readonly { id: string; name: string }[];
  /** The app's own cards in the details panel (who this customer is, say), under the ticket's details. */
  context?: (ticket: AgentTicket) => ReactNode;
  /** Keys for the inbox (`InboxLayout`'s j, k, r, n, e, a, Escape). Off by default: leave it out for no single-key shortcuts. */
  shortcuts?: InboxShortcuts;
  /** The layouts' own slots: the list's rows, header and empty state; the thread's messages and events. */
  slots?: { list?: InboxPageProps["slots"]; thread?: ThreadPageProps["slots"] };
  /** Remember in this browser whether the details panel is open, under this key. */
  contextStorageKey?: string;
  copy?: SupportCopyOverrides;
  /** Every refused or failed read and change, for reporting. */
  onError?: (error: unknown) => void;
  /** Tickets per page, at most 200. Default 50. */
  pageSize?: number;
  /** How often the queues re-read, in ms. Default 30 seconds; `false` for never. An open thread is live anyway. */
  refreshInterval?: number | false;
  className?: string;
}

const MAX_PAGE = 200;
const VIEWS: readonly TicketInboxView[] = ["mine", "unassigned", "all"];
const NOT_ALLOWED = "42501";

function isRefused(error: unknown): boolean {
  return error instanceof SupportError && error.code === NOT_ALLOWED;
}

function required<T>(method: T | undefined): NonNullable<T> {
  if (!method) throw new SupportError("This support client has no agent inbox.", "0A000", "agentInbox");
  return method as NonNullable<T>;
}

/** The open ticket, for the slots below: stable components, so its pickers keep their state as data changes. */
interface PaneValue {
  ticket: AgentTicket;
  copy: SupportCopy;
  agents?: readonly { id: string; name: string }[] | undefined;
  failed: boolean;
  onStatus: (status: AgentTicket["status"]) => void;
  onAssign: (userId: string | null) => void;
  /** What a reply's file is, by attachment id: ThreadPage's own attachment draws images only. */
  files: ReadonlyMap<string, { image: boolean; name: string | null }>;
}

const PaneContext = createContext<PaneValue | null>(null);

function TicketHeaderRegion({ testID }: ThreadPageSlotMap["headerRegion"]) {
  const pane = useContext(PaneContext);
  if (!pane) return null;
  return (
    <div data-testid={testID} className="flex flex-col gap-3 border-b p-4">
      <h2 className="text-base font-semibold [overflow-wrap:anywhere]">{reportHeading(pane.ticket)}</h2>
      <TicketControls
        status={pane.ticket.status}
        assignee={pane.ticket.assigneeId}
        staff={pane.agents}
        onStatus={pane.onStatus}
        onAssign={pane.onAssign}
        failed={pane.failed}
        copy={pane.copy}
      />
    </div>
  );
}

function TicketAttachment({ id, uri, accessibilityLabel, testID }: ThreadPageSlotMap["attachment"]) {
  const pane = useContext(PaneContext);
  const file = pane?.files.get(id);
  return (
    <a data-testid={testID} href={uri} target="_blank" rel="noreferrer noopener" className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {file?.image === false ? (
        <span className="inline-block rounded-xl border px-3 py-2 text-sm underline underline-offset-2">{file.name ?? pane?.copy.agentInbox.openFile}</span>
      ) : (
        <img src={uri} alt={accessibilityLabel ?? pane?.copy.thread.screenshot ?? ""} loading="lazy" className="h-40 w-auto rounded-xl object-cover" />
      )}
    </a>
  );
}

/** The requester's name: their person, or for an email ticket who it says it's from. */
const requesterOf = (ticket: AgentTicket, resolveUser: ResolveUser, copy: SupportCopy) =>
  ticket.userId ? resolveUser(ticket.userId).name : (ticket.requesterName ?? ticket.requesterEmail ?? copy.agentInbox.emailSender);

/** Only web addresses open from a thread: a file's URL comes from a message. */
const isWebUrl = (url: string | null): url is string => Boolean(url && /^https?:\/\//i.test(url));

const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).host : "";
  } catch {
    return "";
  }
};

interface PaneProps {
  client: SupportClient;
  ticket: AgentTicket;
  resolveUser: ResolveUser;
  agents?: readonly { id: string; name: string }[] | undefined;
  slots?: ThreadPageProps["slots"] | undefined;
  copy: SupportCopy;
  onError?: ((error: unknown) => void) | undefined;
}

const NOTE = "note";
const REPLY = "reply";
const paneSlots = { headerRegion: TicketHeaderRegion, attachment: TicketAttachment };

/** The open ticket's thread. Keyed by ticket, so a draft never follows you to another one. */
function TicketPane({ client, ticket, resolveUser, agents, slots, copy, onError }: PaneProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<string>(REPLY);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [changeFailed, setChangeFailed] = useState(false);
  const report = useRef(onError);
  report.current = onError;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: supportInboxKeys.all });
  };
  const where = useQuery({ queryKey: supportWebKeys.thread(ticket.id), queryFn: () => client.thread(ticket.id), staleTime: Infinity });
  const live = where.data?.mode === "chat";
  const replies = useQuery({
    queryKey: supportInboxKeys.replies(ticket.id),
    queryFn: () => client.replies(ticket.id),
    // Without chat there are no live updates: re-read while it's open, as the person's thread does.
    refetchInterval: where.data && !live ? 30_000 : false,
  });

  // Live: each hint re-reads the thread and the row.
  useEffect(
    () =>
      client.subscribe(ticket.id, () => {
        void queryClient.invalidateQueries({ queryKey: supportInboxKeys.replies(ticket.id) });
        void queryClient.invalidateQueries({ queryKey: supportInboxKeys.all });
      }),
    [client, ticket.id, queryClient],
  );

  useEffect(() => {
    if (replies.error) report.current?.(replies.error);
    if (where.error) report.current?.(where.error);
  }, [replies.error, where.error]);

  // Reading it, while it's in front of someone: when it shows, when something new arrives, and when
  // they come back to the tab. The read state is the team's, so a hidden tab mustn't clear it.
  // Only what was just read: cached replies, or a refresh that failed, aren't what they're looking at.
  const latest = replies.isFetchedAfterMount && !replies.isError && replies.data ? (replies.data[replies.data.length - 1]?.id ?? "none") : null;
  useEffect(() => {
    if (latest === null) return;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      client
        .markRead(ticket.id, { ticket: true })
        .then(() => queryClient.invalidateQueries({ queryKey: ["genesis-support", "agent-inbox", "list"] }))
        .catch((error: unknown) => report.current?.(error));
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [client, ticket.id, latest, queryClient]);

  const requester = requesterOf(ticket, resolveUser, copy);
  // The ticket's own words come first: they aren't a message in its conversation.
  const messages = useMemo<ThreadMessage[]>(
    () => [
      { id: ticket.id, body: ticket.message, mine: false, authorName: requester, timestamp: ticket.createdAt },
      ...(replies.data ?? []).map((r) => toMessage(r, resolveUser, requester, copy)),
      // A thread that didn't load says so: the ticket's words alone would read as nothing said since.
      ...(replies.isError && !replies.data ? [{ id: "thread-failed", kind: "event" as const, body: copy.agentInbox.threadErrorTitle, mine: false, timestamp: ticket.createdAt }] : []),
    ],
    [ticket.id, ticket.message, ticket.createdAt, replies.data, replies.isError, resolveUser, requester, copy],
  );
  // A file from outside this app's storage is a link naming its host: the requester chose that
  // address, so the agent's browser doesn't load it until they ask.
  const files = useMemo(() => {
    const map = new Map<string, { image: boolean; name: string | null }>();
    for (const r of replies.data ?? [])
      for (const a of r.attachments ?? []) {
        const stored = a.stored;
        map.set(a.id, {
          image: stored && (a.kind === "image" || Boolean(a.mime?.startsWith("image/"))),
          name: stored ? a.name : `${a.name ?? copy.agentInbox.openFile} (${hostOf(a.url)})`,
        });
      }
    return map;
  }, [replies.data, copy]);
  // Never the requester, who can't handle their own ticket; always whoever has it now, so the picker shows them.
  const assignable = useMemo(() => {
    if (!agents) return undefined;
    const list = agents.filter((a) => a.id !== ticket.userId);
    const current = ticket.assigneeId;
    return current && !list.some((a) => a.id === current) ? [{ id: current, name: resolveUser(current).name }, ...list] : list;
  }, [agents, ticket.userId, ticket.assigneeId, resolveUser]);
  const threadSlots = useMemo(() => ({ ...paneSlots, ...slots }), [slots]);
  const threadFailed = replies.isError && !replies.data;

  const change = (work: Promise<unknown>) =>
    work
      .then(() => {
        setChangeFailed(false);
        refresh();
      })
      .catch((error: unknown) => {
        setChangeFailed(true);
        report.current?.(error);
      });

  const send = () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendFailed(false);
    client
      .reply(ticket.id, body, { internal: mode === NOTE })
      .then(() => {
        setDraft("");
        refresh();
      })
      .catch((error: unknown) => {
        setSendFailed(true);
        report.current?.(error);
      })
      .finally(() => setSending(false));
  };

  const pane: PaneValue = {
    ticket,
    copy,
    agents: assignable,
    failed: changeFailed,
    onStatus: (status) => void change(client.setStatus(ticket.id, status)),
    onAssign: (userId) => void change(client.assign(ticket.id, userId)),
    files,
  };

  return (
    <PaneContext.Provider value={pane}>
      <ThreadPage
        conversationId={ticket.id}
        messages={messages}
        loading={replies.isPending}
        readAt={ticket.userReadAt}
        readLabel={copy.thread.read}
        labels={{ you: copy.thread.you, internal: copy.thread.internalNote }}
        slots={threadSlots}
        testID="genesis-support-agent-thread"
        // Not while the thread failed to load: nobody should answer a conversation they can't see.
        composer={threadFailed ? null : {
          value: draft,
          onChangeText: setDraft,
          onSend: send,
          sending,
          placeholder: mode === NOTE ? copy.agentInbox.notePlaceholder : copy.thread.placeholder,
          sendLabel: copy.thread.send,
          sendingLabel: copy.feedback.sending,
          // Notes need the conversation: without chat, only a reply.
          ...(live
            ? {
                modes: [
                  { id: REPLY, label: copy.agentInbox.reply },
                  { id: NOTE, label: copy.thread.internalNote, tone: "internal" as const },
                ],
                mode,
                onModeChange: setMode,
              }
            : {}),
          ...(sendFailed
            ? {
                above: (
                  <p role="alert" data-testid="genesis-support-agent-send-failed" className="px-3 pt-2 text-sm text-destructive">
                    {copy.agentInbox.sendFailed}
                  </p>
                ),
              }
            : {}),
        }}
      />
    </PaneContext.Provider>
  );
}

function toMessage(r: SupportReply, resolveUser: ResolveUser, requester: string, copy: SupportCopy): ThreadMessage {
  const attachments: ThreadAttachment[] = (r.attachments ?? [])
    .filter((a) => isWebUrl(a.url))
    .map((a) => ({ id: a.id, uri: a.url as string, ...(a.width ? { width: a.width } : {}), ...(a.height ? { height: a.height } : {}), accessibilityLabel: a.name ?? copy.thread.file }));
  // On support_replies no author is readable: to an agent, "mine" is support's side.
  const mine = r.authorId !== undefined ? r.mine : r.fromStaff;
  const authorName = mine ? undefined : r.authorId ? resolveUser(r.authorId).name : r.fromStaff ? copy.thread.support : requester;
  return {
    id: r.id,
    body: r.body,
    mine,
    ...(authorName ? { authorName } : {}),
    timestamp: r.createdAt,
    ...(r.internal ? { tone: "internal" as const } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function TicketDetails({ client, ticket, resolveUser, context, copy }: Pick<PaneProps, "client" | "ticket" | "resolveUser" | "copy"> & { context?: ((ticket: AgentTicket) => ReactNode) | undefined }) {
  const shots = useQuery({ queryKey: supportWebKeys.attachments(ticket.id), queryFn: () => client.attachments(ticket.id), staleTime: 50 * 60_000 });
  const severities = copy.feedback.severities as Record<string, string>;
  // In the viewer's zone, so it waits for the browser: the server's HTML has none.
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => setOpened(new Date(ticket.createdAt).toLocaleString()), [ticket.createdAt]);
  return (
    <div data-testid="genesis-support-agent-details" className="flex flex-col gap-4 p-4">
      <dl className="flex flex-col gap-3">
        <Detail label={copy.agentInbox.from}>{requesterOf(ticket, resolveUser, copy)}</Detail>
        {ticket.requesterEmail ? <Detail label={copy.agentInbox.emailSender}>{ticket.requesterEmail}</Detail> : null}
        <Detail label={copy.agentInbox.type}>{copy.feedback.types[ticket.type]}</Detail>
        {ticket.severity ? <Detail label={copy.agentInbox.severity}>{severities[ticket.severity] ?? ticket.severity}</Detail> : null}
        {opened ? <Detail label={copy.agentInbox.opened}>{opened}</Detail> : null}
        {ticket.route || ticket.aboutLabel ? (
          <Detail label={copy.agentInbox.page}>
            {ticket.aboutLabel ? `${ticket.aboutLabel} ` : null}
            {/* The requester's words and route: a link only when it's a path on this site. */}
            {ticket.route ? (
              isSitePath(ticket.route) ? (
                <a href={ticket.route} className="underline underline-offset-2">
                  {ticket.route}
                </a>
              ) : (
                ticket.route
              )
            ) : null}
          </Detail>
        ) : null}
        {ticket.appVersion ? <Detail label={copy.agentInbox.appVersion}>{ticket.appVersion}</Detail> : null}
      </dl>
      {(shots.data ?? []).some((a) => a.url) ? (
        <section aria-label={copy.agentInbox.screenshots} className="flex flex-wrap gap-2">
          {(shots.data ?? [])
            .filter((a) => a.url)
            .map((a) => (
              <a key={a.id} href={a.url!} target="_blank" rel="noreferrer noopener" className="block">
                <img src={a.url!} alt={copy.thread.screenshot} className="h-24 w-auto rounded-md border object-cover" />
              </a>
            ))}
        </section>
      ) : null}
      {context ? context(ticket) : null}
    </div>
  );
}

/** A tenant's help desk inbox: its queues, the open ticket's thread and its details. */
export function SupportAgentInbox({
  client,
  tenantId = null,
  ticketId,
  onTicketChange,
  view: viewProp,
  onViewChange,
  defaultView,
  views = VIEWS,
  resolveUser,
  agents,
  context,
  shortcuts,
  slots,
  contextStorageKey,
  copy: copyOverrides,
  onError,
  pageSize: pageSizeProp = 50,
  refreshInterval = 30_000,
  className,
}: SupportAgentInboxProps) {
  const copy = useMemo(() => resolveSupportCopy(copyOverrides), [copyOverrides]);
  const pageSize = Math.min(Math.max(pageSizeProp, 1), MAX_PAGE);
  const [ownView, setOwnView] = useState<TicketInboxView>(defaultView ?? views[0] ?? "mine");
  const view = viewProp ?? ownView;
  const setView = (next: TicketInboxView) => {
    if (viewProp === undefined) setOwnView(next);
    onViewChange?.(next);
  };
  const tenantKey = tenantId;
  // A refusal doesn't change by asking again.
  const poll = (query: { state: { error: unknown } }) => (isRefused(query.state.error) ? false : refreshInterval);

  const list = useInfiniteQuery({
    queryKey: supportInboxKeys.list(tenantKey, view),
    initialPageParam: null as AgentTicket | null,
    queryFn: ({ pageParam }) => required(client.agentTickets)({ tenantId, view, before: pageParam, limit: pageSize }),
    getNextPageParam: (last) => (last.length === pageSize ? (last[last.length - 1] ?? null) : null),
    refetchInterval: poll,
    retry: (count, error) => !isRefused(error) && count < 2,
  });
  const counts = useQuery({
    queryKey: supportInboxKeys.counts(tenantKey),
    queryFn: () => required(client.agentTicketCounts)({ tenantId }),
    refetchInterval: poll,
    retry: (count, error) => !isRefused(error) && count < 2,
  });
  const open = useQuery({
    queryKey: supportInboxKeys.ticket(tenantKey, ticketId ?? ""),
    queryFn: () => required(client.agentTicket)(ticketId as string, { tenantId }),
    enabled: Boolean(ticketId),
    // Another agent's status or assignee, also without live updates.
    refetchInterval: poll,
    retry: (count, error) => !isRefused(error) && count < 2,
  });

  // Every failed read, for the app's reporting.
  const reported = useRef(onError);
  reported.current = onError;
  for (const error of [list.error, counts.error, open.error]) useReport(error, reported);

  const tickets = useMemo(() => list.data?.pages.flat() ?? [], [list.data]);
  const refused = isRefused(list.error);
  const items = useMemo<InboxItem[]>(
    () =>
      tickets.map((t) => ({
        id: t.id,
        title: reportHeading(t),
        preview: t.preview,
        timestamp: t.activityAt,
        unread: t.unread,
        meta: fill(copy.agentInbox.rowMeta, {
          status: copy.status[t.status],
          assignee: t.assigneeId ? (agents?.find((a) => a.id === t.assigneeId)?.name ?? resolveUser(t.assigneeId).name) : copy.staff.unassigned,
        }),
      })),
    [tickets, copy, agents, resolveUser],
  );

  const ticket = open.data ?? null;
  const viewCount = (id: TicketInboxView) => counts.data?.[id];

  return (
    <InboxLayout
      className={cn("h-full", className)}
      testID="genesis-support-agent-inbox"
      threadOpen={Boolean(ticketId)}
      onBack={() => onTicketChange(null)}
      {...(contextStorageKey ? { contextStorageKey } : {})}
      {...(shortcuts ? { shortcuts } : {})}
      labels={{
        list: copy.agentInbox.listLabel,
        views: copy.agentInbox.viewLabel,
        thread: copy.agentInbox.conversation,
        context: copy.agentInbox.details,
        toggleContext: copy.agentInbox.details,
        back: copy.agentInbox.back,
      }}
      views={
        <InboxViews
          testID="genesis-support-agent-views"
          views={views.map((id) => {
            const count = viewCount(id);
            return { id, label: copy.agentInbox.views[id], ...(count === undefined ? {} : { count, countLabel: count === 1 ? copy.agentInbox.oneTicket : fill(copy.agentInbox.count, { count }) }) };
          })}
          activeId={view}
          onSelect={(id) => setView(id as TicketInboxView)}
        />
      }
      list={
        <InboxPage
          testID="genesis-support-agent-list"
          // The views rail shows from lg up: below that, the same choice over the list.
          header={
            <div className="border-b p-2 lg:hidden">
              <Select value={view} onValueChange={(value) => setView(value as TicketInboxView)}>
                <SelectTrigger aria-label={copy.agentInbox.viewLabel} data-testid="genesis-support-agent-view-picker">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {views.map((id) => (
                    <SelectItem key={id} value={id}>
                      {copy.agentInbox.views[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          items={items}
          selectedId={ticketId}
          onSelect={(id) => onTicketChange(id)}
          loading={list.isPending}
          error={list.isError}
          errorTitle={refused ? copy.agentInbox.notAllowedTitle : copy.agentInbox.errorTitle}
          errorBody={refused ? copy.agentInbox.notAllowedBody : copy.agentInbox.errorBody}
          emptyTitle={copy.agentInbox.emptyTitle[view]}
          emptyBody={copy.agentInbox.emptyBody}
          hasMore={list.hasNextPage}
          loadingMore={list.isFetchingNextPage}
          onEndReached={() => void list.fetchNextPage()}
          label={copy.agentInbox.listLabel}
          moreLabel={copy.agentInbox.more}
          loadingLabel={copy.agentInbox.loading}
          loadingMoreLabel={copy.agentInbox.loadingMore}
          unreadLabel={(count) => (count ? fill(copy.agentInbox.unreadCount, { count }) : copy.agentInbox.unread)}
          {...(slots?.list ? { slots: slots.list } : {})}
        />
      }
      thread={
        ticket ? (
          <TicketPane key={ticket.id} client={client} ticket={ticket} resolveUser={resolveUser} agents={agents} slots={slots?.thread} copy={copy} onError={onError} />
        ) : ticketId && open.isPending ? (
          <div className="flex flex-col gap-3 p-4" aria-busy="true" data-testid="genesis-support-agent-thread-loading">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div data-testid="genesis-support-agent-no-ticket">
            {ticketId && open.isError ? (
              <EmptyState title={isRefused(open.error) ? copy.agentInbox.notAllowedTitle : copy.agentInbox.ticketErrorTitle} description={isRefused(open.error) ? copy.agentInbox.notAllowedBody : copy.agentInbox.errorBody} />
            ) : (
              <EmptyState title={ticketId ? copy.agentInbox.notFound : copy.agentInbox.pickTitle} {...(ticketId ? {} : { description: copy.agentInbox.pickBody })} />
            )}
          </div>
        )
      }
      {...(ticket ? { context: <TicketDetails client={client} ticket={ticket} resolveUser={resolveUser} context={context} copy={copy} /> } : {})}
    />
  );
}

function useReport(error: unknown, report: { current: ((error: unknown) => void) | undefined }) {
  useEffect(() => {
    if (error) report.current?.(error);
  }, [error, report]);
}
