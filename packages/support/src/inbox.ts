/**
 * The support queue as a Genesis view's inbox (`<ResourceView type="inbox">`): plain blocks an
 * app passes to `defineView` over the agent queue, so a ticket list opens as a three-pane inbox
 * with the queue's own views as its rail. Plain data and functions: nothing here imports a
 * platform.
 *
 * ```ts
 * createSupabaseProvider(supabase, { resources: { support_queue: { source: supportQueueSource(), writeColumns: [] } } });
 * export const queueView = defineView(supportQueueContract, { inbox: ticketInbox, segments: ticketSegments, types: ["inbox", "table"] });
 * // <ResourceView view={queueView} inbox={{ renderReading: (t) => <SupportStaffThread client={support} reportId={t.id} resolveUser={…} /> }} />
 * ```
 */

/**
 * A provider `source` for the agent queue: migration 0018's `support_agent_queue`, which returns
 * every ticket (no limit of its own) so the provider pages, counts and filters it. The queue
 * (`mine`, `unassigned`, `pending`, `closed`, `all`, with 0013's meanings: Mine and Unassigned hold
 * active tickets only) comes from the list's `inbox_view` filter, which the segments set as `args`. The tenant is `options.tenant` when given, else the list's
 * `tenant_id` filter (a view with `scope: ["tenant_id"]`, under the viewer's workspace), else the
 * app's own.
 */
export function supportQueueSource(options: { tenant?: string | null } = {}) {
  return {
    rpc: "support_agent_queue",
    args: (context: { take(field: string): unknown }) => {
      // Always taken: under a fixed tenant the list's own tenant_id filter would otherwise stay on
      // the query and match none of that tenant's rows.
      const listed = context.take("tenant_id");
      return {
        tenant: options.tenant !== undefined ? options.tenant : (listed ?? null),
        inbox_view: context.take("inbox_view") ?? "all",
      };
    },
  };
}

/** A ticket's status tones, for a view's `fields.status.tones`. */
export const TICKET_STATUS_TONES = Object.freeze({
  open: "info",
  submitted: "info",
  in_progress: "warning",
  pending: "muted",
  addressed: "success",
  wont_fix: "muted",
} as const);

/** The queue's rows as an inbox: the title, the latest message, when, who, unread for agents, the status. */
export const ticketInbox = Object.freeze({
  title: "title",
  preview: "preview",
  time: "activity_at",
  from: "requester_name",
  unread: "agent_unread",
  badge: "status",
} as const);

/**
 * The queue's segments, the inbox's rail, with the agent inbox's (SupportAgentInbox's) meanings:
 * Mine and Unassigned hold active tickets (not pending, not closed); Open every active one; Pending
 * those waiting on the requester; Closed the addressed and won't-fix ones; All every ticket. The
 * queue's own views are passed as `args`, so the server decides which ticket is in which.
 */
export const ticketSegments = Object.freeze([
  { id: "mine", label: "Mine", args: { inbox_view: "mine" }, count: true },
  { id: "unassigned", label: "Unassigned", args: { inbox_view: "unassigned" }, count: true },
  { id: "open", label: "Open", where: { status: ["open", "submitted", "in_progress"] }, count: true },
  { id: "pending", label: "Pending", args: { inbox_view: "pending" }, count: true },
  { id: "closed", label: "Closed", args: { inbox_view: "closed" } },
  { id: "all", label: "All" },
] as const);
