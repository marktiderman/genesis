/**
 * The support queue as a Genesis view's inbox (`<ResourceView type="inbox">`): plain blocks an
 * app passes to `defineView` over the agent queue, so a ticket list opens as a three-pane inbox
 * with the queue's own views as its rail. Plain data and functions: nothing here imports a
 * platform.
 *
 * ```ts
 * createSupabaseProvider(supabase, { resources: { support_queue: { source: supportQueueSource() } } });
 * export const queueView = defineView(supportQueueContract, { inbox: ticketInbox, segments: ticketSegments, types: ["inbox", "table"] });
 * // <ResourceView view={queueView} inbox={{ renderReading: (t) => <SupportStaffThread client={support} reportId={t.id} resolveUser={…} /> }} />
 * ```
 */

/**
 * A provider `source` for the agent queue: migration 0009's `support_agent_tickets`, with the
 * queue (`mine`, `unassigned`, `all`) taken from the list's `inbox_view` filter, which the
 * Mine and Unassigned segments set.
 */
export function supportQueueSource() {
  return {
    rpc: "support_agent_tickets",
    args: (context: { take(field: string): unknown }) => ({ inbox_view: context.take("inbox_view") ?? "all" }),
  };
}

/** A ticket's status tones, for a view's `fields.status.tones`. */
export const TICKET_STATUS_TONES = Object.freeze({
  open: "info",
  submitted: "info",
  in_progress: "warning",
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
 * The queue's segments, the inbox's rail: Mine and Unassigned (the queue function's own views),
 * then by status. Waiting on the requester is the app's to add, by its own status or column.
 */
export const ticketSegments = Object.freeze([
  { id: "mine", label: "Mine", args: { inbox_view: "mine" }, count: true },
  { id: "unassigned", label: "Unassigned", args: { inbox_view: "unassigned" }, count: true },
  { id: "open", label: "Open", where: { status: ["open", "submitted", "in_progress"] }, count: true },
  { id: "solved", label: "Solved", where: { status: ["addressed", "wont_fix"] } },
  { id: "all", label: "All" },
] as const);
