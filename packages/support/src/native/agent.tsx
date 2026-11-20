/**
 * The agent desk on the phone: a help desk's queues and one ticket's thread, as hooks that return
 * genesis-ui-native's `InboxPage` and `ThreadPage` props, so each route file is a layout and one
 * hook (the same queues as the web's `SupportAgentInbox`):
 *
 *   const agent = useIsSupportAgent(tenantId);              → show the screen, or not
 *   const inbox = useAgentInbox({ tenantId });               → <InboxPage {...inbox} />
 *   const thread = useAgentThread(id, { tenantId });         → <ThreadPage {...thread} />
 *   const badge = useAgentUnreadCount(tenantId);             → a tab or row badge
 *
 * Everything goes through `useSupport().client` (migrations 0009 on, 0022 for names and the
 * assignee picker). A tenant id names a business's help desk; null or left out is the app's own.
 * The database refuses anyone who isn't an agent there (`42501`), which reads as "not allowed".
 * Cached with TanStack Query under `[SUPPORT_QUERY_ROOT, "agent", …]` (`supportAgentKeys`).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { NativeButton, NativeSegmentedControl, NativeText } from "@marktiderman/genesis-ui-native/components";
import type { InboxItem, InboxPageProps, ThreadAttachment, ThreadMessage, ThreadPageProps } from "@marktiderman/genesis-ui-native/layouts";
import type { FeedbackStatus } from "../contract";
import { reportHeading, requesterTenantsLabel, SupportError, type AgentTicket, type AgentTicketCounts, type SupportPerson, type SupportReply, type TicketInboxView } from "../client";
import { fill, type SupportCopy } from "../copy";
import { SUPPORT_QUERY_ROOT, useSupport } from "./support";

/** The queues, in the order the switcher shows them. */
export const AGENT_INBOX_VIEWS: readonly TicketInboxView[] = ["mine", "unassigned", "all", "pending", "closed"];

/** The statuses an agent sets a ticket to, in the order the thread's controls show them. */
export const AGENT_TICKET_STATUSES: readonly FeedbackStatus[] = ["open", "in_progress", "pending", "addressed", "wont_fix"];

const CLOSED = new Set<FeedbackStatus>(["addressed", "wont_fix"]);
const NOT_ALLOWED = "42501";
const NOTE = "note";
const REPLY = "reply";

/**
 * The agent desk's query keys, scoped by the signed-in login (`user`) so a sign-in as someone else
 * on the same phone never reads the last person's queue from the cache. `tenant` is the tenant id,
 * null for the app's own.
 */
export const supportAgentKeys = {
  all: [SUPPORT_QUERY_ROOT, "agent"] as const,
  user: (user: string | null) => [SUPPORT_QUERY_ROOT, "agent", user] as const,
  tenant: (user: string | null, tenant: string | null) => [SUPPORT_QUERY_ROOT, "agent", user, tenant] as const,
  isAgent: (user: string | null, tenant: string | null) => [SUPPORT_QUERY_ROOT, "agent", user, tenant, "is-agent"] as const,
  queues: (user: string | null, tenant: string | null) => [SUPPORT_QUERY_ROOT, "agent", user, tenant, "queue"] as const,
  queue: (user: string | null, tenant: string | null, view: TicketInboxView) => [SUPPORT_QUERY_ROOT, "agent", user, tenant, "queue", view] as const,
  /** Under it, the unread badge: whatever refreshes the counts refreshes the badge too. */
  counts: (user: string | null, tenant: string | null) => [SUPPORT_QUERY_ROOT, "agent", user, tenant, "counts"] as const,
  unread: (user: string | null, tenant: string | null) => [SUPPORT_QUERY_ROOT, "agent", user, tenant, "counts", "unread"] as const,
  ticket: (user: string | null, tenant: string | null, id: string) => [SUPPORT_QUERY_ROOT, "agent", user, tenant, "ticket", id] as const,
  replies: (user: string | null, tenant: string | null, id: string) => [SUPPORT_QUERY_ROOT, "agent", user, tenant, "replies", id] as const,
  staff: (user: string | null, tenant: string | null) => [SUPPORT_QUERY_ROOT, "agent", user, tenant, "staff"] as const,
  reporters: (user: string | null, ids: readonly string[]) => [SUPPORT_QUERY_ROOT, "agent", user, "reporters", ...ids] as const,
  requesterTenants: (user: string | null, personId: string) => [SUPPORT_QUERY_ROOT, "agent", user, "requester-tenants", personId] as const,
};

/** The signed-in person's id, from the app's Supabase session (null while it's read, or signed out). */
/** Undefined while the session is still read. */
function useSignedInId(given: string | null | undefined): string | null | undefined {
  const { options } = useSupport();
  const queryClient = useQueryClient();
  // A sign-in or sign-out reads the id again at once, so the keys move to the new login.
  useEffect(() => {
    const auth = options.supabase.auth as { onAuthStateChange?: (cb: () => void) => { data?: { subscription?: { unsubscribe(): void } } } };
    const sub = auth.onAuthStateChange?.(() => void queryClient.invalidateQueries({ queryKey: [SUPPORT_QUERY_ROOT, "agent", "me"] }));
    return () => sub?.data?.subscription?.unsubscribe();
  }, [options.supabase, queryClient]);
  const session = useQuery({
    queryKey: [SUPPORT_QUERY_ROOT, "agent", "me"],
    queryFn: async () => (await options.supabase.auth.getSession()).data.session?.user?.id ?? null,
    enabled: given === undefined,
    staleTime: 60_000,
  });
  if (given !== undefined) return given;
  return session.isFetched ? (session.data ?? null) : undefined;
}

const isRefused = (error: unknown) => error instanceof SupportError && error.code === NOT_ALLOWED;
/** A refusal doesn't change by asking again. */
const retryUnlessRefused = (count: number, error: unknown) => !isRefused(error) && count < 2;

function required<T>(method: T | undefined, name: string): NonNullable<T> {
  if (!method) throw new SupportError(`This support client has no ${name} (the agent inbox, migration 0009).`, "0A000", name);
  return method as NonNullable<T>;
}

/** A body with genesis-chat's mention markup shown as `@Name`. */
const showMentions = (body: string) => body.replace(/@\[([^\]\n]{1,80})\]\(user:[0-9a-f-]{36}\)/gi, "@$1");

/** How long, shortly: minutes under an hour, hours under a day, then days. */
function waitedFor(sinceIso: string, copy: SupportCopy, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / 60_000));
  if (minutes < 60) return fill(copy.agentInbox.durations.minutes, { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return fill(copy.agentInbox.durations.hours, { count: hours });
  return fill(copy.agentInbox.durations.days, { count: Math.floor(hours / 24) });
}

/**
 * Does the signed-in person handle this help desk's tickets? `client.isAgent(tenantId)` for a
 * business's, `client.isStaff()` for the app's own (null or left out). False while it's read, when
 * signed out, and when the read fails.
 */
export function useIsSupportAgent(tenantId?: string | null): boolean {
  const { client } = useSupport();
  const tenant = tenantId ?? null;
  const me = useSignedInId(undefined);
  const query = useQuery({
    queryKey: supportAgentKeys.isAgent(me ?? null, tenant),
    queryFn: () => (tenant === null ? client.isStaff() : client.isAgent ? client.isAgent(tenant) : Promise.resolve(false)),
    enabled: me !== null && me !== undefined,
    staleTime: 5 * 60_000,
  });
  return query.data === true;
}

/**
 * How many active tickets in the help desk hold a requester's message no agent has read
 * (`client.agentUnreadCount`), for a badge. 0 for anyone who isn't an agent there, and while it's read.
 */
export function useAgentUnreadCount(tenantId?: string | null, options: { refreshInterval?: number } = {}): number {
  const { client } = useSupport();
  const tenant = tenantId ?? null;
  const me = useSignedInId(undefined);
  const agent = useIsSupportAgent(tenant);
  const query = useQuery({
    queryKey: supportAgentKeys.unread(me ?? null, tenant),
    queryFn: () => required(client.agentUnreadCount, "agentUnreadCount")({ tenantId: tenant }),
    enabled: agent,
    refetchInterval: options.refreshInterval ?? 60_000,
    staleTime: 30_000,
    retry: retryUnlessRefused,
  });
  return agent ? (query.data ?? 0) : 0;
}

/** Names for the requesters among `ids` (`client.reporters`), when the client reads them. */
function useReporters(ids: readonly string[]) {
  const { client } = useSupport();
  const me = useSignedInId(undefined);
  const sorted = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const query = useQuery({
    queryKey: supportAgentKeys.reporters(me ?? null, sorted),
    queryFn: () => required(client.reporters, "reporters")(sorted),
    enabled: me !== undefined && Boolean(client.reporters) && sorted.length > 0,
    staleTime: 5 * 60_000,
    retry: retryUnlessRefused,
  });
  return useMemo(() => new Map((query.data ?? []).map((r) => [r.id, r])), [query.data]);
}

/** The help desk's agents (`client.staffList`), for names and the assignee picker. Empty without it. */
function useStaff(tenant: string | null, enabled: boolean): SupportPerson[] {
  const { client } = useSupport();
  const me = useSignedInId(undefined);
  const query = useQuery({
    queryKey: supportAgentKeys.staff(me ?? null, tenant),
    queryFn: () => required(client.staffList, "staffList")({ tenantId: tenant }),
    enabled: me !== undefined && enabled && Boolean(client.staffList),
    staleTime: 5 * 60_000,
    retry: retryUnlessRefused,
  });
  return query.data ?? [];
}

/** The words the agent desk needs that support's copy doesn't have, in English by default. */
export interface AgentDeskLabels {
  /** The inbox's screen title. Default "Support inbox". */
  inboxTitle: string;
  /** A requester with no name the agent can read. Default "Someone". */
  someone: string;
  /** Take an unassigned (or someone else's) ticket. Default "Take it". */
  take: string;
  /** Give a ticket that is yours back to nobody. Default "Hand back". */
  handBack: string;
  /** Under a closed ticket's composer: a reply reopens it. Default "This is closed. A reply reopens it." */
  closedHint: string;
}

const DEFAULT_LABELS: AgentDeskLabels = {
  inboxTitle: "Support inbox",
  someone: "Someone",
  take: "Take it",
  handBack: "Hand back",
  closedHint: "This is closed. A reply reopens it.",
};

/** A requester's name as an agent sees it: their person's name or email, else who an email ticket is from. */
function requesterName(ticket: AgentTicket, reporters: ReadonlyMap<string, { name: string | null; email: string | null }>, copy: SupportCopy, labels: AgentDeskLabels): string {
  const person = ticket.userId ? reporters.get(ticket.userId) : undefined;
  return person?.name?.trim() || person?.email || ticket.requesterName || ticket.requesterEmail || (ticket.userId ? labels.someone : copy.agentInbox.emailSender);
}

export interface AgentInboxOptions {
  /** Whose help desk: a tenant id, or null / left out for the app's own. */
  tenantId?: string | null;
  /** The queue shown. With `onViewChange`, controlled; without, where the switcher starts. */
  view?: TicketInboxView;
  onViewChange?: (view: TicketInboxView) => void;
  /** The queues the switcher offers. Default all five. */
  views?: readonly TicketInboxView[];
  /** A row was tapped. Default: navigate to `<basePath>/agent/<id>`. */
  onOpen?: (ticketId: string) => void;
  /** Tickets per page (paged as the list nears its end). Default 50, at most 200. */
  pageSize?: number;
  /** How often the queue and counts are read again, in ms. Default 30 s. */
  refreshInterval?: number;
  labels?: Partial<AgentDeskLabels>;
}

export type AgentInboxProps = Pick<
  InboxPageProps,
  "items" | "refreshing" | "onRefresh" | "onEndReached" | "loadingMore" | "header" | "emptyTitle" | "emptyBody" | "loading" | "error" | "errorTitle" | "errorBody" | "testID"
> & {
  headerTitle: string;
  view: TicketInboxView;
  setView: (view: TicketInboxView) => void;
  /** Each queue with its label and count (Mine, Unassigned and All are counted; Pending and Closed aren't). */
  views: { value: TicketInboxView; label: string; count: number | undefined }[];
  counts: AgentTicketCounts | null;
  /** The database refused: the signed-in person isn't an agent in this help desk. */
  notAllowed: boolean;
};

/**
 * One queue of a help desk's tickets as `InboxPage` props: latest activity first, unread in bold,
 * the requester, status, assignee and how long they've waited on each row, a switcher between the
 * queues with their counts (`header`), and the next page as the list nears its end.
 */
export function useAgentInbox(options: AgentInboxOptions = {}): AgentInboxProps {
  const block = useSupport();
  const { client, copy } = block;
  const tenant = options.tenantId ?? null;
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const views = options.views ?? AGENT_INBOX_VIEWS;
  const [ownView, setOwnView] = useState<TicketInboxView>(options.view ?? views[0] ?? "mine");
  const controlled = options.view !== undefined && options.onViewChange !== undefined;
  const view = controlled ? (options.view as TicketInboxView) : ownView;
  const onViewChange = options.onViewChange;
  const setView = useCallback(
    (next: TicketInboxView) => {
      if (!controlled) setOwnView(next);
      onViewChange?.(next);
    },
    [controlled, onViewChange],
  );
  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 200);
  const interval = options.refreshInterval ?? 30_000;
  const poll = (query: { state: { error: unknown } }) => (isRefused(query.state.error) ? false : interval);
  const me = useSignedInId(undefined);

  const list = useInfiniteQuery({
    queryKey: supportAgentKeys.queue(me ?? null, tenant, view),
    initialPageParam: null as AgentTicket | null,
    queryFn: ({ pageParam }) => required(client.agentTickets, "agentTickets")({ tenantId: tenant, view, before: pageParam, limit: pageSize }),
    getNextPageParam: (last) => (last.length === pageSize ? (last[last.length - 1] ?? null) : null),
    enabled: me !== undefined,
    refetchInterval: poll,
    retry: retryUnlessRefused,
  });
  const counts = useQuery({
    queryKey: supportAgentKeys.counts(me ?? null, tenant),
    queryFn: () => required(client.agentTicketCounts, "agentTicketCounts")({ tenantId: tenant }),
    enabled: me !== undefined,
    refetchInterval: poll,
    retry: retryUnlessRefused,
  });
  const queryClient = useQueryClient();

  const tickets = useMemo(() => list.data?.pages.flat() ?? [], [list.data]);
  const requesterIds = useMemo(() => tickets.map((t) => t.userId).filter((id): id is string => Boolean(id)), [tickets]);
  const reporters = useReporters(requesterIds);
  const notAllowed = isRefused(list.error);
  const staff = useStaff(tenant, !notAllowed);
  const open = options.onOpen ?? ((id: string) => block.options.navigate(`${block.paths.inbox}/agent/${encodeURIComponent(id)}`));
  // Re-read with the list, so how long someone has waited moves on.
  const now = list.dataUpdatedAt || Date.now();

  const assigneeName = (id: string | null) =>
    id === null ? copy.staff.unassigned : id === me ? copy.thread.you : (staff.find((s) => s.id === id)?.name?.trim() || copy.thread.support);

  const items: InboxItem[] = tickets.map((t) => {
    const meta = fill(copy.agentInbox.rowMeta, {
      requester: requesterName(t, reporters, copy, labels),
      status: copy.status[t.status] ?? t.status,
      assignee: assigneeName(t.assigneeId),
    });
    return {
      id: t.id,
      title: reportHeading(t),
      preview: showMentions(t.preview || t.message),
      timestamp: t.activityAt,
      unread: t.unread,
      meta: t.waitingSince ? `${meta} · ${fill(copy.agentInbox.rowWaiting, { duration: waitedFor(t.waitingSince, copy, now) })}` : meta,
      onPress: () => open(t.id),
      testID: `genesis-support-agent-ticket-${t.id}`,
    };
  });

  const countOf = (v: TicketInboxView) => (v === "mine" || v === "unassigned" || v === "all" ? counts.data?.[v] : undefined);
  const viewList = views.map((v) => ({ value: v, label: copy.agentInbox.views[v], count: countOf(v) }));

  const header: ReactNode =
    viewList.length > 1 ? (
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }} accessibilityLabel={copy.agentInbox.viewLabel}>
        <NativeSegmentedControl
          testID="genesis-support-agent-views"
          options={viewList.map((v) => ({ value: v.value, label: v.count === undefined ? v.label : `${v.label} ${v.count}` }))}
          value={view}
          onChange={setView}
        />
      </View>
    ) : null;

  return {
    testID: "genesis-support-agent-inbox",
    headerTitle: labels.inboxTitle,
    items,
    view,
    setView,
    views: viewList,
    counts: counts.data ?? null,
    notAllowed,
    header,
    loading: list.isPending,
    error: list.isError,
    refreshing: list.isRefetching && !list.isFetchingNextPage,
    onRefresh: async () => {
      await Promise.all([list.refetch(), queryClient.invalidateQueries({ queryKey: supportAgentKeys.counts(me ?? null, tenant) })]);
    },
    onEndReached: () => {
      if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
    },
    loadingMore: list.isFetchingNextPage,
    emptyTitle: copy.agentInbox.emptyTitle[view],
    emptyBody: copy.agentInbox.emptyBody,
    errorTitle: notAllowed ? copy.agentInbox.notAllowedTitle : copy.agentInbox.errorTitle,
    errorBody: notAllowed ? copy.agentInbox.notAllowedBody : copy.agentInbox.errorBody,
  };
}

export interface AgentThreadOptions {
  /** Whose help desk the ticket is in: a tenant id, or null / left out for the app's own. */
  tenantId?: string | null;
  /** Re-read the thread this often (ms) when it isn't on genesis-chat (live). Default 30 s. */
  pollMs?: number;
  /** The screen is on show (expo-router's focus): marks read and live updates only then. Default true. */
  focused?: boolean;
  labels?: Partial<AgentDeskLabels>;
}

export type AgentThreadProps = Pick<
  ThreadPageProps,
  | "messages"
  | "composer"
  | "closedNotice"
  | "header"
  | "readAt"
  | "readLabel"
  | "loading"
  | "error"
  | "errorTitle"
  | "errorBody"
  | "onRetry"
  | "retryLabel"
  | "emptyTitle"
  | "emptyBody"
  | "labels"
  | "testID"
> & {
  headerTitle: string;
  ticket: AgentTicket | null;
  /** Read, and there is no such ticket in this help desk: leave the screen. */
  notFound: boolean;
  /** The database refused: the signed-in person isn't an agent in this help desk. */
  notAllowed: boolean;
  /** Who wrote it: a name (never empty), and their email when the client reads it. */
  requester: { id: string | null; name: string; email: string | null } | null;
  /** The requester's tenants on one line ("Acme, Northside"), or null when none has a label or the client can't read them. */
  requesterTenants: string | null;
  /** The thread is on genesis-chat: live, with internal notes. */
  live: boolean;
  /** The signed-in person's id. */
  me: string | null;
  /** The ticket is the signed-in agent's. */
  mine: boolean;
  /** Its status's words. */
  statusLabel: string | null;
  /** Who has it, in words (`copy.staff.unassigned` for nobody). */
  assigneeLabel: string | null;
  /** The statuses to offer, with their words, and which one it is now. */
  statuses: { value: FeedbackStatus; label: string; current: boolean }[];
  setStatus: (status: FeedbackStatus) => Promise<void>;
  /** The help desk's agents (`client.staffList`), for an assignee picker. Empty when the client can't read them. */
  assignees: { id: string; name: string; current: boolean }[];
  /** Give it to an agent, or (null) to nobody. */
  assign: (userId: string | null) => Promise<void>;
  /** Take it, or hand it back when it's already the signed-in agent's. */
  toggleMine: () => Promise<void>;
  /** A status or assignee change was refused or failed (`copy.staff.failed` says so in `header`). */
  changeFailed: boolean;
  /** The last send failed; the draft is still there. */
  sendFailed: boolean;
};

/** A reply as an agent sees it: theirs and other agents' on the support side, an internal note tinted. */
function toMessage(r: SupportReply, requester: string, requesterId: string | null, nameOf: (id: string) => string | null, copy: SupportCopy): ThreadMessage {
  // On support_replies no author is readable: to an agent, "mine" is support's side.
  const mine = r.authorId !== undefined ? r.mine : r.fromStaff;
  const authorName = mine
    ? undefined
    : r.authorId
      ? r.authorId === requesterId
        ? requester
        : (nameOf(r.authorId) ?? (r.fromStaff ? copy.thread.support : requester))
      : r.fromStaff
        ? copy.thread.support
        : requester;
  const attachments: ThreadAttachment[] = (r.attachments ?? [])
    .filter((a) => a.url)
    .map((a) =>
      a.kind === "image" && a.stored
        ? { id: a.id, kind: "image" as const, uri: a.url!, ...(a.width ? { width: a.width } : {}), ...(a.height ? { height: a.height } : {}), accessibilityLabel: copy.thread.screenshot }
        : { id: a.id, kind: "file" as const, uri: a.url!, name: a.name || (a.kind === "voice" ? copy.thread.voiceNote : a.kind === "video" ? copy.thread.video : copy.thread.file) },
    );
  return {
    id: r.id,
    body: showMentions(r.body),
    mine,
    ...(authorName ? { authorName } : {}),
    timestamp: r.createdAt,
    ...(r.internal ? { tone: "internal" as const } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
}

/**
 * One ticket for an agent as `ThreadPage` props: what the requester wrote, then the conversation
 * (live on genesis-chat, else re-read every `pollMs`); a composer that replies or, on chat, writes
 * an internal note; the ticket's status and assignee (`header` has the controls, and the actions
 * are here for a screen of your own); who wrote it and the tenants they're in. Opening it marks
 * it read for the help desk, again as messages arrive.
 */
export function useAgentThread(ticketId: string, options: AgentThreadOptions = {}): AgentThreadProps {
  const { client, copy } = useSupport();
  const tenant = options.tenantId ?? null;
  const focused = options.focused ?? true;
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const queryClient = useQueryClient();
  const me = useSignedInId(undefined);

  const ticket = useQuery({
    queryKey: supportAgentKeys.ticket(me ?? null, tenant, ticketId),
    queryFn: () => required(client.agentTicket, "agentTicket")(ticketId, { tenantId: tenant }),
    enabled: me !== undefined,
    retry: retryUnlessRefused,
  });
  // The same cache entry as useSupportThread's: where the thread lives doesn't change.
  const where = useQuery({ queryKey: [SUPPORT_QUERY_ROOT, "thread", ticketId], queryFn: () => client.thread(ticketId), staleTime: Infinity, enabled: ticket.isSuccess && Boolean(ticket.data) });
  const live = where.data?.mode === "chat";
  const replies = useQuery({
    queryKey: supportAgentKeys.replies(me ?? null, tenant, ticketId),
    queryFn: () => client.replies(ticketId),
    enabled: where.isFetched,
    refetchInterval: live || !focused ? false : (options.pollMs ?? 30_000),
  });
  const t = ticket.data ?? null;
  const notAllowed = isRefused(ticket.error);
  const staff = useStaff(tenant, !notAllowed);
  const reporters = useReporters(useMemo(() => (t?.userId ? [t.userId] : []), [t?.userId]));
  const tenants = useQuery({
    queryKey: supportAgentKeys.requesterTenants(me ?? null, t?.userId ?? ""),
    queryFn: () => required(client.requesterTenants, "requesterTenants")(t!.userId!),
    enabled: Boolean(client.requesterTenants && t?.userId),
    staleTime: 5 * 60_000,
    retry: retryUnlessRefused,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: supportAgentKeys.replies(me ?? null, tenant, ticketId) });
    void queryClient.invalidateQueries({ queryKey: supportAgentKeys.ticket(me ?? null, tenant, ticketId) });
    void queryClient.invalidateQueries({ queryKey: supportAgentKeys.queues(me ?? null, tenant) });
    void queryClient.invalidateQueries({ queryKey: supportAgentKeys.counts(me ?? null, tenant) });
  }, [queryClient, me, tenant, ticketId]);

  // Live on chat: a message from the requester or another agent reads the thread again.
  useEffect(() => (focused && live ? client.subscribe(ticketId, refresh) : undefined), [client, focused, live, ticketId, refresh]);

  // Read on screen, and again as messages arrive: the ticket leaves the unread queue and badge.
  const latest = replies.data ? (replies.data[replies.data.length - 1]?.id ?? "none") : null;
  const known = Boolean(t);
  useEffect(() => {
    if (!focused || !known || latest === null) return;
    void client
      .markRead(ticketId, { ticket: true })
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: supportAgentKeys.queues(me ?? null, tenant) }),
          queryClient.invalidateQueries({ queryKey: supportAgentKeys.counts(me ?? null, tenant) }),
          queryClient.invalidateQueries({ queryKey: supportAgentKeys.ticket(me ?? null, tenant, ticketId) }),
        ]),
      )
      .catch(() => undefined);
  }, [client, focused, known, latest, ticketId, tenant, queryClient, me]);

  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<string>(REPLY);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [changeFailed, setChangeFailed] = useState(false);
  const note = live && mode === NOTE;

  const send = () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendFailed(false);
    client
      .reply(ticketId, body, note ? { internal: true } : {})
      .then(() => {
        setDraft((d) => (d.trim() === body ? "" : d));
        refresh();
      })
      .catch(() => setSendFailed(true))
      .finally(() => setSending(false));
  };

  const change = async (write: () => Promise<void>) => {
    setChangeFailed(false);
    try {
      await write();
    } catch (error) {
      setChangeFailed(true);
      throw error;
    } finally {
      refresh();
    }
  };
  const setStatus = (status: FeedbackStatus) => change(() => client.setStatus(ticketId, status));
  const assign = (userId: string | null) => change(() => client.assign(ticketId, userId));
  const mine = Boolean(t && me && t.assigneeId === me);
  const toggleMine = () => assign(mine ? null : (me ?? null));

  const person = t?.userId ? reporters.get(t.userId) : undefined;
  const who = t ? requesterName(t, reporters, copy, labels) : labels.someone;
  const nameOf = useCallback((id: string) => (id === me ? copy.thread.you : (staff.find((s) => s.id === id)?.name?.trim() || null)), [me, staff, copy]);
  const replyList = replies.data;
  const messages = useMemo<ThreadMessage[]>(() => {
    if (!t) return [];
    return [
      // What the requester sent first isn't a message in the conversation: it heads the thread.
      { id: `ticket-${t.id}`, body: t.message, mine: false, authorName: who, timestamp: t.createdAt },
      ...(replyList ?? []).map((r) => toMessage(r, who, t.userId ?? null, nameOf, copy)),
    ];
  }, [t, replyList, who, nameOf, copy]);

  const statusLabel = t ? (copy.status[t.status] ?? t.status) : null;
  const assigneeLabel = t ? (t.assigneeId === null ? copy.staff.unassigned : (nameOf(t.assigneeId) ?? copy.thread.support)) : null;
  const tenantsLabel = tenants.data ? requesterTenantsLabel(tenants.data) : null;
  const statuses = AGENT_TICKET_STATUSES.map((s) => ({ value: s, label: copy.status[s], current: t?.status === s }));
  const closed = t ? CLOSED.has(t.status) : false;
  const threadFailed = ticket.isError || replies.isError;

  const header: ReactNode = t ? (
    <View testID="genesis-support-agent-ticket" style={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
      <NativeText preset="label">{who}</NativeText>
      {person?.email ? <NativeText preset="body-sm" className="text-muted-foreground">{person.email}</NativeText> : null}
      {tenantsLabel ? (
        <NativeText preset="body-sm" className="text-muted-foreground" testID="genesis-support-agent-requester-tenants">
          {tenantsLabel}
        </NativeText>
      ) : null}
      <NativeText preset="caption" className="text-muted-foreground">
        {[`${copy.staff.status}: ${statusLabel}`, `${copy.staff.assignee}: ${assigneeLabel}`].join(" · ")}
      </NativeText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityLabel={copy.staff.status}>
        {statuses.map((s) => (
          <NativeButton
            key={s.value}
            size="sm"
            variant={s.current ? "default" : "outline"}
            onPress={() => void setStatus(s.value).catch(() => undefined)}
            testID={`genesis-support-agent-status-${s.value}`}
          >
            {s.label}
          </NativeButton>
        ))}
      </View>
      {me ? (
        <View style={{ flexDirection: "row" }}>
          <NativeButton size="sm" variant="outline" onPress={() => void toggleMine().catch(() => undefined)} testID="genesis-support-agent-take">
            {mine ? labels.handBack : labels.take}
          </NativeButton>
        </View>
      ) : null}
      {changeFailed ? (
        <NativeText preset="body-sm" className="text-destructive" testID="genesis-support-agent-change-failed">
          {copy.staff.failed}
        </NativeText>
      ) : null}
    </View>
  ) : null;

  const aboveComposer = sendFailed ? (
    <NativeText preset="body-sm" className="text-destructive" style={{ paddingHorizontal: 12, paddingTop: 8 }} testID="genesis-support-agent-send-failed">
      {copy.agentInbox.sendFailed}
    </NativeText>
  ) : closed ? (
    <NativeText preset="body-sm" className="text-muted-foreground" style={{ paddingHorizontal: 12, paddingTop: 8 }} testID="genesis-support-agent-closed">
      {labels.closedHint}
    </NativeText>
  ) : undefined;

  return {
    testID: "genesis-support-agent-thread",
    headerTitle: t ? reportHeading(t) : copy.agentInbox.conversation,
    ticket: t,
    notFound: ticket.isSuccess && t === null,
    notAllowed,
    requester: t ? { id: t.userId ?? null, name: who, email: person?.email ?? t.requesterEmail ?? null } : null,
    requesterTenants: tenantsLabel,
    live,
    me: me ?? null,
    mine,
    statusLabel,
    assigneeLabel,
    statuses,
    setStatus,
    assignees: staff.map((s) => ({ id: s.id, name: s.id === me ? copy.thread.you : s.name?.trim() || copy.thread.support, current: t?.assigneeId === s.id })),
    assign,
    toggleMine,
    changeFailed,
    sendFailed,
    header,
    messages,
    // The thread isn't whole until its replies are in.
    loading: ticket.isPending || (Boolean(t) && (where.isPending || replies.isPending) && !threadFailed),
    error: threadFailed,
    errorTitle: notAllowed ? copy.agentInbox.notAllowedTitle : ticket.isError ? copy.agentInbox.ticketErrorTitle : copy.agentInbox.threadErrorTitle,
    errorBody: notAllowed ? copy.agentInbox.notAllowedBody : copy.agentInbox.errorBody,
    onRetry: () => {
      void ticket.refetch();
      void replies.refetch();
    },
    retryLabel: copy.agentInbox.retry,
    readAt: t?.userReadAt ?? null,
    readLabel: copy.thread.read,
    emptyTitle: copy.thread.emptyTitle,
    emptyBody: copy.agentInbox.emptyBody,
    labels: { you: copy.thread.you, internal: copy.thread.internalNote, sending: copy.thread.sending, notSent: copy.thread.notSent, retryHint: copy.thread.retryHint },
    // Not while the thread failed to load: nobody should answer a conversation they can't see.
    composer:
      t && !threadFailed
        ? {
            value: draft,
            onChangeText: (text: string) => {
              setDraft(text);
              if (sendFailed) setSendFailed(false);
            },
            onSend: send,
            sending,
            maxLength: 10_000,
            placeholder: note ? copy.agentInbox.notePlaceholder : copy.thread.placeholder,
            sendLabel: copy.thread.send,
            sendingLabel: copy.thread.sending,
            // Notes need the conversation: without chat, only a reply.
            ...(live
              ? {
                  modes: [
                    { id: REPLY, label: copy.agentInbox.reply },
                    { id: NOTE, label: copy.thread.internalNote, tone: "internal" as const },
                  ],
                  modesLabel: copy.agentInbox.modesLabel,
                  mode,
                  onModeChange: setMode,
                }
              : {}),
            ...(aboveComposer ? { above: aboveComposer } : {}),
          }
        : null,
  };
}
