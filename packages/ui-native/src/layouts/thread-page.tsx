/**
 * ThreadPage — one conversation: messages oldest first, a composer at the
 * bottom that stays above the keyboard, attachments, a read receipt, and
 * "load earlier" paging.
 *
 * Generic: a support ticket with staff replies, a direct message, a comment
 * thread. Mine are on the trailing side in the tint, theirs on the leading
 * side on `surface`, over the `groupedBackground` page (SettingsPage's iOS
 * palette).
 *
 * Keyboard: with `KeyboardScrollProvider` (the native app shell's
 * `keyboardScroll`, react-native-keyboard-controller's
 * `KeyboardAwareScrollView`), the messages and the composer scroll together
 * and the composer is kept above the keyboard. Without it, a
 * `KeyboardAvoidingView` does the same on iOS. Either way the thread stays
 * scrolled to the newest message as it grows.
 *
 * Read-only: pass `composer={null}` (a closed ticket, a viewer) and an
 * optional `closedNotice`.
 *
 * Slots: `message`, `attachment`, `readReceipt`, `composer`,
 * `composerAccessory` (beside the input: attach a screenshot), `header`
 * (above the messages: what the thread is about), `earlier` and `empty`.
 *
 * @stability Beta
 */
import { createElement, useEffect, useRef, type ReactNode } from "react";
import { renderSlot, type SlotPropsFor, type Slots } from "@marktiderman/genesis-core/slots";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { NativeButton } from "../components/button";
import { NativeEmptyState } from "../components/empty-state";
import { NativeText } from "../components/text";
import { composeHeaderOptions, type ScreenHeaderProps } from "./screen-container";
import { useKeyboardScroll } from "./keyboard";

export interface ThreadAttachment {
  id: string;
  /** An image URI (a signed URL, a file:// path). */
  uri: string;
  width?: number;
  height?: number;
  accessibilityLabel?: string;
  onPress?: () => void;
}

export interface ThreadMessage {
  id: string;
  body: string;
  /** Sent by the person using the app: trailing side, tint. */
  mine: boolean;
  /** Shown over theirs ("Support"); never over mine. */
  authorName?: string;
  timestamp: string | Date;
  /** An optimistic message: `sending`, then `sent`, or `failed` with `onRetry`. */
  status?: "sending" | "sent" | "failed";
  onRetry?: () => void;
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
}

export type ThreadPageSlotMap = {
  message: ThreadMessage & { testID: string; timeLabel: string; showReadReceipt: boolean };
  attachment: ThreadAttachment & { testID: string; mine: boolean };
  readReceipt: { label: string; testID: string };
  /** `accessory` is the `composerAccessory` slot, already rendered. */
  composer: ThreadComposer & { testID: string; accessory?: ReactNode };
  composerAccessory: { testID: string };
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
  /** Above the messages (what the thread is about). Prefer `slots.header` for a component. */
  header?: ReactNode;
  /**
   * When the other side last read the thread. My newest message sent before
   * it shows the read receipt.
   */
  readAt?: string | Date | null;
  readLabel?: string;
  /** There are older messages: shows a "load earlier" button at the top. */
  hasEarlier?: boolean;
  onLoadEarlier?: () => void;
  loadingEarlier?: boolean;
  earlierLabel?: string;
  emptyTitle?: string;
  emptyBody?: string;
  formatTime?: (date: Date) => string;
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

/** The newest of my messages the other side has read, or null. */
export function readReceiptFor(messages: readonly ThreadMessage[], readAt: string | Date | null | undefined): string | null {
  if (!readAt) return null;
  const read = toDate(readAt).getTime();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.mine && m.status !== "sending" && m.status !== "failed" && toDate(m.timestamp).getTime() <= read) return m.id;
  }
  return null;
}

interface ScrollLike {
  scrollToEnd?: (options?: { animated?: boolean }) => void;
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
  emptyTitle,
  emptyBody,
  formatTime = defaultTime,
  slots = {},
  slotProps = {},
  testID = "thread-page",
}: ThreadPageProps) {
  const colors = useThemeRoles();
  const KeyboardScroll = useKeyboardScroll();
  const scrollRef = useRef<ScrollLike | null>(null);
  const receiptFor = readReceiptFor(messages, readAt);
  const newest = messages[messages.length - 1]?.id;

  // Keep the newest message in view when one arrives (or is sent).
  useEffect(() => {
    scrollRef.current?.scrollToEnd?.({ animated: true });
  }, [newest]);

  const body = (
    <View style={{ flexGrow: 1 }}>
      {header ?? renderSlot(Nothing, slots.header, { testID: `${testID}-header` }, slotProps.header)}
      {hasEarlier && onLoadEarlier
        ? renderSlot(
            DefaultEarlier,
            slots.earlier,
            { loading: loadingEarlier, onPress: onLoadEarlier, label: earlierLabel, testID: `${testID}-earlier` },
            slotProps.earlier,
          )
        : null}
      <View testID={`${testID}-messages`} accessibilityRole="list" style={{ flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}>
        {messages.length === 0
          ? renderSlot(
              DefaultEmpty,
              slots.empty,
              { title: emptyTitle ?? "No messages yet", body: emptyBody ?? "Write the first one below.", testID: `${testID}-empty` },
              slotProps.empty,
            )
          : messages.map((message) => (
              <View key={message.id}>
                {renderSlot(
                  DefaultMessage,
                  slots.message,
                  {
                    ...message,
                    testID: `${testID}-message-${message.id}`,
                    timeLabel: formatTime(toDate(message.timestamp)),
                    showReadReceipt: message.id === receiptFor,
                  },
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
            ))}
      </View>
    </View>
  );

  const footer = composer ? (
    renderSlot(
      DefaultComposer,
      slots.composer,
      {
        ...composer,
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

  const page = { flex: 1, backgroundColor: colors.groupedBackground };
  const onContentSizeChange = () => scrollRef.current?.scrollToEnd?.({ animated: false });

  if (KeyboardScroll) {
    // The composer scrolls with the messages, so the keyboard-aware view keeps it (the focused input) above the keyboard.
    return (
      <SafeAreaView testID={testID} edges={["left", "right", "bottom"]} style={page}>
        {createElement(
          KeyboardScroll as never,
          {
            ref: scrollRef,
            testID: `${testID}-keyboard`,
            keyboardShouldPersistTaps: "handled",
            contentInsetAdjustmentBehavior: "automatic",
            contentContainerStyle: { flexGrow: 1 },
            bottomOffset: 8,
            onContentSizeChange,
          } as never,
          body,
          footer,
        )}
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView testID={testID} edges={["left", "right", "bottom"]} style={page}>
      <KeyboardAvoidingView testID={`${testID}-kav`} style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}>
        <ScrollView
          ref={scrollRef as never}
          testID={`${testID}-scroll`}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ flexGrow: 1 }}
          onContentSizeChange={onContentSizeChange}
        >
          {body}
        </ScrollView>
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Nothing(_props: { testID: string }) {
  return null;
}

function DefaultEarlier({ loading, onPress, label, testID }: ThreadPageSlotMap["earlier"]) {
  return (
    <View style={{ alignItems: "center", paddingTop: 8 }}>
      <NativeButton variant="ghost" size="sm" onPress={onPress} loading={loading} testID={testID}>
        {label}
      </NativeButton>
    </View>
  );
}

function DefaultEmpty({ title, body, testID }: ThreadPageSlotMap["empty"]) {
  return <NativeEmptyState variant="first-run" title={title} body={body} testID={testID} />;
}

function DefaultMessage(message: ThreadPageSlotMap["message"]) {
  const colors = useThemeRoles();
  const failed = message.status === "failed";
  const label = [message.mine ? "You" : (message.authorName ?? ""), message.body, message.timeLabel, failed ? "Not sent" : message.status === "sending" ? "Sending" : null]
    .filter(Boolean)
    .join(", ");
  return (
    <View style={{ alignItems: message.mine ? "flex-end" : "flex-start" }}>
      {!message.mine && message.authorName ? (
        <NativeText style={{ marginLeft: 12, marginBottom: 2, color: colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}>{message.authorName}</NativeText>
      ) : null}
      <Pressable
        testID={message.testID}
        accessible
        accessibilityLabel={label}
        accessibilityHint={failed && message.onRetry ? "Double tap to send again" : undefined}
        onPress={failed ? message.onRetry : undefined}
        style={{
          maxWidth: "80%",
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 18,
          backgroundColor: message.mine ? colors.tint : colors.surface,
          opacity: message.status === "sending" ? 0.6 : 1,
        }}
      >
        <NativeText className={message.mine ? "text-primary-foreground" : undefined} style={{ fontSize: 17, lineHeight: 22, color: message.mine ? undefined : colors.label }}>
          {message.body}
        </NativeText>
      </Pressable>
      <NativeText
        testID={`${message.testID}-time`}
        style={{ marginTop: 2, marginHorizontal: 12, color: failed ? colors.destructive : colors.tertiaryLabel, fontSize: 11, lineHeight: 14 }}
      >
        {failed ? "Not sent. Tap to retry." : message.timeLabel}
      </NativeText>
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

function DefaultComposer({
  value,
  onChangeText,
  onSend,
  sending = false,
  placeholder = "Message",
  sendLabel = "Send",
  disabled = false,
  maxLength,
  testID,
  accessory,
}: ThreadPageSlotMap["composer"]) {
  const colors = useThemeRoles();
  const blank = !value.trim();
  return (
    <View
      testID={testID}
      style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, backgroundColor: colors.groupedBackground }}
    >
      {accessory}
      <TextInput
        testID={`${testID}-input`}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.tertiaryLabel as string}
        accessibilityLabel={placeholder}
        multiline
        maxLength={maxLength}
        editable={!sending}
        style={{
          flex: 1,
          minHeight: 36,
          maxHeight: 120,
          paddingHorizontal: 14,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 18,
          fontSize: 17,
          color: colors.label as string,
          backgroundColor: colors.surface,
        }}
      />
      {sending ? (
        <View style={{ height: 36, justifyContent: "center", paddingHorizontal: 8 }}>
          <ActivityIndicator testID={`${testID}-sending`} accessibilityLabel="Sending" />
        </View>
      ) : (
        <NativeButton size="sm" onPress={onSend} disabled={disabled || blank} testID={`${testID}-send`}>
          {sendLabel}
        </NativeButton>
      )}
    </View>
  );
}
