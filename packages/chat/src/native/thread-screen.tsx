/**
 * @feat:chat
 * One conversation, on genesis-ui-native's `NativeThreadList`: oldest first,
 * top to bottom, the order it reads in with VoiceOver (FlashList's
 * bottom-anchored chat mode when the app gave it, else FlatList), opening at
 * the newest message, following new ones while you are at the bottom, going
 * to the bottom when you send, and keeping its place while earlier ones load
 * at the top; day separators, the "New messages" line,
 * grouped bubbles with names and avatars in groups, the status of the last
 * message you sent ("Delivered", "Read 9:41", "Read by 2", with who read it),
 * who is typing (a bubble of dots, as in Messages) or recording, retry and delete on a send that failed, the long-press sheet and
 * swipe to reply, a message's photos in the full-screen viewer, and the composer above
 * the keyboard (or, when your role couldn't be read, Retry). Render it as the screen's only content, under the
 * navigator's header with `useChatThreadStackOptions` (an opaque bar).
 *
 * A row is keyed by the message's client id (it keeps its row when the
 * server's copy lands) and gone to by the server's id (`jumpId`).
 *
 * Organising: a topic bar when the conversation has topics (the list shows the topic chosen; a
 * closed one takes no posts from members), the away line under the header, scheduled send
 * (touch and hold Send) with the thread's scheduled messages over the composer, `jumpTo` a
 * message (a search result), and moderation's markers.
 *
 * It opens at the first unread when the "New" line would be above the screen, says when it is
 * waiting for the network or reconnecting, shows an error row with Retry when nothing could be
 * read, and a "↓ 3 new messages" pill when messages come in below where you are. Drag the thread
 * left for every message's time. An app's own strip goes in `header`, its tools over the composer
 * in `accessory`; `active={false}` keeps a thread mounted off screen without marking it read.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeAvatar, NativeButton, NativeEmptyState, NativeIcon, NativeListItem, NativeSheet, NativeSheetScrollView, NativeText, NativeThreadList, useGenesisModules, useToast, type NativeThreadListHandle, type ThreadRowInfo } from "@marktiderman/genesis-ui-native/components";
import { useReducedMotion, useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { activityLine } from "../core/thread";
import type { ChatMessage, PendingFile } from "../core/types";
import { useChat, useConversation, useFileUrls, useLinkPreviews, useMessageActions, usePeople, usePins, useTopics } from "../react/index";
import { recordingLimitMs } from "../core/media";
import { attachmentPreview, type ChatAttachmentSlot, type OpenAttachment } from "./attachment-cards";
import { linkPreviewIds, previewToShow } from "./link-preview";
import { ChatVideoRecorder } from "./video-recorder";
import { VideoUploadTray } from "./video-upload-tray";
import { videoUploads, type MintedUpload, type RecordedVideo } from "./video-upload";
import { ChatAwayLine, useAwayLine } from "./availability";
import { fill } from "./copy";
import { ChatScheduledBar, ChatScheduleSheet, useScheduleSend } from "./schedule-sheet";
import { canManageTopics, ChatTopicBar, topicClosedFor } from "./topics";
import type { JumpTarget } from "./use-jump";
import type { MessageActionId } from "./actions";
import { ChatComposer } from "./composer";
import { composerDisabledReason, filesFromAssets, replyTargetFor } from "./composer-state";
import { ChatPeopleScope, initials, useChatNative } from "./context";
import { lastSentReceipt, receiptText, type ChatReceiptsMode } from "./receipts";
import { ChatTypingBubble } from "./typing-bubble";
import { useChatComposer } from "./use-composer";
import { ChatAccessError } from "./access-error";
import { attachmentPaths } from "./media";
import { ChatPhotoViewer, galleryFor, type ChatPhoto } from "./photo-viewer";
import { MessageActionsSheet } from "./message-actions-sheet";
import { displayBody, MessageBubble } from "./message-bubble";
import { haptic, type KeyboardAvoidingLike } from "./modules";
import { pauseChatPlayback } from "./voice-player";
import { buildThreadRows, type ThreadRow } from "./rows";
import { ChatTimesProvider, useTimeReveal } from "./thread-times";
import { isOnline } from "./auto-retry";
import type { ChatComposerHandle } from "./use-composer";
import type { NetInfoLike } from "./modules";

/** How long an upload minted for a thrown-away take is kept for the next one. */
const PREPARED_UPLOAD_MS = 20 * 60_000;

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
  /** Open at this message (a search result's `messageId` and `seq`): earlier pages load until it is held. */
  jumpTo?: JumpTarget | null;
  /** Only this topic's messages, with no topic bar. */
  topic?: string;
  /** Show the topic bar before the first topic exists, so an owner or admin can add one. */
  showTopics?: boolean;
  /** Scheduled send (touch and hold Send) and the scheduled list. Default true. */
  scheduling?: boolean;
  /** The away line under the header. Default true. */
  availability?: boolean;
  /** An app attachment card's button (a form, a check-in), when its kind gives no `onPress`. */
  onOpenAttachment?: OpenAttachment;
  /**
   * Swap parts, as the web `ChatThread` does. `attachment` draws the app's own attachment kinds
   * (a task with a checkbox): every kind the package doesn't draw, with `fallback` for the card it
   * would have been; `null` hides kinds that aren't registered. Define it at module scope.
   */
  slots?: ChatThreadScreenSlots;
  /** How long an app card's action may run before it reads as failed; 30 s by default, 0 for never. */
  cardActionTimeoutMs?: number;
  /**
   * Whether the screen is the one shown (the navigator's `useIsFocused()`). When it turns false a
   * video or voice note of this thread that is playing pauses: switching tab keeps the screen
   * mounted. Default true.
   */
  focused?: boolean;
  /**
   * Message status under the last message you sent: "Sending…", "Sent", "Delivered", then "Read
   * 9:41" in a direct conversation or "Read by 2" (a button: who has read it) in a group. "hide"
   * leaves it out. Default "show".
   */
  receipts?: ChatReceiptsMode;
  /**
   * Whether this thread is the one being read. False keeps it mounted (a tab, a split view's other
   * pane) without marking it read, and pauses what it plays, as `focused` does; turning true marks
   * it read again. Default true.
   */
  active?: boolean;
  /** Above the messages, under the topic bar and away line: an app's own context strip. */
  header?: ReactNode;
  /**
   * Over the composer: an app's own tools for this thread (quick replies, a template picker).
   * Given the composer, so a tool can write into the draft, and whether you can post.
   */
  accessory?: (context: ChatThreadAccessoryContext) => ReactNode;
  /** The longest video message, in ms. Default: your role's recording limit (`recordingLimitMs`). */
  videoLimitMs?: number;
  testID?: string;
}

/** What `ChatThreadScreen`'s `accessory` is given. */
export interface ChatThreadAccessoryContext {
  conversationId: string;
  /** The composer's draft and reply (`dispatch({ type: "text", text })` writes into it). */
  composer: ChatComposerHandle;
  /** null while your role loads. */
  canPost: boolean | null;
}

/** What the thread's status line says: nothing, offline (NetInfo), or the live channel dropped. */
export type ChatConnectionState = "online" | "offline" | "connecting";

/** Offline wins; then a live channel that dropped; a channel not yet heard from is online. */
export function connectionState(online: boolean | null, live: boolean | null): ChatConnectionState {
  if (online === false) return "offline";
  if (live === false) return "connecting";
  return "online";
}

/** Whether the phone is online, from the app's NetInfo (`modules.netInfo`); null without it or until it says. */
export function useOnline(netInfo: NetInfoLike | undefined): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    if (!netInfo) return;
    return netInfo.addEventListener((state) => setOnline(isOnline(state)));
  }, [netInfo]);
  return online;
}

/** How many messages from others came in after `afterSeq` (the newest when you scrolled up). */
export function countUnseenBelow(messages: readonly { seq: number; senderId: string | null }[], afterSeq: number | null, me: string): number {
  if (afterSeq === null) return 0;
  let n = 0;
  for (let i = messages.length - 1; i >= 0 && messages[i]!.seq > afterSeq; i--) if (messages[i]!.senderId !== me) n++;
  return n;
}

export interface ChatThreadScreenSlots {
  /** Draws the app's own attachment kinds; the card by default. */
  attachment?: ChatAttachmentSlot | null;
}

/**
 * Points from the bottom that still count as "at the bottom" (FlatList, which follows by hand).
 * @deprecated Use genesis-ui-native's `THREAD_AT_BOTTOM_POINTS`. ChatThreadScreen is on NativeThreadList; this copy is removed in a later minor.
 */
export const AT_BOTTOM_POINTS = 120;

/**
 * How the thread's list is set up, oldest first and not inverted. FlashList:
 * its chat mode (opens at the bottom, follows new rows while within a fifth of
 * a screen of it, keeps the first visible row in place when earlier ones load
 * at the top). FlatList: keeps its place when earlier rows load at the top;
 * the screen follows new rows itself (`followsByHand`).
 * @deprecated Use genesis-ui-native's `threadListMode` (which anchors FlatList past the header, `minIndexForVisible: 1`). ChatThreadScreen is on NativeThreadList; this copy is removed in a later minor.
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

/**
 * Whether a scroll position is at (or near) the bottom of its content.
 * @deprecated Use genesis-ui-native's `threadNearBottom`. ChatThreadScreen is on NativeThreadList; this copy is removed in a later minor.
 */
export function nearBottom(m: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } }, slack = AT_BOTTOM_POINTS): boolean {
  return m.contentOffset.y + m.layoutMeasurement.height >= m.contentSize.height - slack;
}

export function ChatThreadScreen(props: ChatThreadScreenProps) {
  const { conversationId, threadRootId = null, keyboardVerticalOffset, onOpenAttachment, jumpTo, topic: topicProp, showTopics = false, scheduling = true, availability = true, receipts = "show", active = true, header, accessory, videoLimitMs, testID = "chat-thread" } = props;
  // Off screen either way: not focused (a tab), or not the thread being read.
  const focused = (props.focused ?? true) && active;
  const chat = useChat();
  const { userId, videoUpload, attachmentKinds, outbox, queue } = chat;
  const attachmentSlot = props.slots?.attachment;
  const cardActionTimeoutMs = props.cardActionTimeoutMs;
  // Off unless the app turns it on: an og:image fetched from the phone tells its site who reads it.
  const linkPreviewImages = (chat as { linkPreviewImages?: boolean }).linkPreviewImages === true;
  const topicsState = useTopics(threadRootId ? null : conversationId);
  const [chosenTopic, setChosenTopic] = useState<string | null>(null);
  // Another conversation in this screen starts in All.
  const [topicFor, setTopicFor] = useState(conversationId);
  if (topicFor !== conversationId) {
    setTopicFor(conversationId);
    setChosenTopic(null);
  }
  // A message to go to is looked for in All, not in the topic shown.
  const [jumpedFor, setJumpedFor] = useState(jumpTo);
  if (jumpTo !== jumpedFor) {
    setJumpedFor(jumpTo);
    if (jumpTo) setChosenTopic(null);
  }
  const topic = topicProp ?? chosenTopic ?? undefined;
  const conv = useConversation(conversationId, { threadRootId: threadRootId ?? undefined, topic, markRead: active });
  const pins = usePins(conversationId);
  const messageActions = useMessageActions();
  const { modules, copy, person } = useChatNative();
  const toast = useToast();
  const colors = useThemeRoles();
  const reducedMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const genesis = useGenesisModules();
  const listRef = useRef<NativeThreadListHandle | null>(null);
  // What you send is what you look at next, wherever the list was.
  const toNewest = useCallback(() => listRef.current?.scrollToEnd({ animated: true }), []);
  const composer = useChatComposer(conversationId, threadRootId, userId);
  const { setReply } = composer;
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [viewer, setViewer] = useState<{ photos: ChatPhoto[]; index: number } | null>(null);
  const [retryingAccess, setRetryingAccess] = useState(false);
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

  // The status of the last message you sent, and who has read it in a group.
  const queued = useMemo(() => new Set(queue.map((q) => q.clientId)), [queue]);
  const lastReceipt = useMemo(
    () => lastSentReceipt(conv.items, { me: userId, members: conv.members, group, queued, receipts }),
    [conv.items, userId, conv.members, group, queued, receipts],
  );
  const receiptLabel = lastReceipt ? receiptText(lastReceipt.receipt, copy) : null;
  const receiptKey = lastReceipt?.key ?? null;
  const readers = lastReceipt?.receipt.state === "read-by" ? lastReceipt.receipt.readers : null;
  const [readersOpen, setReadersOpen] = useState(false);
  const openReaders = useCallback(() => setReadersOpen(true), []);

  const rows = useMemo(() => buildThreadRows(conv.items, { me: userId, firstUnreadId: conv.firstUnreadId, group }), [conv.items, userId, conv.firstUnreadId, group]);
  const paths = useMemo(() => conv.items.flatMap((i) => (i.type === "message" ? attachmentPaths(i.message.attachments) : [])), [conv.items]);
  const urls = useFileUrls(paths);
  // Out of sight (another tab, a screen pushed over it): what this thread is playing pauses.
  // Players are keyed by attachment id, or `<clientId>:…` while the message is still sending.
  const itemsNow = useRef(conv.items);
  itemsNow.current = conv.items;
  useEffect(() => {
    if (focused) return;
    pauseChatPlayback((id) =>
      itemsNow.current.some((i) => (i.type === "message" ? i.message.attachments.some((a) => a.id === id) : i.type === "pending" && id.startsWith(`${i.pending.clientId}:`))),
    );
  }, [focused]);
  const byId = useMemo(() => new Map(conv.messages.map((m) => [m.id, m])), [conv.messages]);
  const linkIds = useMemo(() => linkPreviewIds(conv.messages), [conv.messages]);
  const previews = useLinkPreviews(linkIds);
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
      setReply(replyTargetFor(m, nameOf(m.senderId), attachmentPreview(displayBody(m.body), m.attachments[0], attachmentKinds, Boolean(m.deletedAt))));
    },
    [setReply, nameOf, attachmentKinds],
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
      haptic(modules.haptics ?? genesis.haptics, "long-press");
      setActionsFor(message);
    },
    [modules.haptics, genesis.haptics],
  );
  const onSwipeReply = useCallback(() => haptic(modules.haptics, "select"), [modules.haptics]);
  const onRetry = useCallback((clientId: string) => void retry(clientId), [retry]);
  const onDiscard = useCallback((clientId: string) => void discard(clientId), [discard]);
  // Read when a photo is tapped, so the handler stays stable for MessageBubble's memo.
  const forGallery = useRef({ messages: conv.messages, urls });
  forGallery.current = { messages: conv.messages, urls };
  const onOpenImage = useCallback(
    (uri: string, alt: string) => {
      const { messages, urls: signed } = forGallery.current;
      setViewer(galleryFor(messages, signed, uri, alt, (a) => (a.name ? `${copy.photo}, ${a.name}` : copy.photo)));
    },
    [copy.photo],
  );
  // Files that didn't survive a relaunch: photos and videos can be picked again; anything else can only be deleted.
  const { reattach } = conv;
  const picker = modules.imagePicker;
  const onReattach = useCallback(
    async (clientId: string, files: readonly PendingFile[]) => {
      if (!picker) return;
      try {
        // Only the slots that were lost: reattach fills those and keeps the rest.
        const lostCount = Math.max(1, files.filter((f) => f.lost).length);
        const result = await picker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: lostCount > 1, selectionLimit: lostCount, quality: 0.8 });
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
  const observer = conv.role === "observer";
  const { loadUntil } = conv;
  // A jump names the server's message id; its seq says how far back to load.
  const jumpSeq = jumpTo?.seq;
  // Not while the first page has failed: there's nothing to look in, so the message isn't known to be
  // gone. The reader hears the read failed, and the jump goes ahead when the rows come. Messages, not
  // rows: a saved outbox row is drawn even when nothing could be read.
  const firstPageFailed = Boolean(conv.error) && conv.messages.length === 0;
  const jumpMessageId = firstPageFailed ? null : (jumpTo?.messageId ?? null);
  const jumpBlocked = firstPageFailed && Boolean(jumpTo);
  useEffect(() => {
    if (jumpBlocked) fail();
  }, [jumpBlocked, fail]);
  // A load that failed has said so: the message isn't known to be gone.
  const jumpLoadFailed = useRef(false);
  const onLoadUntil = useCallback(
    (id: string) => {
      jumpLoadFailed.current = false;
      if (id !== jumpMessageId || jumpSeq == null) return Promise.resolve(false);
      return loadUntil(jumpSeq).catch(() => {
        jumpLoadFailed.current = true;
        fail();
        return false;
      });
    },
    [jumpMessageId, jumpSeq, loadUntil, fail],
  );
  const jumpAnnouncement = useCallback(
    (row: ThreadRow) => {
      const m = row.type === "message" && row.item.type === "message" ? row.item.message : null;
      return m ? fill(copy.jumpedTo, { name: nameOf(m.senderId), text: attachmentPreview(displayBody(m.body), m.attachments[0], attachmentKinds, Boolean(m.deletedAt)) }) : "";
    },
    [copy.jumpedTo, nameOf, attachmentKinds],
  );
  // ---- Where you are: the "↓ N new messages" pill ----
  const [scrolledAwayAt, setScrolledAwayAt] = useState<number | null>(null);
  // Where you scrolled away is this timeline's: another conversation or thread starts at the bottom.
  const timeline = `${conversationId}:${threadRootId ?? ""}`;
  const [awayFor, setAwayFor] = useState(timeline);
  if (awayFor !== timeline) {
    setAwayFor(timeline);
    setScrolledAwayAt(null);
  }
  const latestSeqNow = useRef(0);
  latestSeqNow.current = conv.messages.length ? conv.messages[conv.messages.length - 1]!.seq : 0;
  const onAtBottomChange = useCallback((atBottom: boolean) => setScrolledAwayAt(atBottom ? null : latestSeqNow.current), []);
  const newBelow = countUnseenBelow(conv.messages, scrolledAwayAt, userId);
  // Opens at the first unread, once that is known (the list keeps it at the bottom if it fits).
  // At the "New" line itself (its own row), so it is the first thing you see.
  const openAt = conv.firstUnreadKnown ? (conv.firstUnreadId ? UNREAD_ROW_ID : null) : undefined;

  // ---- Status: offline, reconnecting ----
  const online = useOnline(modules.netInfo);
  const connection = connectionState(online, conv.live);
  const { reload } = conv;
  const [reloading, setReloading] = useState(false);
  const retryLoad = useCallback(() => {
    if (!reload) return;
    setReloading(true);
    void reload()
      .catch(() => fail())
      .finally(() => setReloading(false));
  }, [reload, fail]);
  const times = useTimeReveal(reducedMotion);

  const onJumpFailed = useCallback(() => {
    if (jumpLoadFailed.current) jumpLoadFailed.current = false;
    else toast.show({ title: copy.messageGone });
  }, [toast, copy.messageGone]);
  const reattachable = useCallback((files: readonly PendingFile[]) => files.every((f) => !f.lost || f.kind === "image" || f.kind === "video"), []);

  const renderItem = useCallback(
    (row: ThreadRow, { highlighted }: ThreadRowInfo) => {
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
          observer={observer}
          highlighted={highlighted}
          linkPreview={m ? previewToShow(previews[m.id]) : null}
          linkPreviewImages={linkPreviewImages}
          attachmentKinds={attachmentKinds}
          onOpenAttachment={onOpenAttachment}
          attachmentSlot={attachmentSlot}
          cardActionTimeoutMs={cardActionTimeoutMs}
          receipt={row.key === receiptKey ? receiptLabel : null}
          backdrop={colors.groupedBackground as string}
          onReceiptPress={row.key === receiptKey && readers ? openReaders : undefined}
          testID={`${testID}-message-${m?.id ?? row.key}`}
        />
      );
    },
    [receiptKey, receiptLabel, readers, openReaders, testID, colors.groupedBackground, copy.newMessages, userId, urls, byId, group, reducedMotion, onLongPress, allowed, reply, onSwipeReply, onRetry, onDiscard, react, onOpenImage, picker, reattachable, onReattach, previews, linkPreviewImages, attachmentKinds, onOpenAttachment, attachmentSlot, cardActionTimeoutMs, observer],
  );

  // ---- Video messages ----
  const [videoOpen, setVideoOpen] = useState(false);
  // Minted when a take starts, so its bytes go the moment it stops. Kept for the next take when this
  // one is thrown away, but only for this conversation and only while it is fresh (Mux's direct
  // uploads expire; the uploader mints another if one has).
  const preparedVideo = useRef<{ conversationId: string; at: number; upload: Promise<MintedUpload> } | null>(null);
  const takePrepared = useCallback(() => {
    const p = preparedVideo.current;
    preparedVideo.current = null;
    return p && p.conversationId === conversationId && Date.now() - p.at < PREPARED_UPLOAD_MS ? p.upload : null;
  }, [conversationId]);
  const onVideoStart = useCallback(() => {
    if (!videoUpload) return;
    const before = preparedVideo.current;
    const kept = takePrepared();
    const upload = kept ?? videoUpload.create(conversationId);
    upload.catch(() => {
      if (preparedVideo.current?.upload === upload) preparedVideo.current = null;
    });
    preparedVideo.current = { conversationId, at: kept && before ? before.at : Date.now(), upload };
  }, [videoUpload, conversationId, takePrepared]);
  const replyNow = composer.state.replyTo?.messageId ?? null;
  const onVideoRecorded = useCallback(
    (video: RecordedVideo) => {
      videoUploads.start({ conversationId, userId, video, extra: { replyToId: replyNow, threadRootId }, send: outbox.send, videoUpload, prepared: takePrepared(), openFile: modules.openFile });
      if (replyNow) setReply(null);
      toNewest();
    },
    [conversationId, userId, replyNow, threadRootId, outbox, videoUpload, takePrepared, modules.openFile, setReply, toNewest],
  );

  const activity = activityLine(conv.activity, (id) => nameOf(id));
  // Typing is a bubble of dots, as in Messages; recording a voice note or video keeps its words.
  const typers = conv.activity.filter((a) => a.activity === "typing");
  const recording = conv.activity.some((a) => a.activity !== "typing");
  const footer = !activity ? null : recording ? (
    <ActivityLine text={activity} testID={`${testID}-activity`} />
  ) : (
    <ChatTypingBubble label={activity} userId={typers[0]?.userId ?? null} group={group} reducedMotion={reducedMotion} testID={`${testID}-typing`} />
  );
  // Unknown while access loads: the composer waits quietly instead of saying you can't post. A
  // read that failed (and no role known from before) offers Retry in the composer's place.
  const topics = topicsState.topics;
  const currentTopic = topic ? (topics.find((t) => t.topic === topic) ?? null) : null;
  const topicClosed = topicClosedFor(currentTopic, conv.role);
  const showTopicBar = !threadRootId && topicProp === undefined && (topics.length > 0 || (showTopics && canManageTopics(conv.role)));
  const canPost = topicClosed ? false : conv.accessLoading ? null : conv.canPost;
  const disabledReason = topicClosed ? copy.topicClosedNotice : composerDisabledReason(canPost, conv.conversation, conv.role, copy);
  const awayLine = useAwayLine(availability ? conversationId : null, conv.members, userId, nameOf);
  // Scheduled send: not in a reply thread (a scheduled message has no thread).
  const canSchedule = scheduling && !threadRootId && canPost === true;
  const schedule = useScheduleSend({ conversationId, topic: topic ?? null, composer, enabled: scheduling && !threadRootId });
  const accessFailed = Boolean(conv.accessError) && conv.role === null && !conv.accessLoading;
  const { refetchAccess } = conv;
  const retryAccess = useCallback(() => {
    setRetryingAccess(true);
    void Promise.resolve(refetchAccess()).finally(() => setRetryingAccess(false));
  }, [refetchAccess]);
  // Chat's own module, else the one the app gave Genesis (so it's passed once).
  const keyboardModule = modules.keyboardAvoidingView ?? (genesis as { keyboardAvoidingView?: KeyboardAvoidingLike }).keyboardAvoidingView;
  const KeyboardAvoiding = (keyboardModule ?? KeyboardAvoidingView) as ComponentType<Record<string, unknown>>;
  const offset = keyboardVerticalOffset ?? measuredTop;
  const keyboardProps = keyboardModule
    ? { behavior: "translate-with-padding", keyboardVerticalOffset: offset }
    : { behavior: Platform.OS === "ios" ? "padding" : undefined, keyboardVerticalOffset: offset };

  return (
    <ChatPeopleScope userIds={peopleIds}>
      <SafeAreaView ref={rootRef as never} onLayout={measureTop} testID={testID} edges={["left", "right", "bottom"]} style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
        <KeyboardAvoiding style={{ flex: 1 }} {...keyboardProps}>
          {showTopicBar ? (
            <ChatTopicBar topics={topics} value={topic ?? null} onValueChange={setChosenTopic} canManage={canManageTopics(conv.role)} onSetTopic={topicsState.setTopic} testID={`${testID}-topics`} />
          ) : null}
          <ChatAwayLine text={awayLine} testID={`${testID}-away`} />
          <ChatConnectionLine state={connection} testID={`${testID}-connection`} />
          {header}
          <View style={{ flex: 1 }} {...times.panHandlers}>
            <ChatTimesProvider value={times.value}>
            <NativeThreadList<ThreadRow>
              // A list per conversation: where it opens (the first unread) is decided once per conversation.
              key={`${conversationId}:${threadRootId ?? ""}`}
              ref={listRef}
              testID={`${testID}-list`}
              data={rows}
              keyExtractor={threadRowKey}
              jumpId={threadRowMessageId}
              getItemType={threadRowType}
              renderItem={renderItem}
              loading={conv.isLoading}
              hasEarlier={conv.hasEarlier}
              onLoadEarlier={() => void conv.loadEarlier()}
              loadingEarlier={conv.loadingEarlier}
              earlierLabel={copy.loadEarlier}
              jumpTo={jumpMessageId}
              onLoadUntil={onLoadUntil}
              jumpAnnouncement={jumpAnnouncement}
              onJumpFailed={onJumpFailed}
              footer={footer}
              openAt={openAt}
              onAtBottomChange={onAtBottomChange}
              header={firstPageFailed && rows.length ? <ThreadLoadError onRetry={retryLoad} retrying={reloading} testID={`${testID}-load-error`} /> : null}
              empty={
                firstPageFailed ? (
                  <ThreadLoadError onRetry={retryLoad} retrying={reloading} testID={`${testID}-load-error`} />
                ) : (
                  <NativeEmptyState variant="first-run" title={copy.threadEmptyTitle} body={currentTopic?.closedAt ? copy.topicClosedNotice : copy.threadEmptyBody} testID={`${testID}-empty`} />
                )
              }
            />
            </ChatTimesProvider>
            {newBelow > 0 ? <NewMessagesPill count={newBelow} onPress={toNewest} testID={`${testID}-new-below`} /> : null}
          </View>
          {scheduling && !threadRootId ? <ChatScheduledBar conversationId={conversationId} testID={`${testID}-scheduled`} /> : null}
          <VideoUploadTray conversationId={conversationId} userId={userId} testID={`${testID}-video-uploads`} />
          {accessory && !accessFailed ? <View testID={`${testID}-accessory`}>{accessory({ conversationId, composer, canPost })}</View> : null}
          {accessFailed ? (
            <ChatAccessError onRetry={retryAccess} retrying={retryingAccess} testID={`${testID}-access-error`} />
          ) : (
          <ChatComposer
            composer={composer}
            userId={userId}
            placeholder={currentTopic ? fill(copy.topicPlaceholder, { name: currentTopic.title }) : undefined}
            onSchedule={canSchedule ? schedule.request : undefined}
            canPost={canPost}
            disabledReason={disabledReason}
            role={conv.role}
            onSend={({ input, files }) => {
              void conv.send(input, files).catch(fail);
              toNewest();
            }}
            signalTyping={conv.signalTyping}
            signalRecording={conv.signalRecording}
            onRecordVideo={modules.camera ? () => setVideoOpen(true) : undefined}
            testID={`${testID}-composer`}
          />
          )}
        </KeyboardAvoiding>
        <MessageActionsSheet
          message={actionsFor}
          context={{ me: userId, role: conv.role, canPost: conv.canPost, pinned: actionsFor ? pins.includes(actionsFor.id) : false, canPin: conv.canPin, canCopy: Boolean(modules.clipboard) }}
          onClose={() => setActionsFor(null)}
          onReact={react}
          onAction={onAction}
          attachmentKinds={attachmentKinds}
          testID={`${testID}-actions`}
        />
        <NativeSheet open={readersOpen && Boolean(readers?.length)} onOpenChange={setReadersOpen} fitContent testID={`${testID}-readers`}>
          <View style={{ paddingTop: 20, paddingBottom: 8, paddingHorizontal: 16, gap: 8 }}>
            <NativeText preset="label" accessibilityRole="header" style={{ color: colors.secondaryLabel, paddingHorizontal: 4 }}>
              {copy.receiptReadersTitle}
            </NativeText>
            {/* A long group's readers scroll inside the sheet (which stops at 90% of the screen). */}
            <NativeSheetScrollView testID={`${testID}-readers-list`} style={{ maxHeight: Math.round(windowHeight * 0.7) }}>
              {(readers ?? []).map((id) => {
                const p = person(id) ?? people[id];
                return (
                  <NativeListItem
                    key={id}
                    testID={`${testID}-readers-${id}`}
                    title={nameOf(id)}
                    leading={<NativeAvatar size={32} src={p?.avatarUrl ?? null} fallback={initials(p?.name)} alt={p?.name} recyclingKey={id} />}
                  />
                );
              })}
            </NativeSheetScrollView>
          </View>
        </NativeSheet>
        <ChatPhotoViewer photos={viewer?.photos ?? null} initialIndex={viewer?.index} onClose={() => setViewer(null)} testID={`${testID}-viewer`} />
        {canSchedule ? <ChatScheduleSheet open={schedule.open} onOpenChange={schedule.setOpen} onSchedule={(at) => void schedule.scheduleAt(at)} testID={`${testID}-schedule`} /> : null}
        <ChatVideoRecorder
          open={videoOpen}
          onClose={() => setVideoOpen(false)}
          limitMs={videoLimitMs ?? recordingLimitMs(conv.role)}
          onStart={onVideoStart}
          onTick={conv.signalRecordingVideo}
          onRecorded={onVideoRecorded}
          testID={`${testID}-video-recorder`}
        />
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

/** "Waiting for network…" or "Connecting…" under the header; nothing while live. */
function ChatConnectionLine({ state, testID }: { state: ChatConnectionState; testID: string }) {
  const colors = useThemeRoles();
  const { copy } = useChatNative();
  if (state === "online") return null;
  const text = state === "offline" ? copy.waitingForNetwork : copy.connecting;
  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={text} accessibilityLiveRegion="polite" style={{ alignItems: "center", paddingVertical: 6, backgroundColor: colors.fill }}>
      <NativeText preset="caption" style={{ color: colors.secondaryLabel, fontWeight: "600" }}>
        {text}
      </NativeText>
    </View>
  );
}

/** Nothing could be read: say so, with Retry, instead of "No messages yet". */
function ThreadLoadError({ onRetry, retrying, testID }: { onRetry: () => void; retrying: boolean; testID: string }) {
  const { copy } = useChatNative();
  return (
    <NativeEmptyState
      variant="error"
      title={copy.threadErrorTitle}
      body={copy.threadErrorBody}
      testID={testID}
      primaryAction={
        <NativeButton onPress={onRetry} loading={retrying} disabled={retrying} testID={`${testID}-retry`}>
          {copy.retry}
        </NativeButton>
      }
    />
  );
}

/** "↓ 3 new messages", over the bottom of the list while you're scrolled up; goes to the newest. */
function NewMessagesPill({ count, onPress, testID }: { count: number; onPress: () => void; testID: string }) {
  const colors = useThemeRoles();
  const { copy } = useChatNative();
  const label = count === 1 ? copy.newMessagesPillOne : fill(copy.newMessagesPill, { count });
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 8, alignItems: "center" }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={copy.newMessagesPillHint}
        accessibilityLiveRegion="polite"
        onPress={onPress}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.tint }}
      >
        <NativeIcon name="chevron-down" size={14} color={colors.surface} />
        <NativeText preset="caption" style={{ color: colors.surface, fontWeight: "600" }}>
          {label}
        </NativeText>
      </Pressable>
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

const threadRowKey = (row: ThreadRow) => row.key;
/** A message row is gone to by the server's id; a day heading, the unread line and a message still sending can't be. */
/** The "New messages" line, as a row the list can open at (no message id looks like it). */
const UNREAD_ROW_ID = "genesis-chat:unread";
const threadRowMessageId = (row: ThreadRow) => (row.type === "unread" ? UNREAD_ROW_ID : row.type === "message" && row.item.type === "message" ? row.item.message.id : null);
const threadRowType = (row: ThreadRow) => (row.type === "message" ? (row.mine ? "mine" : "theirs") : row.type);
