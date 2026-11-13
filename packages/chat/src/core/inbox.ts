/**
 * A list of conversations as a Genesis view's inbox (`<ResourceView type="inbox">`): a plain
 * block an app passes to `defineView` over its conversations (genesis_chat's `inbox` function as
 * a source, or a view of its own), with the open conversation as the reading pane:
 *
 * ```tsx
 * const conversationsView = defineView(conversationsContract, { inbox: conversationInbox, types: ["inbox"] });
 * <ResourceView view={conversationsView} inbox={{ renderReading: (c) => <ChatThread conversationId={String(c.conversation_id)} resolveUser={resolveUser} /> }} />
 * ```
 */
export const conversationInbox = Object.freeze({
  title: "title",
  time: "last_message_at",
  /** genesis_chat's inbox counts what you haven't read (to 99): a row is unread above 0. */
  unread: (row: Record<string, unknown>) => Number(row["unread"] ?? 0) > 0,
} as const);
