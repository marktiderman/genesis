/**
 * @feat:chat
 * One conversation: an inverted list (FlashList when the app gave it, else
 * FlatList) that opens at the newest message and keeps its place while
 * earlier ones load at the top, day separators, the "New messages" line,
 * grouped bubbles with names and avatars in groups, who is typing or
 * recording, retry and delete on a send that failed, the long-press sheet and
 * swipe to reply, pictures in a full-screen viewer, and the composer above
 * the keyboard. Render it as the screen's only content, under the
 * navigator's header (`getThreadPageStackOptions` from genesis-ui-native).
 */
import { useCallback, useMemo, useRef, useState, type ComponentType } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeEmptyState, NativeSkeleton, NativeText, useGenesisModules, useToast } from "@marktiderman/genesis-ui-native/components";
import { useReducedMotion, useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { activityLine, previewText } from "../core/thread";
import type { ChatMessage } from "../core/types";
import { useChat, useConversation, useFileUrls, useMessageActions, usePins } from "../react/index";
import type { MessageActionId } from "./actions";
import { ChatComposer } from "./composer";
import { composerDisabledReason, replyTargetFor } from "./composer-state";
import { useChatNative } from "./context";
import { useChatComposer } from "./use-composer";
import { attachmentPaths, ChatMediaViewer } from "./media";
import { MessageActionsSheet } from "./message-actions-sheet";
import { displayBody, MessageBubble } from "./message-bubble";
import { haptic } from "./modules";
import { invertedRows, type ThreadRow } from "./rows";

export interface ChatThreadScreenProps {
  conversationId: string;
  /** One thread's replies instead of the main timeline. */
  threadRootId?: string | null;
  /** Points from the top of the screen to the top of this view (the header), for keeping the composer above the keyboard. */
  keyboardVerticalOffset?: number;
  testID?: string;
}

/** The list props chat passes; FlashList v2 and FlatList both take them. */
interface ChatListProps {
  data: readonly ThreadRow[];
  renderItem: (info: { item: ThreadRow; index: number }) => React.ReactElement | null;
  keyExtractor: (row: ThreadRow) => string;
  getItemType?: (row: ThreadRow) => string;
  inverted: boolean;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  ListHeaderComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  keyboardShouldPersistTaps?: "handled";
  keyboardDismissMode?: "interactive" | "on-drag";
  contentContainerStyle?: Record<string, unknown>;
  maintainVisibleContentPosition?: Record<string, unknown>;
  testID?: string;
}

export function ChatThreadScreen({ conversationId, threadRootId = null, keyboardVerticalOffset = 0, testID = "chat-thread" }: ChatThreadScreenProps) {
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
  const composer = useChatComposer(conversationId, threadRootId);
  const { setReply } = composer;
  // useMessageActions returns new functions each render; read the latest through a ref.
  const actionsRef = useRef(messageActions);
  actionsRef.current = messageActions;
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<{ uri: string; alt: string } | null>(null);

  const kind = conv.conversation?.kind ?? null;
  // Pin for members follows the kind's max_members = 2, which the client can't read; the built-in
  // `direct` kind is the one known to be two-person. The server stays the judge.
  const direct = kind === "direct";
  const group = !direct && conv.members.length !== 2 && (conv.members.length > 2 || kind !== null);

  const rows = useMemo(() => invertedRows(conv.items, { me: userId, firstUnreadId: conv.firstUnreadId, group }), [conv.items, userId, conv.firstUnreadId, group]);
  const paths = useMemo(() => conv.items.flatMap((i) => (i.type === "message" ? attachmentPaths(i.message.attachments) : [])), [conv.items]);
  const urls = useFileUrls(paths);
  const byId = useMemo(() => new Map(conv.messages.map((m) => [m.id, m])), [conv.messages]);
  const nameOf = useCallback((id: string | null) => (id === userId ? copy.you : (person(id)?.name ?? copy.someone)), [userId, copy, person]);

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
      void actionsRef.current.react(m, emoji, on).catch(fail);
    },
    [modules.haptics, fail],
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
          onToggleReaction={allowed ? react : undefined}
          onOpenImage={onOpenImage}
          testID={`${testID}-message-${m?.id ?? row.key}`}
        />
      );
    },
    [testID, copy.newMessages, userId, urls, byId, group, reducedMotion, onLongPress, allowed, reply, onSwipeReply, onRetry, onDiscard, react, onOpenImage],
  );

  const activity = activityLine(conv.activity, (id) => nameOf(id));
  // The hook says canPost false until it knows; with no role yet it doesn't know (anyone who can open it has one).
  const canPost = conv.role === null ? null : conv.canPost;
  const disabledReason = composerDisabledReason(canPost, conv.conversation, conv.role, copy);
  const KeyboardAvoiding = (modules.keyboardAvoidingView ?? KeyboardAvoidingView) as ComponentType<Record<string, unknown>>;
  const keyboardProps = modules.keyboardAvoidingView
    ? { behavior: "translate-with-padding", keyboardVerticalOffset }
    : { behavior: Platform.OS === "ios" ? "padding" : undefined, keyboardVerticalOffset };

  const empty = !conv.isLoading && rows.length === 0;
  return (
    <SafeAreaView testID={testID} edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
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
              testID={`${testID}-list`}
              data={rows}
              inverted
              renderItem={renderItem}
              keyExtractor={(row) => row.key}
              getItemType={(row) => (row.type === "message" ? (row.mine ? "mine" : "theirs") : row.type)}
              onEndReached={() => {
                if (conv.hasEarlier && !conv.loadingEarlier) void conv.loadEarlier();
              }}
              onEndReachedThreshold={0.5}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerStyle={{ paddingVertical: 8 }}
              // Earlier messages join at the far end of an inverted list, so what is on screen stays put;
              // new ones join at the near end and the list follows them while you are at the bottom.
              maintainVisibleContentPosition={{ autoscrollToTopThreshold: 120, minIndexForVisible: 0 }}
              ListHeaderComponent={activity ? <ActivityLine text={activity} testID={`${testID}-activity`} /> : null}
              ListFooterComponent={
                conv.hasEarlier ? (
                  <EarlierAnchor loading={conv.loadingEarlier} label={copy.loadEarlier} onPress={() => void conv.loadEarlier()} testID={`${testID}-earlier`} />
                ) : null
              }
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
          }}
          signalTyping={conv.signalTyping}
          signalRecording={conv.signalRecording}
          testID={`${testID}-composer`}
        />
      </KeyboardAvoiding>
      <MessageActionsSheet
        message={actionsFor}
        context={{ me: userId, role: conv.role, canPost: conv.canPost, pinned: actionsFor ? pins.includes(actionsFor.id) : false, direct, canCopy: Boolean(modules.clipboard) }}
        onClose={() => setActionsFor(null)}
        onReact={react}
        onAction={onAction}
        testID={`${testID}-actions`}
      />
      <ChatMediaViewer image={viewer} onClose={() => setViewer(null)} testID={`${testID}-viewer`} />
    </SafeAreaView>
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
