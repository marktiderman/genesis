/**
 * ThreadPage — one conversation on the web: messages oldest first, a composer
 * at the bottom, attachments, a read receipt, earlier pages, going to a
 * message, the first unread, events between messages, and send states.
 *
 * The web twin of ui-native's `ThreadPage`, with the same props and slots, on
 * the shared conversation contract (`@marktiderman/genesis-core/conversation`):
 * the same `ThreadMessage[]` and `ThreadComposer` render on both. Built from
 * the web atoms `ThreadList` and `ComposerBar`, so an app can take this whole
 * or build its own thread from the same parts.
 *
 * It fills its container (a flex column of full height): put it in a page, a
 * pane of `InboxLayout`, or the chat dock. Mine are on the trailing side in
 * `primary`, theirs on the leading side on `muted`; an internal note
 * (`tone: "internal"`) is edged in `warning` and says so to a screen reader.
 *
 * Data: rows arrive as props and the page never fetches. A row's send state is
 * data (`sending`, `pending`, `paused`, `failed`, `conflict`) with `onRetry` /
 * `onDiscard`. Read-only: `composer={null}`, with an optional `closedNotice`.
 *
 * Slots: `message`, `event`, `attachment`, `readReceipt`, `unreadDivider`,
 * `composer`, `composerAccessory`, `headerRegion` (pinned above the list),
 * `header` (scrolls above the first message), `earlier` and `empty`.
 *
 * @stability Beta
 */
import * as React from "react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import {
  DEFAULT_THREAD_LABELS,
  formatMessageTime,
  readReceiptFor,
  type ThreadAttachment,
  type ThreadComposer,
  type ThreadLabels,
  type ThreadMessage,
} from "@marktiderman/genesis-core/conversation";
import { MessagesSquare } from "lucide-react";
import { cn } from "../../../utils";
import { Button } from "../../ui/button";
import { EmptyState } from "../empty-state";
import { ComposerBar } from "./composer-bar";
import { ThreadList, type ThreadListHandle, type ThreadRowInfo } from "./thread-list";

export type ThreadPageSlotMap = {
  message: ThreadMessage & { testID: string; timeLabel: string; showReadReceipt: boolean; labels: ThreadLabels; /** A jump just landed here (two seconds). */ highlighted: boolean };
  event: ThreadMessage & { testID: string; timeLabel: string };
  attachment: ThreadAttachment & { testID: string; mine: boolean };
  readReceipt: { label: string; testID: string };
  unreadDivider: { label: string; testID: string };
  /** `accessory` is the `composerAccessory` slot, already rendered. */
  composer: ThreadComposer & { testID: string; accessory?: React.ReactNode; sendOn?: "enter" | "mod-enter" };
  composerAccessory: { testID: string };
  /** Pinned above the list: a ticket's status, assignee and priority, and "more". */
  headerRegion: { testID: string };
  header: { testID: string };
  earlier: { loading: boolean; onPress: () => void; label: string; testID: string };
  empty: { title: string; body: string; testID: string };
};

export interface ThreadPageProps {
  /** Oldest first. */
  messages: ThreadMessage[];
  /** Which conversation this is. When it changes (another row picked in an inbox), the thread opens afresh: at the first unread, or the newest. */
  conversationId?: string | null;
  /** `null`: read-only, no composer. */
  composer: ThreadComposer | null;
  /** Shown instead of the composer when it is `null` ("This conversation is closed"). */
  closedNotice?: string;
  /** Above the first message, scrolling with them. Prefer `slots.header` for a component. */
  header?: React.ReactNode;
  /** When the other side last read the thread: my newest message sent before it shows the read receipt. */
  readAt?: string | Date | null;
  readLabel?: string;
  /** There are older messages: they load near the top, and a "load earlier" button shows. */
  hasEarlier?: boolean;
  onLoadEarlier?: () => void;
  loadingEarlier?: boolean;
  earlierLabel?: string;
  /** The first message the reader hasn't seen: a "New messages" divider above it. */
  firstUnreadId?: string | null;
  /** Go to this message, loading with `onLoadUntil` until it's here. */
  jumpTo?: string | null;
  onLoadUntil?: (id: string) => Promise<boolean>;
  /** A `jumpTo` message couldn't be found (the list goes back to the newest). */
  onJumpFailed?: (id: string) => void;
  /** The first page is loading: a skeleton instead of the empty state, and a jump waits for it. */
  loading?: boolean;
  /** Fresher rows are on their way (the cache showed first): a quiet "Updating…" line. */
  updating?: boolean;
  /** Which key sends. Default `enter` (Shift+Enter for a new line). Native ignores it. */
  sendOn?: "enter" | "mod-enter";
  emptyTitle?: string;
  emptyBody?: string;
  formatTime?: (date: Date) => string;
  /** The words the defaults say, for translating. */
  labels?: Partial<ThreadLabels>;
  slots?: Slots<ThreadPageSlotMap>;
  slotProps?: SlotPropsFor<ThreadPageSlotMap>;
  className?: string;
  /** testID on the root. Default `"thread-page"`. */
  testID?: string;
}

const toDate = (value: string | Date) => (typeof value === "string" ? new Date(value) : value);

/** The web's words where the shared defaults are touch wording. */
const WEB_THREAD_LABELS: Partial<ThreadLabels> = {
  notSent: "Not sent. Select to retry.",
  conflict: "Not sent: changed elsewhere. Select to retry.",
};

const messageKey = (m: ThreadMessage) => m.id;

export function ThreadPage({
  messages,
  conversationId,
  composer,
  closedNotice,
  header,
  readAt,
  readLabel = "Read",
  hasEarlier = false,
  onLoadEarlier,
  loadingEarlier = false,
  earlierLabel = "Load earlier messages",
  firstUnreadId,
  jumpTo,
  onLoadUntil,
  onJumpFailed,
  loading = false,
  updating = false,
  sendOn,
  emptyTitle,
  emptyBody,
  formatTime = formatMessageTime,
  labels: labelOverrides,
  slots = {},
  slotProps = {},
  className,
  testID = "thread-page",
}: ThreadPageProps) {
  const listRef = React.useRef<ThreadListHandle | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [gone, setGone] = React.useState<string | null>(null);
  const receiptFor = readReceiptFor(messages, readAt);
  const labels: ThreadLabels = { ...DEFAULT_THREAD_LABELS, ...WEB_THREAD_LABELS, ...labelOverrides };
  // Someone else's message arriving at the bottom is said politely; yours and events aren't.
  const announce = (m: ThreadMessage) => (m.mine || m.kind === "event" || !m.body ? null : m.authorName ? `${m.authorName}: ${m.body}` : m.body);
  const goneTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (goneTimer.current) clearTimeout(goneTimer.current);
  }, []);

  const renderRow = (message: ThreadMessage, { highlighted }: ThreadRowInfo) => {
    const timeLabel = formatTime(toDate(message.timestamp));
    const divider =
      message.id === firstUnreadId
        ? renderSlot(DefaultUnreadDivider, slots.unreadDivider, { label: labels.newMessages, testID: `${testID}-unread` }, slotProps.unreadDivider)
        : null;
    if (message.kind === "event") {
      return (
        <div className="py-1">
          {divider}
          {renderSlot(DefaultEvent, slots.event, { ...message, testID: `${testID}-event-${message.id}`, timeLabel }, slotProps.event)}
        </div>
      );
    }
    return (
      <div className="py-1">
        {divider}
        {renderSlot(
          DefaultMessage,
          slots.message,
          { ...message, testID: `${testID}-message-${message.id}`, timeLabel, showReadReceipt: message.id === receiptFor, labels, highlighted },
          slotProps.message,
        )}
        {message.attachments?.length ? (
          <div className={cn("mt-1 flex flex-wrap gap-1.5", message.mine ? "justify-end" : "justify-start")}>
            {message.attachments.map((attachment) => (
              <React.Fragment key={attachment.id}>
                {renderSlot(DefaultAttachment, slots.attachment, { ...attachment, mine: message.mine, testID: `${testID}-attachment-${attachment.id}` }, slotProps.attachment)}
              </React.Fragment>
            ))}
          </div>
        ) : null}
        {message.id === receiptFor ? renderSlot(DefaultReadReceipt, slots.readReceipt, { label: readLabel, testID: `${testID}-read-receipt` }, slotProps.readReceipt) : null}
      </div>
    );
  };

  const footer = composer ? (
    renderSlot(
      DefaultComposer,
      slots.composer,
      {
        ...composer,
        sendingLabel: composer.sendingLabel ?? labels.sending,
        onSend: () => {
          composer.onSend();
          // What you send is what you look at next, wherever the list was.
          listRef.current?.scrollToEnd({ animated: true });
        },
        testID: `${testID}-composer`,
        accessory: renderSlot(Nothing, slots.composerAccessory, { testID: `${testID}-composer-accessory` }, slotProps.composerAccessory),
        sendOn,
      } as ThreadPageSlotMap["composer"],
      slotProps.composer,
    )
  ) : closedNotice ? (
    <p data-testid={`${testID}-closed`} className="border-t p-4 text-center text-sm text-muted-foreground">
      {closedNotice}
    </p>
  ) : null;

  return (
    <div data-testid={testID} className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      {renderSlot(Nothing, slots.headerRegion, { testID: `${testID}-header-region` }, slotProps.headerRegion)}
      {updating ? (
        <p data-testid={`${testID}-updating`} role="status" className="py-1 text-center text-xs text-muted-foreground">
          {labels.updating}
        </p>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ThreadList<ThreadMessage>
          ref={listRef}
          testID={`${testID}-messages`}
          data={messages}
          keyExtractor={messageKey}
          conversationId={conversationId}
          openAt={firstUnreadId}
          announce={announce}
          renderItem={renderRow}
          loading={loading}
          hasEarlier={hasEarlier}
          onLoadEarlier={onLoadEarlier}
          loadingEarlier={loadingEarlier}
          earlierLabel={earlierLabel}
          renderEarlier={(p) => renderSlot(DefaultEarlier, slots.earlier, { ...p, testID: `${testID}-earlier` }, slotProps.earlier)}
          jumpTo={jumpTo}
          onLoadUntil={onLoadUntil}
          onJumpFailed={(id) => {
            // Cleared first, so the same failure twice is said twice.
            setGone("");
            if (goneTimer.current) clearTimeout(goneTimer.current);
            goneTimer.current = setTimeout(() => setGone(labels.messageGone), 50);
            onJumpFailed?.(id);
          }}
          onAtBottomChange={setAtBottom}
          header={header ?? renderSlot(Nothing, slots.header, { testID: `${testID}-header` }, slotProps.header)}
          empty={renderSlot(
            DefaultEmpty,
            slots.empty,
            { title: emptyTitle ?? "No messages yet", body: emptyBody ?? "Write the first one below.", testID: `${testID}-empty` },
            slotProps.empty,
          )}
        />
        {!atBottom && messages.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            data-testid={`${testID}-jump-latest`}
            onClick={() => listRef.current?.scrollToEnd({ animated: true })}
            className="absolute bottom-3 left-1/2 h-11 -translate-x-1/2 rounded-full text-primary shadow-sm"
          >
            {labels.jumpToLatest}
          </Button>
        ) : null}
        <span role="status" aria-live="polite" className="sr-only">
          {gone}
        </span>
      </div>
      {footer}
    </div>
  );
}

function Nothing(_props: { testID: string }) {
  return null;
}

function DefaultEarlier({ loading, onPress, label, testID }: ThreadPageSlotMap["earlier"]) {
  return (
    <div className="flex justify-center py-2">
      <Button variant="ghost" size="sm" data-testid={testID} onClick={onPress} disabled={loading} aria-busy={loading} className="rounded-full text-primary">
        {label}
      </Button>
    </div>
  );
}

function DefaultEmpty({ title, body, testID }: ThreadPageSlotMap["empty"]) {
  return (
    <div data-testid={testID}>
      <EmptyState icon={MessagesSquare} title={title} description={body} />
    </div>
  );
}

function DefaultUnreadDivider({ label, testID }: ThreadPageSlotMap["unreadDivider"]) {
  return (
    <div data-testid={testID} role="separator" aria-label={label} className="flex items-center gap-2 py-2 text-xs text-primary">
      <span className="h-px flex-1 bg-primary" aria-hidden />
      <span>{label}</span>
      <span className="h-px flex-1 bg-primary" aria-hidden />
    </div>
  );
}

function DefaultEvent({ body, timeLabel, testID }: ThreadPageSlotMap["event"]) {
  return (
    <p data-testid={testID} className="mx-auto w-fit rounded-full bg-muted px-3 py-1 text-center text-xs text-muted-foreground">
      {body}
      <span className="sr-only">, {timeLabel}</span>
    </p>
  );
}

function stateLabel(message: ThreadPageSlotMap["message"]): string | null {
  const { labels } = message;
  switch (message.status) {
    case "sending":
      return labels.sending;
    case "pending":
      return labels.pending;
    case "paused":
      return labels.paused;
    case "failed":
      return labels.notSent;
    case "conflict":
      return labels.conflict;
    default:
      return null;
  }
}

function DefaultMessage(message: ThreadPageSlotMap["message"]) {
  const { labels } = message;
  const broken = message.status === "failed" || message.status === "conflict";
  const waiting = message.status === "sending" || message.status === "pending" || message.status === "paused";
  const internal = message.tone === "internal";
  const state = stateLabel(message);
  const canDiscard = Boolean(message.onDiscard) && (broken || waiting);
  const who = message.mine ? labels.you : (message.authorName ?? "");
  const stateId = React.useId();
  const prefix = [who, internal ? labels.internal : null].filter(Boolean).join(", ");
  const bubble = cn(
    "max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-[15px] leading-[22px]",
    internal ? "border-2 border-warning bg-background text-foreground" : message.mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
    message.highlighted && "ring-2 ring-ring ring-offset-2 ring-offset-background",
    waiting && "opacity-60",
  );
  const content = (
    <>
      {prefix ? <span className="sr-only">{prefix}: </span> : null}
      {message.body}
    </>
  );
  return (
    <div className={cn("flex flex-col", message.mine ? "items-end" : "items-start")}>
      {!message.mine && message.authorName ? (
        <span className="mb-0.5 ml-3 text-xs text-muted-foreground" aria-hidden>
          {message.authorName}
        </span>
      ) : null}
      {broken && message.onRetry ? (
        <button type="button" data-testid={message.testID} onClick={message.onRetry} aria-describedby={stateId} className={bubble}>
          {content}
        </button>
      ) : (
        <div data-testid={message.testID} className={bubble}>
          {content}
        </div>
      )}
      <div className="mx-3 mt-0.5 flex items-center gap-2 text-[11px] leading-[14px]">
        <span id={stateId} data-testid={`${message.testID}-time`} className={broken ? "text-destructive" : "text-muted-foreground"}>
          {state ?? message.timeLabel}
        </span>
        {canDiscard ? (
          <button type="button" data-testid={`${message.testID}-discard`} onClick={message.onDiscard} className="-my-3 min-h-11 px-1 text-muted-foreground underline-offset-2 hover:underline">
            {labels.discard}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DefaultAttachment({ uri, width, height, accessibilityLabel, onPress, testID }: ThreadPageSlotMap["attachment"]) {
  const ratio = width && height ? width / height : 0.6;
  const img = <img src={uri} alt={accessibilityLabel ?? "Attachment"} width={160} height={Math.round(160 / ratio)} loading="lazy" className="rounded-xl object-cover" />;
  return onPress ? (
    <button type="button" data-testid={testID} onClick={onPress} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {img}
    </button>
  ) : (
    <span data-testid={testID}>{img}</span>
  );
}

function DefaultReadReceipt({ label, testID }: ThreadPageSlotMap["readReceipt"]) {
  return (
    <p data-testid={testID} className="mx-3 text-right text-[11px] text-muted-foreground">
      {label}
    </p>
  );
}

function DefaultComposer({ accessory, testID, ...composer }: ThreadPageSlotMap["composer"] & { sendOn?: "enter" | "mod-enter" }) {
  return <ComposerBar {...composer} leading={accessory} testID={testID} />;
}
