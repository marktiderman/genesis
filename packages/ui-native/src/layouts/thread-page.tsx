/**
 * ThreadPage — one conversation: messages oldest first, a composer at the
 * bottom that follows the keyboard, attachments, a read receipt, earlier
 * pages, going to a message, and the first unread.
 *
 * Generic: a support ticket with staff replies, a help desk thread with
 * internal notes, a direct message, a comment thread. Mine are on the
 * trailing side in the tint, theirs on the leading side on `surface`, over the
 * `groupedBackground` page (SettingsPage's iOS palette). Events ("Sam was
 * assigned") are centred, muted lines between them.
 *
 * Built from the messaging atoms, so an app can take this whole or build its
 * own from the same parts: `NativeThreadList` (bottom-anchored, holds its
 * place while earlier messages load, follows the newest only at the bottom)
 * and `NativeComposerBar` (grows as you type, modes with a tone, 44pt send).
 *
 * Keyboard: the page sits in `GenesisModules.keyboardAvoidingView`
 * (react-native-keyboard-controller's, `translate-with-padding`: the composer
 * follows the keyboard frame by frame) when the app passed it, else React
 * Native's `KeyboardAvoidingView`. Dragging the list down dismisses the
 * keyboard interactively. (The app's `KeyboardScrollProvider` no longer
 * applies here: a virtualized list can't live in a scroll view.)
 *
 * Data: rows arrive as props and the page never fetches. A row's send state
 * is data (`sending`, `pending`, `paused`, `failed`, `conflict`) with
 * `onRetry` / `onDiscard`, whatever feeds it (an outbox, an offline queue).
 * Ids must stay the same across refreshes (a cache, then the server).
 *
 * Read-only: pass `composer={null}` (a closed ticket, a viewer) and an
 * optional `closedNotice`.
 *
 * Slots: `message`, `event`, `attachment`, `readReceipt`, `unreadDivider`,
 * `composer`, `composerAccessory` (beside the input: attach a screenshot),
 * `headerRegion` (pinned above the list: a ticket's status and assignee),
 * `header` (scrolls above the first message: what the thread is about),
 * `earlier` and `empty`.
 *
 * @stability Beta
 */
import { useCallback, useRef, useState, type ComponentType, type ReactNode } from "react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { Image, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useGenesisModules } from "../native-modules";
import { NativeEmptyState } from "../components/empty-state";
import { NativeText } from "../components/text";
import { NativeComposerBar, type ComposerMode, type ComposerTone } from "../components/composer-bar";
import { NativeThreadList, type NativeThreadListHandle } from "../components/thread-list";
import { composeHeaderOptions, type ScreenHeaderProps } from "./screen-container";

export interface ThreadAttachment {
  id: string;
  /** An image URI (a signed URL, a file:// path). */
  uri: string;
  width?: number;
  height?: number;
  accessibilityLabel?: string;
  onPress?: () => void;
}

/**
 * Where a message is on its way. `sending` (in flight), `sent`, `pending`
 * (queued: offline), `paused` (the session expired: sign in to send),
 * `failed` and `conflict` (changed elsewhere) with `onRetry` / `onDiscard`.
 */
export type ThreadMessageStatus = "sending" | "sent" | "pending" | "paused" | "failed" | "conflict";

export interface ThreadMessage {
  /** Stays the same across refreshes, or the list jumps. */
  id: string;
  /** `event`: a centred line between messages ("Sam was assigned"); `body` is its text. Default `message`. */
  kind?: "message" | "event";
  body: string;
  /** Sent by the person using the app: trailing side, tint. */
  mine: boolean;
  /** Shown over theirs ("Support"); never over mine. */
  authorName?: string;
  timestamp: string | Date;
  status?: ThreadMessageStatus;
  onRetry?: () => void;
  onDiscard?: () => void;
  /** `internal`: a staff-only note, tinted so it never reads like a reply. */
  tone?: ComposerTone;
  attachments?: ThreadAttachment[];
}

export interface ThreadComposer {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** A send is in flight: the button spins and won't send twice. */
  sending?: boolean;
  placeholder?: string;
  sendLabel?: string;
  /** Turns the send button off (besides an empty or blank value). */
  disabled?: boolean;
  maxLength?: number;
  /** The input grows to this many lines, then scrolls. Default 6. */
  maxLines?: number;
  /** Ways to send ("Reply", "Internal note"); two or more show the picker. */
  modes?: readonly ComposerMode[];
  mode?: string;
  onModeChange?: (id: string) => void;
}

/** What the default parts say. */
export interface ThreadLabels {
  /** Who "mine" is, to VoiceOver. */
  you: string;
  sending: string;
  /** Queued while offline. */
  pending: string;
  /** The session expired. */
  paused: string;
  notSent: string;
  /** Changed somewhere else before it was sent. */
  conflict: string;
  retryHint: string;
  discard: string;
  /** The first unread message's divider. */
  newMessages: string;
  /** The pill that goes back to the newest message. */
  jumpToLatest: string;
  /** While `refreshing`. */
  updating: string;
  /** Said when a `jumpTo` message can't be found. */
  messageGone: string;
}

const DEFAULT_LABELS: ThreadLabels = {
  you: "You",
  sending: "Sending",
  pending: "Waiting to send",
  paused: "Sign in to send",
  notSent: "Not sent. Tap to retry.",
  conflict: "Not sent: changed elsewhere. Tap to retry.",
  retryHint: "Double tap to send again",
  discard: "Discard",
  newMessages: "New messages",
  jumpToLatest: "Jump to latest",
  updating: "Updating…",
  messageGone: "That message isn't available.",
};

export type ThreadPageSlotMap = {
  message: ThreadMessage & { testID: string; timeLabel: string; showReadReceipt: boolean; labels: ThreadLabels };
  event: ThreadMessage & { testID: string; timeLabel: string };
  attachment: ThreadAttachment & { testID: string; mine: boolean };
  readReceipt: { label: string; testID: string };
  unreadDivider: { label: string; testID: string };
  /** `accessory` is the `composerAccessory` slot, already rendered. */
  composer: ThreadComposer & { testID: string; accessory?: ReactNode };
  composerAccessory: { testID: string };
  /** Pinned above the list: a ticket's status, assignee and priority, and "more". */
  headerRegion: { testID: string };
  header: { testID: string };
  earlier: { loading: boolean; onPress: () => void; label: string; testID: string };
  empty: { title: string; body: string; testID: string };
};

export interface ThreadPageProps extends ScreenHeaderProps {
  /** Oldest first. */
  messages: ThreadMessage[];
  /** `null`: read-only, no composer. */
  composer: ThreadComposer | null;
  /** Shown instead of the composer when it is `null` ("This conversation is closed"). */
  closedNotice?: string;
  /** Above the first message, scrolling with them. Prefer `slots.header` for a component. */
  header?: ReactNode;
  /**
   * When the other side last read the thread. My newest message sent before
   * it shows the read receipt.
   */
  readAt?: string | Date | null;
  readLabel?: string;
  /** There are older messages: they load near the top, and a "load earlier" button shows. */
  hasEarlier?: boolean;
  onLoadEarlier?: () => void;
  loadingEarlier?: boolean;
  earlierLabel?: string;
  /** The first message the reader hasn't seen: a "New messages" divider above it. */
  firstUnreadId?: string | null;
  /** Go to this message (a search result, a pinned one), loading with `onLoadUntil` until it's here. */
  jumpTo?: string | null;
  /** Load earlier pages until the message is held; resolve false when it can't be found. */
  onLoadUntil?: (id: string) => Promise<boolean>;
  /** A `jumpTo` message couldn't be found. Default: VoiceOver says `labels.messageGone`. */
  onJumpFailed?: (id: string) => void;
  /** Fresher rows are on their way (the cache showed first): a quiet "Updating…" line. */
  refreshing?: boolean;
  /** Where the page starts below the window's top, for the keyboard. Default 100 on iOS (a standard header). */
  keyboardVerticalOffset?: number;
  emptyTitle?: string;
  emptyBody?: string;
  formatTime?: (date: Date) => string;
  /** The words the defaults say, for translating. */
  labels?: Partial<ThreadLabels>;
  slots?: Slots<ThreadPageSlotMap>;
  slotProps?: SlotPropsFor<ThreadPageSlotMap>;
  /** testID on the root. Default `"thread-page"`. */
  testID?: string;
}

/** `<Stack.Screen options>` for a ThreadPage: a standard (not large) title, like Messages. */
export function getThreadPageStackOptions(props: ScreenHeaderProps & { headerTitle?: string }): Record<string, unknown> {
  return composeHeaderOptions({
    headerTitle: props.headerTitle ?? "Conversation",
    large: props.large ?? false,
    scrollEdgeBehavior: props.scrollEdgeBehavior,
    headerLeft: props.headerLeft,
    headerRight: props.headerRight,
    headerOptions: props.headerOptions,
  });
}

const toDate = (value: string | Date) => (typeof value === "string" ? new Date(value) : value);

function defaultTime(date: Date): string {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Sent and delivered: a read receipt can mark it. */
const delivered = (m: ThreadMessage) => m.status === undefined || m.status === "sent";

/** The newest of my messages the other side has read, or null. */
export function readReceiptFor(messages: readonly ThreadMessage[], readAt: string | Date | null | undefined): string | null {
  if (!readAt) return null;
  const read = toDate(readAt).getTime();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.kind !== "event" && m.mine && delivered(m) && toDate(m.timestamp).getTime() <= read) return m.id;
  }
  return null;
}

export function ThreadPage({
  messages,
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
  refreshing = false,
  keyboardVerticalOffset,
  emptyTitle,
  emptyBody,
  formatTime = defaultTime,
  labels: labelOverrides,
  slots = {},
  slotProps = {},
  testID = "thread-page",
}: ThreadPageProps) {
  const colors = useThemeRoles();
  const genesis = useGenesisModules();
  const listRef = useRef<NativeThreadListHandle | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const receiptFor = readReceiptFor(messages, readAt);
  const labels: ThreadLabels = { ...DEFAULT_LABELS, ...labelOverrides };

  const renderRow = useCallback(
    (message: ThreadMessage) => {
      const timeLabel = formatTime(toDate(message.timestamp));
      const divider =
        message.id === firstUnreadId
          ? renderSlot(DefaultUnreadDivider, slots.unreadDivider, { label: labels.newMessages, testID: `${testID}-unread` }, slotProps.unreadDivider)
          : null;
      if (message.kind === "event") {
        return (
          <View style={{ paddingVertical: 3 }}>
            {divider}
            {renderSlot(DefaultEvent, slots.event, { ...message, testID: `${testID}-event-${message.id}`, timeLabel }, slotProps.event)}
          </View>
        );
      }
      return (
        <View style={{ paddingVertical: 3 }}>
          {divider}
          {renderSlot(
            DefaultMessage,
            slots.message,
            { ...message, testID: `${testID}-message-${message.id}`, timeLabel, showReadReceipt: message.id === receiptFor, labels },
            slotProps.message,
          )}
          {message.attachments?.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: message.mine ? "flex-end" : "flex-start", marginTop: 4 }}>
              {message.attachments.map((attachment) => (
                <View key={attachment.id}>
                  {renderSlot(
                    DefaultAttachment,
                    slots.attachment,
                    { ...attachment, mine: message.mine, testID: `${testID}-attachment-${attachment.id}` },
                    slotProps.attachment,
                  )}
                </View>
              ))}
            </View>
          ) : null}
          {message.id === receiptFor
            ? renderSlot(DefaultReadReceipt, slots.readReceipt, { label: readLabel, testID: `${testID}-read-receipt` }, slotProps.readReceipt)
            : null}
        </View>
      );
    },
    // `labels` is rebuilt each render from labelOverrides; the row reads it as is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firstUnreadId, formatTime, receiptFor, readLabel, slots, slotProps, testID, labelOverrides],
  );

  const send = composer
    ? () => {
        composer.onSend();
        // What you send is what you look at next, wherever the list was.
        listRef.current?.scrollToEnd({ animated: true });
      }
    : undefined;

  const footer = composer ? (
    renderSlot(
      DefaultComposer,
      slots.composer,
      {
        ...composer,
        onSend: send!,
        testID: `${testID}-composer`,
        accessory: renderSlot(Nothing, slots.composerAccessory, { testID: `${testID}-composer-accessory` }, slotProps.composerAccessory),
      },
      slotProps.composer,
    )
  ) : closedNotice ? (
    <NativeText testID={`${testID}-closed`} style={{ textAlign: "center", padding: 16, color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>
      {closedNotice}
    </NativeText>
  ) : null;

  const listHeader = (
    <>
      {header ?? renderSlot(Nothing, slots.header, { testID: `${testID}-header` }, slotProps.header)}
      {refreshing ? (
        <View testID={`${testID}-updating`} accessibilityLiveRegion="polite" accessible accessibilityLabel={labels.updating}>
          <NativeText style={{ textAlign: "center", paddingVertical: 4, color: colors.tertiaryLabel, fontSize: 12, lineHeight: 16 }}>{labels.updating}</NativeText>
        </View>
      ) : null}
    </>
  );

  const KeyboardAvoiding = (genesis.keyboardAvoidingView ?? KeyboardAvoidingView) as ComponentType<Record<string, unknown>>;
  const offset = keyboardVerticalOffset ?? (Platform.OS === "ios" ? 100 : 0);
  const keyboardProps = genesis.keyboardAvoidingView
    ? { behavior: "translate-with-padding", keyboardVerticalOffset: offset }
    : { behavior: Platform.OS === "ios" ? "padding" : undefined, keyboardVerticalOffset: offset };

  return (
    <SafeAreaView testID={testID} edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
      <KeyboardAvoiding testID={`${testID}-keyboard`} style={{ flex: 1 }} {...keyboardProps}>
        {renderSlot(Nothing, slots.headerRegion, { testID: `${testID}-header-region` }, slotProps.headerRegion)}
        <View style={{ flex: 1 }}>
          <NativeThreadList<ThreadMessage>
            ref={listRef}
            testID={`${testID}-messages`}
            data={messages}
            keyExtractor={(m) => m.id}
            getItemType={(m) => (m.kind === "event" ? "event" : m.mine ? "mine" : "theirs")}
            renderItem={renderRow}
            hasEarlier={hasEarlier}
            onLoadEarlier={onLoadEarlier}
            loadingEarlier={loadingEarlier}
            earlierLabel={earlierLabel}
            renderEarlier={(p) => renderSlot(DefaultEarlierButton, slots.earlier, { ...p, testID: `${testID}-earlier` }, slotProps.earlier)}
            jumpTo={jumpTo}
            onLoadUntil={onLoadUntil}
            jumpAnnouncement={(m) => [m.mine ? labels.you : m.authorName, m.body].filter(Boolean).join(", ")}
            onJumpFailed={onJumpFailed}
            onAtBottomChange={setAtBottom}
            header={listHeader}
            empty={renderSlot(
              DefaultEmpty,
              slots.empty,
              { title: emptyTitle ?? "No messages yet", body: emptyBody ?? "Write the first one below.", testID: `${testID}-empty` },
              slotProps.empty,
            )}
          />
          {!atBottom && messages.length > 0 ? (
            <Pressable
              testID={`${testID}-jump-latest`}
              accessibilityRole="button"
              accessibilityLabel={labels.jumpToLatest}
              onPress={() => listRef.current?.scrollToEnd({ animated: true })}
              style={{ position: "absolute", bottom: 8, alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.surface }}
            >
              <NativeText preset="label" style={{ color: colors.tint }}>
                {labels.jumpToLatest}
              </NativeText>
            </Pressable>
          ) : null}
        </View>
        {footer}
      </KeyboardAvoiding>
    </SafeAreaView>
  );
}

function Nothing(_props: { testID: string }) {
  return null;
}

function DefaultEarlierButton({ loading, onPress, label, testID }: ThreadPageSlotMap["earlier"]) {
  const colors = useThemeRoles();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: loading }} onPress={onPress} disabled={loading} style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
      <NativeText preset="label" style={{ color: colors.tint }}>
        {label}
      </NativeText>
    </Pressable>
  );
}

function DefaultEmpty({ title, body, testID }: ThreadPageSlotMap["empty"]) {
  return <NativeEmptyState variant="first-run" title={title} body={body} testID={testID} />;
}

function DefaultUnreadDivider({ label, testID }: ThreadPageSlotMap["unreadDivider"]) {
  const colors = useThemeRoles();
  return (
    <View testID={testID} accessibilityRole="header" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.tint }} />
      <NativeText style={{ color: colors.tint, fontSize: 12, lineHeight: 16 }}>{label}</NativeText>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.tint }} />
    </View>
  );
}

function DefaultEvent({ body, timeLabel, testID }: ThreadPageSlotMap["event"]) {
  const colors = useThemeRoles();
  return (
    <View testID={testID} accessible accessibilityLabel={`${body}, ${timeLabel}`} style={{ alignSelf: "center", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.fill }}>
      <NativeText style={{ color: colors.secondaryLabel, fontSize: 12, lineHeight: 16, textAlign: "center" }}>{body}</NativeText>
    </View>
  );
}

// No `color` key on mine: an undefined color in the style would override the class's.
const MINE_TEXT = { fontSize: 17, lineHeight: 22 } as const;

/** What a message's state says under it, or null when it's sent. */
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
  const colors = useThemeRoles();
  const { labels } = message;
  const broken = message.status === "failed" || message.status === "conflict";
  const waiting = message.status === "sending" || message.status === "pending" || message.status === "paused";
  const internal = message.tone === "internal";
  const state = stateLabel(message);
  const label = [message.mine ? labels.you : (message.authorName ?? ""), message.body, message.timeLabel, state].filter(Boolean).join(", ");
  const actions = [
    ...(broken && message.onRetry ? [{ name: "activate", label: labels.retryHint }] : []),
    ...(message.onDiscard ? [{ name: "discard", label: labels.discard }] : []),
  ];
  return (
    <View style={{ alignItems: message.mine ? "flex-end" : "flex-start" }}>
      {!message.mine && message.authorName ? (
        <NativeText style={{ marginLeft: 12, marginBottom: 2, color: colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}>{message.authorName}</NativeText>
      ) : null}
      <Pressable
        testID={message.testID}
        accessible
        accessibilityLabel={label}
        accessibilityHint={broken && message.onRetry ? labels.retryHint : undefined}
        accessibilityActions={actions.length ? actions : undefined}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "discard") message.onDiscard?.();
          else if (e.nativeEvent.actionName === "activate" && broken) message.onRetry?.();
        }}
        onPress={broken ? message.onRetry : undefined}
        style={{
          maxWidth: "80%",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 18,
          backgroundColor: internal ? colors.surface : message.mine ? colors.tint : colors.surface,
          borderWidth: internal ? 1 : 0,
          borderColor: colors.warning,
          opacity: waiting ? 0.6 : 1,
        }}
      >
        <NativeText className={message.mine && !internal ? "text-primary-foreground" : undefined} style={message.mine && !internal ? MINE_TEXT : { ...MINE_TEXT, color: colors.label }}>
          {message.body}
        </NativeText>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, marginHorizontal: 12 }}>
        <NativeText testID={`${message.testID}-time`} style={{ color: broken ? colors.destructive : colors.tertiaryLabel, fontSize: 11, lineHeight: 14 }}>
          {state ?? message.timeLabel}
        </NativeText>
        {message.onDiscard && (broken || waiting) ? (
          <Pressable testID={`${message.testID}-discard`} accessibilityRole="button" accessibilityLabel={labels.discard} onPress={message.onDiscard} hitSlop={12}>
            <NativeText style={{ color: colors.secondaryLabel, fontSize: 11, lineHeight: 14 }}>{labels.discard}</NativeText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function DefaultAttachment({ uri, width, height, accessibilityLabel, onPress, testID }: ThreadPageSlotMap["attachment"]) {
  const ratio = width && height ? width / height : 0.6;
  const w = 140;
  return (
    <Pressable testID={testID} accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? "Attachment"} onPress={onPress} disabled={!onPress}>
      <Image source={{ uri }} style={{ width: w, height: Math.round(w / ratio), borderRadius: 12 }} resizeMode="cover" />
    </Pressable>
  );
}

function DefaultReadReceipt({ label, testID }: ThreadPageSlotMap["readReceipt"]) {
  const colors = useThemeRoles();
  return (
    <NativeText testID={testID} style={{ alignSelf: "flex-end", marginHorizontal: 12, color: colors.secondaryLabel, fontSize: 11, lineHeight: 14 }}>
      {label}
    </NativeText>
  );
}

function DefaultComposer({ accessory, testID, ...composer }: ThreadPageSlotMap["composer"]) {
  return <NativeComposerBar {...composer} leading={accessory} testID={testID} />;
}
