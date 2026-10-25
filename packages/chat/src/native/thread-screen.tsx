/**
 * @feat:chat
 * One conversation: a list oldest first, top to bottom, the order it reads in
 * with VoiceOver (FlashList's bottom-anchored chat mode when the app gave it,
 * else FlatList), that opens at the newest message, follows new ones while
 * you are at the bottom, goes to the bottom when you send, and keeps its
 * place while earlier ones load at the top; day separators, the "New messages" line,
 * grouped bubbles with names and avatars in groups, who is typing or
 * recording, retry and delete on a send that failed, the long-press sheet and
 * swipe to reply, pictures in a full-screen viewer, and the composer above
 * the keyboard. Render it as the screen's only content, under the
 * navigator's header with `useChatThreadStackOptions` (an opaque bar).
 *
 * Not inverted: FlashList 2 keeps the first visible row in place when rows
 * change and only follows new rows at the bottom (`autoscrollToBottomThreshold`;
 * it declares `autoscrollToTopThreshold` but never reads it), so in an inverted list a new message
 * at index 0 was pushed under the composer. Inverted, VoiceOver also read
 * each day's heading after its messages.
 */
import { useCallback, useMemo, useRef, useState, type ComponentType } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeEmptyState, NativeSkeleton, NativeText, useGenesisModules, useToast } from "@marktiderman/genesis-ui-native/components";
import { useReducedMotion, useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { activityLine, previewText } from "../core/thread";
import type { ChatMessage, PendingFile } from "../core/types";
import { useChat, useConversation, useFileUrls, useMessageActions, usePeople, usePins } from "../react/index";
import type { MessageActionId } from "./actions";
import { ChatComposer } from "./composer";
import { composerDisabledReason, filesFromAssets, replyTargetFor } from "./composer-state";
import { ChatPeopleScope, useChatNative } from "./context";
import { useChatComposer } from "./use-composer";
import { attachmentPaths, ChatMediaViewer } from "./media";
import { MessageActionsSheet } from "./message-actions-sheet";
import { displayBody, MessageBubble } from "./message-bubble";
import { haptic } from "./modules";
import { buildThreadRows, type ThreadRow } from "./rows";

export interface ChatThreadScreenProps {
  conversationId: string;
  /** One thread's replies instead of the main timeline. */
  threadRootId?: string | null;
  /**
   * Points from the top of the screen to the top of this view, for keeping the composer above the
   * keyboard. Measured from the screen's own position when left out (under an opaque header it is
   * the header's bottom).
   */
  keyboardVerticalOffset?: number;
  testID?: string;
}

/** The list props chat passes; FlashList v2 and FlatList both take them. */
interface ChatListProps {
  ref?: unknown;
  data: readonly ThreadRow[];
  renderItem: (info: { item: ThreadRow; index: number }) => React.ReactElement | null;
  keyExtractor: (row: ThreadRow) => string;
  getItemType?: (row: ThreadRow) => string;
  inverted?: boolean;
  onStartReached?: () => void;
  onStartReachedThreshold?: number;
  ListHeaderComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  keyboardShouldPersistTaps?: "handled";
  keyboardDismissMode?: "interactive" | "on-drag";
  contentContainerStyle?: Record<string, unknown>;
  maintainVisibleContentPosition?: Record<string, unknown>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
  onContentSizeChange?: (width: number, height: number) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  testID?: string;
}

/** Points from the bottom that still count as "at the bottom" (FlatList, which follows by hand). */
export const AT_BOTTOM_POINTS = 120;

/**
 * How the thread's list is set up, oldest first and not inverted. FlashList:
 * its chat mode (opens at the bottom, follows new rows while within a fifth of
 * a screen of it, keeps the first visible row in place when earlier ones load
 * at the top). FlatList: keeps its place when earlier rows load at the top;
 * the screen follows new rows itself (`followsByHand`).
 */
export function threadListMode(flash: boolean, reducedMotion: boolean): { followsByHand: boolean; maintainVisibleContentPosition: Record<string, unknown> } {
  if (flash) {
    return {
      followsByHand: false,
      maintainVisibleContentPosition: { startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2, animateAutoScrollToBottom: !reducedMotion },
    };
  }
  return { followsByHand: true, maintainVisibleContentPosition: { minIndexForVisible: 0 } };
}

/** Whether a scroll position is at (or near) the bottom of its content. */
export function nearBottom(m: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } }, slack = AT_BOTTOM_POINTS): boolean {
  return m.contentOffset.y + m.layoutMeasurement.height >= m.contentSize.height - slack;
}

export function ChatThreadScreen({ conversationId, threadRootId = null, keyboardVerticalOffset, testID = "chat-thread" }: ChatThreadScreenProps) {
  const { userId } = useChat();
  const conv = useConversation(conversationId, { threadRootId: threadRootId ?? undefined });
  const pins = usePins(conversationId);
  const messageActions = useMessageActions();
  const { modules, copy, person } = useChatNative();
  const toast = useToast();
  const colors = useThemeRoles();
  const reducedMotion = useReducedMotion();
  const genesis = useGenesisModules();
  const List = (genesis.list ?? FlatList) as unknown as ComponentType<ChatListProps>;
  const mode = threadListMode(Boolean(genesis.list), reducedMotion);
  const listRef = useRef<{ scrollToEnd?: (o?: { animated?: boolean }) => void } | null>(null);
  // FlatList follows by hand: at the bottom (or not yet scrolled), new rows and a shorter list keep it there.
  const atBottom = useRef(true);
  // FlatList opens at the top and is moved to the bottom a frame later: until it has been, the top
  // isn't "reached" (it would load an earlier page on every open).
  const placed = useRef(!mode.followsByHand);
  const toBottom = useCallback(
    (animated: boolean) => {
      const go = (a: boolean) => listRef.current?.scrollToEnd?.({ animated: a && !reducedMotion });
      requestAnimationFrame(() => {
        go(animated);
        placed.current = true;
      });
      // Once more after the new row has its size (FlashList measures it after the first pass).
      if (animated) setTimeout(() => go(true), 180);
    },
    [reducedMotion],
  );
  const composer = useChatComposer(conversationId, threadRootId, userId);
  const { setReply } = composer;
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<{ uri: string; alt: string } | null>(null);
  // Where this screen starts on the window: the keyboard offset when the app gives none.
  const rootRef = useRef<{ measureInWindow?: (callback: (x: number, y: number) => void) => void } | null>(null);
  const [measuredTop, setMeasuredTop] = useState(0);
  const measureTop = useCallback(() => {
    rootRef.current?.measureInWindow?.((_x: number, y: number) => {
      if (Number.isFinite(y)) setMeasuredTop(Math.max(0, Math.round(y)));
    });
  }, []);

  // Names and avatars show for more than two people: the kind's rule once it is read, else the member count.
  const group = conv.kind ? conv.kind.maxMembers !== 2 : conv.members.length > 2;
  const peopleIds = useMemo(
    () => [...conv.members.map((m) => m.userId), ...conv.messages.map((m) => m.senderId)],
    [conv.members, conv.messages],
  );

  const rows = useMemo(() => buildThreadRows(conv.items, { me: userId, firstUnreadId: conv.firstUnreadId, group }), [conv.items, userId, conv.firstUnreadId, group]);
  const paths = useMemo(() => conv.items.flatMap((i) => (i.type === "message" ? attachmentPaths(i.message.attachments) : [])), [conv.items]);
  const urls = useFileUrls(paths);
  const byId = useMemo(() => new Map(conv.messages.map((m) => [m.id, m])), [conv.messages]);
  const people = usePeople(peopleIds);
  const nameOf = useCallback(
    (id: string | null) => (id === userId ? copy.you : ((person(id) ?? (id ? people[id] : undefined))?.name ?? copy.someone)),
    [userId, copy, person, people],
  );

  const fail = useCallback(() => {
    haptic(modules.haptics, "error");
    toast.show({ title: copy.actionFailed, variant: "destructive" });
  }, [modules.haptics, toast, copy.actionFailed]);

  const reply = useCallback(
    (m: ChatMessage) => {
      setReply(replyTargetFor(m, nameOf(m.senderId), previewText(displayBody(m.body), m.attachments[0]?.kind, Boolean(m.deletedAt))));
    },
    [setReply, nameOf],
  );

  const onAction = useCallback(
    (m: ChatMessage, action: MessageActionId) => {
      switch (action) {
        case "reply":
          return reply(m);
        case "copy":
          void modules.clipboard
            ?.setStringAsync(displayBody(m.body))
            .then(() => toast.show({ title: copy.copied, variant: "success", duration: 1500 }))
            .catch(fail);
          return;
        case "pin":
        case "unpin":
          void messageActions.pin(m, action === "pin").catch(fail);
          return;
        case "delete":
          void messageActions.remove(m).catch(fail);
          return;
      }
    },
    [reply, modules.clipboard, toast, copy.copied, fail, messageActions],
  );

  const react = useCallback(
    (m: ChatMessage, emoji: string, on: boolean) => {
      haptic(modules.haptics, "select");
      void messageActions.react(m, emoji, on).catch(fail);
    },
    [modules.haptics, fail, messageActions],
  );

  // Stable handlers, so MessageBubble's memo holds while someone types or a row elsewhere changes.
  const { retry, discard, canPost: allowed } = conv;
  const onLongPress = useCallback(
    (message: ChatMessage) => {
      haptic(modules.haptics, "select");
      setActionsFor(message);
    },
    [modules.haptics],
  );
  const onSwipeReply = useCallback(() => haptic(modules.haptics, "select"), [modules.haptics]);
  const onRetry = useCallback((clientId: string) => void retry(clientId), [retry]);
  const onDiscard = useCallback((clientId: string) => void discard(clientId), [discard]);
  const onOpenImage = useCallback((uri: string, alt: string) => setViewer({ uri, alt }), []);
  // Files that didn't survive a relaunch: photos and videos can be picked again; anything else can only be deleted.
  const { reattach } = conv;
  const picker = modules.imagePicker;
  const onReattach = useCallback(
    async (clientId: string, files: readonly PendingFile[]) => {
      if (!picker) return;
      try {
        const result = await picker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: files.length > 1, selectionLimit: files.length, quality: 0.8 });
        if (!result || result.canceled || !result.assets?.length) return;
        const { attachments, notice } = filesFromAssets(result.assets, copy);
        if (notice) toast.show({ title: notice, variant: "destructive" });
        if (attachments.length) await reattach(clientId, attachments.map((a) => a.file));
      } catch {
        fail();
      }
    },
    [picker, copy, toast, reattach, fail],
  );
  const reattachable = useCallback((files: readonly PendingFile[]) => files.every((f) => !f.lost || f.kind === "image" || f.kind === "video"), []);

  const renderItem = useCallback(
    ({ item: row }: { item: ThreadRow }) => {
      if (row.type === "day") return <DaySeparator label={row.label} testID={`${testID}-day-${row.key}`} />;
      if (row.type === "unread") return <UnreadDivider label={copy.newMessages} testID={`${testID}-unread`} />;
      const m = row.item.type === "message" ? row.item.message : null;
      const replyTo = m?.replyToId ?? (row.item.type === "pending" ? row.item.pending.input.replyToId : null);
      return (
        <MessageBubble
          row={row}
          me={userId}
          urls={urls}
          repliedTo={replyTo ? byId.get(replyTo) : null}
          group={group}
          reducedMotion={reducedMotion}
          onLongPress={onLongPress}
          onReply={allowed ? reply : undefined}
          onSwipeReply={onSwipeReply}
          onRetry={onRetry}
          onDiscard={onDiscard}
          onReattach={picker && row.item.type === "pending" && reattachable(row.item.pending.files ?? []) ? onReattach : undefined}
          onToggleReaction={allowed ? react : undefined}
          onOpenImage={onOpenImage}
          testID={`${testID}-message-${m?.id ?? row.key}`}
        />
      );
    },
    [testID, copy.newMessages, userId, urls, byId, group, reducedMotion, onLongPress, allowed, reply, onSwipeReply, onRetry, onDiscard, react, onOpenImage, picker, reattachable, onReattach],
  );

  const activity = activityLine(conv.activity, (id) => nameOf(id));
  // Unknown while access loads: the composer waits quietly instead of saying you can't post.
  const canPost = conv.accessLoading ? null : conv.canPost;
  const disabledReason = composerDisabledReason(canPost, conv.conversation, conv.role, copy);
  const KeyboardAvoiding = (modules.keyboardAvoidingView ?? KeyboardAvoidingView) as ComponentType<Record<string, unknown>>;
  const offset = keyboardVerticalOffset ?? measuredTop;
  const keyboardProps = modules.keyboardAvoidingView
    ? { behavior: "translate-with-padding", keyboardVerticalOffset: offset }
    : { behavior: Platform.OS === "ios" ? "padding" : undefined, keyboardVerticalOffset: offset };

  const empty = !conv.isLoading && rows.length === 0;
  return (
    <ChatPeopleScope userIds={peopleIds}>
      <SafeAreaView ref={rootRef as never} onLayout={measureTop} testID={testID} edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
        <KeyboardAvoiding style={{ flex: 1 }} {...keyboardProps}>
          <View style={{ flex: 1 }}>
            {conv.isLoading ? (
              <LoadingThread testID={`${testID}-loading`} />
            ) : empty ? (
              <View style={{ flex: 1, justifyContent: "center" }}>
                <NativeEmptyState variant="first-run" title={copy.threadEmptyTitle} body={copy.threadEmptyBody} testID={`${testID}-empty`} />
              </View>
            ) : (
              <List
                ref={listRef}
                testID={`${testID}-list`}
                data={rows}
                renderItem={renderItem}
                keyExtractor={(row) => row.key}
                getItemType={(row) => (row.type === "message" ? (row.mine ? "mine" : "theirs") : row.type)}
                onStartReached={() => {
                  if (placed.current && conv.hasEarlier && !conv.loadingEarlier) void conv.loadEarlier();
                }}
                onStartReachedThreshold={0.5}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={{ paddingVertical: 8 }}
                maintainVisibleContentPosition={mode.maintainVisibleContentPosition}
                {...(mode.followsByHand
                  ? {
                      scrollEventThrottle: 32,
                      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
                        atBottom.current = nearBottom(e.nativeEvent);
                      },
                      onContentSizeChange: () => {
                        if (atBottom.current) toBottom(false);
                      },
                      onLayout: () => {
                        if (atBottom.current) toBottom(false);
                      },
                    }
                  : {})}
                ListHeaderComponent={
                  conv.hasEarlier ? (
                    <EarlierAnchor loading={conv.loadingEarlier} label={copy.loadEarlier} onPress={() => void conv.loadEarlier()} testID={`${testID}-earlier`} />
                  ) : null
                }
                ListFooterComponent={activity ? <ActivityLine text={activity} testID={`${testID}-activity`} /> : null}
              />
            )}
          </View>
          <ChatComposer
            composer={composer}
            canPost={canPost}
            disabledReason={disabledReason}
            role={conv.role}
            onSend={({ input, files }) => {
              void conv.send(input, files).catch(fail);
              // What you send is what you look at next, wherever the list was.
              atBottom.current = true;
              toBottom(true);
            }}
            signalTyping={conv.signalTyping}
            signalRecording={conv.signalRecording}
            testID={`${testID}-composer`}
          />
        </KeyboardAvoiding>
        <MessageActionsSheet
          message={actionsFor}
          context={{ me: userId, role: conv.role, canPost: conv.canPost, pinned: actionsFor ? pins.includes(actionsFor.id) : false, canPin: conv.canPin, canCopy: Boolean(modules.clipboard) }}
          onClose={() => setActionsFor(null)}
          onReact={react}
          onAction={onAction}
          testID={`${testID}-actions`}
        />
        <ChatMediaViewer image={viewer} onClose={() => setViewer(null)} testID={`${testID}-viewer`} />
      </SafeAreaView>
    </ChatPeopleScope>
  );
}

function DaySeparator({ label, testID }: { label: string; testID: string }) {
  const colors = useThemeRoles();
  return (
    <View testID={testID} accessibilityRole="header" style={{ alignItems: "center", paddingVertical: 10 }}>
      <NativeText preset="caption" style={{ color: colors.secondaryLabel, fontWeight: "600" }}>
        {label}
      </NativeText>
    </View>
  );
}

function UnreadDivider({ label, testID }: { label: string; testID: string }) {
  const colors = useThemeRoles();
  return (
    <View testID={testID} accessible accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.tint }} />
      <NativeText preset="caption" style={{ color: colors.tint, fontWeight: "600" }}>
        {label}
      </NativeText>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.tint }} />
    </View>
  );
}

function ActivityLine({ text, testID }: { text: string; testID: string }) {
  const colors = useThemeRoles();
  return (
    <View testID={testID} accessibilityLiveRegion="polite" style={{ paddingHorizontal: 20, paddingVertical: 6 }}>
      <NativeText preset="caption" style={{ color: colors.secondaryLabel, fontStyle: "italic" }}>
        {text}
      </NativeText>
    </View>
  );
}

function EarlierAnchor({ loading, label, onPress, testID }: { loading: boolean; label: string; onPress: () => void; testID: string }) {
  const colors = useThemeRoles();
  return (
    <View style={{ alignItems: "center", paddingVertical: 12 }}>
      {loading ? (
        <View testID={`${testID}-loading`} style={{ gap: 8, alignItems: "center" }}>
          <NativeSkeleton width={180} height={14} />
          <NativeSkeleton width={120} height={14} />
        </View>
      ) : (
        <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16 }}>
          <NativeText preset="label" style={{ color: colors.tint }}>
            {label}
          </NativeText>
        </Pressable>
      )}
    </View>
  );
}

function LoadingThread({ testID }: { testID: string }) {
  return (
    <View testID={testID} style={{ flex: 1, justifyContent: "flex-end", padding: 16, gap: 10 }}>
      <NativeSkeleton width={200} height={36} className="rounded-2xl" />
      <View style={{ alignItems: "flex-end" }}>
        <NativeSkeleton width={160} height={36} className="rounded-2xl" />
      </View>
      <NativeSkeleton width={240} height={36} className="rounded-2xl" />
    </View>
  );
}
