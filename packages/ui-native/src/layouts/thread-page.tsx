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
 * Native's `KeyboardAvoidingView` (`padding` on iOS, `height` on Android, so
 * under edge-to-edge the composer still clears the keyboard). Dragging the
 * list down dismisses the keyboard (interactively on iOS). The app's
 * `KeyboardScrollProvider` no longer applies here, since a virtualized list
 * can't live in a scroll view: an app that passes it but not
 * `keyboardAvoidingView` gets a development warning saying so.
 *
 * Data: rows arrive as props and the page never fetches. A row's send state
 * is data (`sending`, `pending`, `paused`, `failed`, `conflict`) with
 * `onRetry` / `onDiscard`, whatever feeds it (an outbox, an offline queue).
 * Ids must stay the same across refreshes (a cache, then the server).
 *
 * Read-only: pass `composer={null}` (a closed ticket, a viewer) and an
 * optional `closedNotice`.
 *
 * `loading` shows a skeleton instead of the empty state; `updating` a quiet
 * line while fresher rows arrive.
 *
 * Slots: `message`, `event`, `attachment`, `readReceipt`, `unreadDivider`,
 * `composer`, `composerAccessory` (beside the input: attach a screenshot),
 * `headerRegion` (pinned above the list: a ticket's status and assignee),
 * `header` (scrolls above the first message: what the thread is about),
 * `earlier` and `empty`.
 *
 * @stability Beta
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { AccessibilityInfo, Image, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useGenesisModules } from "../native-modules";
import { useKeyboardScroll } from "./keyboard";
import { NativeEmptyState } from "../components/empty-state";
import { NativeText } from "../components/text";
import { NativeComposerBar, type ComposerMode } from "../components/composer-bar";
import { NativeThreadList, type NativeThreadListHandle, type ThreadRowInfo } from "../components/thread-list";
import {
  DEFAULT_THREAD_LABELS,
  formatMessageTime,
  readReceiptFor,
  type ThreadAttachment,
  type ThreadComposer,
  type ThreadLabels,
  type ThreadMessage,
} from "@marktiderman/genesis-core/conversation";

const announce = (text: string) => (AccessibilityInfo as { announceForAccessibility?: (t: string) => void }).announceForAccessibility?.(text);
import { composeHeaderOptions, type ScreenHeaderProps } from "./screen-container";

// The conversation contract is genesis-core's, shared with genesis-ui's ThreadPage.
export type { MessageTone, ThreadAttachment, ThreadComposer, ThreadLabels, ThreadMessage, ThreadMessageStatus } from "@marktiderman/genesis-core/conversation";
export { readReceiptFor } from "@marktiderman/genesis-core/conversation";

export type ThreadPageSlotMap = {
  message: ThreadMessage & { testID: string; timeLabel: string; showReadReceipt: boolean; labels: ThreadLabels; /** A jump just landed here (two seconds). */ highlighted: boolean };
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
  /** A `jumpTo` message couldn't be found (the list goes back to the newest). Default: VoiceOver says `labels.messageGone`. */
  onJumpFailed?: (id: string) => void;
  /** The first page is loading: a skeleton instead of the empty state, and a jump waits for it. */
  loading?: boolean;
  /** Fresher rows are on their way (the cache showed first): a quiet "Updating…" line under the header region, announced once. */
  updating?: boolean;
  /**
   * For the keyboard. With the keyboard-controller module the page finds its own place on screen
   * (`automaticOffset`) and this is extra space (default 0); with React Native's, it's where the
   * page starts below the window's top (default 100 on iOS: a standard header).
   */
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



const NO_SLOTS: Slots<ThreadPageSlotMap> = {};
const NO_SLOT_PROPS: SlotPropsFor<ThreadPageSlotMap> = {};
const messageKey = (m: ThreadMessage) => m.id;
const messageJumpId = (m: ThreadMessage) => m.jumpId ?? m.id;
const messageType = (m: ThreadMessage) => (m.kind === "event" ? "event" : m.mine ? "mine" : "theirs");

declare const __DEV__: boolean | undefined;
declare const process: { env: Record<string, string | undefined> } | undefined;
let warnedNoKeyboardModule = false;
/** Development-only: the app has keyboard-controller (it passed a keyboard scroll view) but not its KeyboardAvoidingView. */
function warnNoKeyboardModule() {
  const dev = typeof __DEV__ !== "undefined" ? __DEV__ : typeof process !== "undefined" && process.env.NODE_ENV !== "production";
  if (!dev || warnedNoKeyboardModule) return;
  warnedNoKeyboardModule = true;
  // genesis-allow-console: a development-only setup warning, like AuthScreen's
  console.warn(
    "[genesis] ThreadPage: react-native-keyboard-controller is set up (keyboardScroll) but GenesisModules.keyboardAvoidingView isn't, so the composer falls back to React Native's KeyboardAvoidingView. Pass keyboard-controller's KeyboardAvoidingView as `keyboardAvoidingView` in your Genesis modules.",
  );
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
  loading = false,
  updating = false,
  keyboardVerticalOffset,
  emptyTitle,
  emptyBody,
  formatTime = formatMessageTime,
  labels: labelOverrides,
  slots = NO_SLOTS,
  slotProps = NO_SLOT_PROPS,
  testID = "thread-page",
}: ThreadPageProps) {
  const colors = useThemeRoles();
  const genesis = useGenesisModules();
  const listRef = useRef<NativeThreadListHandle | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const receiptFor = readReceiptFor(messages, readAt);
  // Kept stable across renders (typing in the composer) unless the words change, so rows don't re-render.
  const labelsKey = labelOverrides ? JSON.stringify(labelOverrides) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const labels: ThreadLabels = useMemo(() => ({ ...DEFAULT_THREAD_LABELS, ...labelOverrides }), [labelsKey]);
  const keyboardScroll = useKeyboardScroll();
  useEffect(() => {
    if (keyboardScroll && !genesis.keyboardAvoidingView) warnNoKeyboardModule();
  }, [keyboardScroll, genesis.keyboardAvoidingView]);

  // "Updating…" on iOS too (a live region is Android-only).
  useEffect(() => {
    if (updating && Platform.OS === "ios") announce(labels.updating);
    // labels.updating is read when updating turns on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updating]);

  const renderRow = useCallback(
    (message: ThreadMessage, { highlighted }: ThreadRowInfo) => {
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
            { ...message, testID: `${testID}-message-${message.id}`, timeLabel, showReadReceipt: message.id === receiptFor, labels, highlighted },
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
    [firstUnreadId, formatTime, receiptFor, readLabel, slots, slotProps, testID, labels],
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
        sendingLabel: composer.sendingLabel ?? labels.sending,
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

  const listHeader = header ?? renderSlot(Nothing, slots.header, { testID: `${testID}-header` }, slotProps.header);

  const KeyboardAvoiding = (genesis.keyboardAvoidingView ?? KeyboardAvoidingView) as ComponentType<Record<string, unknown>>;
  const keyboardProps = genesis.keyboardAvoidingView
    ? { behavior: "translate-with-padding", automaticOffset: true, keyboardVerticalOffset: keyboardVerticalOffset ?? 0 }
    : { behavior: Platform.OS === "ios" ? "padding" : "height", keyboardVerticalOffset: keyboardVerticalOffset ?? (Platform.OS === "ios" ? 100 : 0) };

  return (
    <SafeAreaView testID={testID} edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
      {/* Pinned above the keyboard-avoiding view, so it doesn't move with the keyboard. */}
      {renderSlot(Nothing, slots.headerRegion, { testID: `${testID}-header-region` }, slotProps.headerRegion)}
      {updating ? (
        <View testID={`${testID}-updating`} accessibilityLiveRegion="polite" accessible accessibilityLabel={labels.updating}>
          <NativeText style={{ textAlign: "center", paddingVertical: 4, color: colors.tertiaryLabel, fontSize: 12, lineHeight: 16 }}>{labels.updating}</NativeText>
        </View>
      ) : null}
      <KeyboardAvoiding testID={`${testID}-keyboard`} style={{ flex: 1 }} {...keyboardProps}>
        <View style={{ flex: 1 }}>
          <NativeThreadList<ThreadMessage>
            ref={listRef}
            testID={`${testID}-messages`}
            data={messages}
            keyExtractor={messageKey}
            getItemType={messageType}
            renderItem={renderRow}
            loading={loading}
            hasEarlier={hasEarlier}
            onLoadEarlier={onLoadEarlier}
            loadingEarlier={loadingEarlier}
            earlierLabel={earlierLabel}
            renderEarlier={(p) => renderSlot(DefaultEarlierButton, slots.earlier, { ...p, testID: `${testID}-earlier` }, slotProps.earlier)}
            jumpTo={jumpTo}
            jumpId={messageJumpId}
            onLoadUntil={onLoadUntil}
            jumpAnnouncement={(m) => [m.mine ? labels.you : m.authorName, m.body].filter(Boolean).join(", ")}
            onJumpFailed={onJumpFailed ?? (() => announce(labels.messageGone))}
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
    <View testID={testID} accessible accessibilityRole="header" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
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

const DefaultMessage = memo(function DefaultMessage(message: ThreadPageSlotMap["message"]) {
  const colors = useThemeRoles();
  const { labels } = message;
  const broken = message.status === "failed" || message.status === "conflict";
  const waiting = message.status === "sending" || message.status === "pending" || message.status === "paused";
  const internal = message.tone === "internal";
  const state = stateLabel(message);
  const label = [message.mine ? labels.you : (message.authorName ?? ""), internal ? labels.internal : null, message.body, message.timeLabel, state].filter(Boolean).join(", ");
  // Discard is offered for a message that hasn't gone: not while it's sending (it may already be on the server).
  const canDiscard = Boolean(message.onDiscard) && (broken || message.status === "pending" || message.status === "paused");
  const actions = [
    ...(broken && message.onRetry ? [{ name: "activate", label: labels.retryHint }] : []),
    ...(canDiscard ? [{ name: "discard", label: labels.discard }] : []),
  ];
  return (
    <View style={{ alignItems: message.mine ? "flex-end" : "flex-start" }}>
      {!message.mine && message.authorName ? (
        <NativeText style={{ marginLeft: 12, marginBottom: 2, color: colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}>{message.authorName}</NativeText>
      ) : null}
      <Pressable
        testID={message.testID}
        accessible
        accessibilityRole={broken && message.onRetry ? "button" : undefined}
        accessibilityLabel={label}
        accessibilityHint={broken && message.onRetry ? labels.retryHint : undefined}
        accessibilityActions={actions.length ? actions : undefined}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "discard" && canDiscard) message.onDiscard?.();
          else if (e.nativeEvent.actionName === "activate" && broken) message.onRetry?.();
        }}
        onPress={broken ? message.onRetry : undefined}
        style={{
          maxWidth: "80%",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 18,
          backgroundColor: internal ? colors.surface : message.mine ? colors.tint : colors.surface,
          borderWidth: internal || message.highlighted ? 2 : 0,
          borderColor: internal ? colors.warning : colors.tint,
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
        {canDiscard ? (
          <Pressable testID={`${message.testID}-discard`} accessibilityRole="button" accessibilityLabel={labels.discard} onPress={message.onDiscard} hitSlop={{ top: 15, bottom: 15, left: 12, right: 12 }}>
            <NativeText style={{ color: colors.secondaryLabel, fontSize: 11, lineHeight: 14 }}>{labels.discard}</NativeText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

function DefaultAttachment({ id, uri, width, height, accessibilityLabel, onPress, testID }: ThreadPageSlotMap["attachment"]) {
  const { image: ExpoImage } = useGenesisModules();
  const ratio = width && height ? width / height : 0.6;
  const w = 140;
  const style = { width: w, height: Math.round(w / ratio), borderRadius: 12 };
  return (
    <Pressable testID={testID} accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? "Attachment"} onPress={onPress} disabled={!onPress}>
      {/* A recycled row (FlashList) must not show the last row's picture while this one loads. */}
      {ExpoImage ? (
        <ExpoImage source={{ uri }} style={style} contentFit="cover" recyclingKey={id} />
      ) : (
        <Image key={uri} source={{ uri }} style={style} resizeMode="cover" />
      )}
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
