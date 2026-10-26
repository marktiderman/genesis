/**
 * @feat:chat
 * One message row: mine on the trailing side in the tint, theirs on surface;
 * in a group, the sender's name over the first of a run and their avatar
 * beside the last. A reply shows what it answers; reactions sit under the
 * bubble; a message still sending is faded, and one that failed says so with
 * Retry and Delete. Long press opens the actions; swipe right to reply. Both
 * are also VoiceOver / TalkBack actions, so nothing needs a gesture. The
 * bubble is one accessible element (its parts would otherwise be read one by
 * one), which hides the controls inside it, so it carries theirs as actions
 * too: play or pause a voice note and change its speed, open each photo, an
 * app card's action. App attachment kinds draw as cards, or through the app's
 * `attachmentSlot` (see attachment-cards.tsx); a voice note's transcript is
 * part of the bubble's label.
 */
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, View } from "react-native";
import { NativeAvatar, NativeText } from "@marktiderman/genesis-ui-native/components";
import { useThemeRoles } from "@marktiderman/genesis-ui-native/hooks";
import { summarizeReactions } from "../core/thread";
import type { ChatLinkPreview, ChatMessage, PendingFile } from "../core/types";
import type { ChatAttachmentKind } from "../react/index";
import { AppAttachment, attachmentKindOf, attachmentPreview, cardAction, cardTitle, splitCardAttachments, useCardRuns, type ChatAttachmentSlot, type OpenAttachment } from "./attachment-cards";
import { ChatLinkPreviewCard, linkHost, openChatLink } from "./link-preview";
import { cycleVideoRate, fullScreenVideo, toggleVideo, toggleVideoMute, usePlayingVideo } from "./video-player";
import { fill } from "./copy";
import { initials, useChatNative } from "./context";
import { fromPending, fromPendingInput, fromServer, MessageAttachments, type BubbleAttachment } from "./media";
import { ModerationMarker, moderationNote, moderationText } from "./moderation";
import { cycleVoiceNoteRate, toggleVoiceNote, usePlayingVoiceNote } from "./voice-player";
import type { ThreadRow } from "./rows";

type MessageRow = Extract<ThreadRow, { type: "message" }>;

export interface MessageBubbleProps {
  row: MessageRow;
  me: string;
  /** Signed links by storage path. */
  urls: Record<string, string>;
  /** The message this one replies to, when it is loaded. */
  repliedTo?: ChatMessage | null;
  /** Avatars sit in a column when the conversation is a group. */
  group: boolean;
  reducedMotion: boolean;
  onLongPress?: (message: ChatMessage) => void;
  onReply?: (message: ChatMessage) => void;
  onRetry?: (clientId: string) => void;
  onDiscard?: (clientId: string) => void;
  /** A failed message whose files didn't survive a relaunch: pick them again (`useConversation().reattach`). */
  onReattach?: (clientId: string, files: readonly PendingFile[]) => void;
  onToggleReaction?: (message: ChatMessage, emoji: string, on: boolean) => void;
  onOpenImage?: (uri: string, alt: string) => void;
  /** The swipe crossed the reply line (for a haptic). */
  onSwipeReply?: () => void;
  /** You observe this conversation: moderation's markers show (hidden, flagged). */
  observer?: boolean;
  /** Drawn highlighted for a moment (the message a search result opened). */
  highlighted?: boolean;
  /** The preview of a link in its text (`useLinkPreviews`, `previewToShow`). */
  linkPreview?: ChatLinkPreview | null;
  /** Show link previews' images (off by default; the thread screen passes `ChatProvider linkPreviewImages`). */
  linkPreviewImages?: boolean;
  /** The app's own attachment kinds, drawn as cards (`ChatProvider attachmentKinds`). */
  attachmentKinds?: Record<string, ChatAttachmentKind>;
  /** A card's button, when its kind gives no `onPress` of its own. */
  onOpenAttachment?: OpenAttachment;
  /**
   * Draws the app's own attachment kinds (a task with a checkbox, a worksheet with its progress)
   * instead of the card: every kind the package doesn't draw, registered or not. `null` hides the
   * kinds that aren't registered. Define it at module scope (or memoize it) so rows stay memoized.
   */
  attachmentSlot?: ChatAttachmentSlot | null;
  /** How long an app card's action may run before it reads as failed; 30 s by default, 0 for never. */
  cardActionTimeoutMs?: number;
  testID: string;
}

const SWIPE_REPLY = 56;
const SWIPE_MAX = 80;

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Mentions written `@[Name](user:<id>)` read as `@Name`. */
export function displayBody(body: string): string {
  return body.replace(/@\[([^\]]+)\]\(user:[0-9a-f-]{36}\)/gi, "@$1");
}

function MessageBubbleImpl(props: MessageBubbleProps) {
  const { row, me, urls, repliedTo, group, reducedMotion, testID } = props;
  const { copy, person, modules } = useChatNative();
  const colors = useThemeRoles();
  const { item, mine } = row;
  const message = item.type === "message" ? item.message : null;
  const pending = item.type === "pending" ? item.pending : null;

  const body = message ? (message.deletedAt ? "" : message.body) : (pending?.input.body ?? "");
  const createdAt = message?.createdAt ?? pending!.createdAt;
  const failed = pending?.status === "failed";
  // Its files are gone (bytes not kept between launches): Retry can't send it, picking them again can.
  const lost = failed && (pending?.files ?? []).some((f) => f.lost);
  const sending = pending?.status === "sending";
  const sender = person(row.senderId);
  const senderName = mine ? copy.you : (sender?.name ?? "");

  const kinds = props.attachmentKinds;
  const slot = props.attachmentSlot;
  const { cards, rest: plain } = useMemo(
    () => splitCardAttachments(message && !message.deletedAt ? message.attachments : [], kinds, slot !== undefined),
    [message, kinds, slot],
  );
  const runs = useCardRuns({ failedText: copy.cardActionFailed, timedOutText: copy.cardActionTimedOut, timeoutMs: props.cardActionTimeoutMs });
  // App attachments that drew nothing (the slot returned null): left out of the label and actions.
  const [empty, setEmpty] = useState<ReadonlySet<string>>(() => new Set());
  const onEmpty = useCallback((id: string, isEmpty: boolean) => {
    setEmpty((s) => {
      if (s.has(id) === isEmpty) return s;
      const next = new Set(s);
      if (isEmpty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const shownCards = cards.filter((a) => !empty.has(a.id));
  const attachments: BubbleAttachment[] = useMemo(() => {
    if (message) return message.deletedAt ? [] : plain.map((a) => fromServer(a, urls));
    // What it already carries (a hosted video) comes first, as the outbox sends it.
    return [
      ...(pending?.input.attachments ?? []).map((a, i) => fromPendingInput(pending!.clientId, i, a)),
      ...(pending?.files ?? []).map((f, i) => fromPending(pending!.clientId, i, f, pending!.previews?.[i])),
    ];
  }, [message, pending, urls, plain]);
  const preview = message && !message.deletedAt && message.moderation !== "hidden" ? (props.linkPreview ?? null) : null;

  // The controls the accessible bubble hides, as its own actions.
  const voices = attachments.filter((a) => a.kind === "voice" && a.uri && modules.audio);
  const photos = attachments.filter((a) => a.kind === "image" && a.uri && props.onOpenImage);
  const videos = attachments.filter((a) => a.kind === "video" && modules.video && (a.uri || a.playbackId));
  const playingVideo = usePlayingVideo(videos.map((a) => a.key));
  const cardActions = message
    ? cards.map((a) => {
        if (empty.has(a.id)) return null;
        const c = cardAction(attachmentKindOf(kinds, a.kind), a, message, props.onOpenAttachment, { mine });
        return c ? { label: c.label, run: () => void runs.run(a.id, c.run) } : null;
      })
    : [];
  const playingVoice = usePlayingVoiceNote(voices.map((a) => a.key));

  // ---- Swipe to reply ----
  const x = useRef(new Animated.Value(0)).current;
  const latest = useRef(props);
  latest.current = props;
  const crossed = useRef(false);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderMove: (_e, g) => {
          const dx = Math.max(0, Math.min(SWIPE_MAX, g.dx));
          x.setValue(dx);
          const over = dx >= SWIPE_REPLY;
          if (over && !crossed.current) latest.current.onSwipeReply?.();
          crossed.current = over;
        },
        onPanResponderRelease: (_e, g) => {
          const m = latest.current.row.item.type === "message" ? latest.current.row.item.message : null;
          if (g.dx >= SWIPE_REPLY && m) latest.current.onReply?.(m);
          crossed.current = false;
          if (latest.current.reducedMotion) x.setValue(0);
          else Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
        onPanResponderTerminate: () => {
          crossed.current = false;
          x.setValue(0);
        },
      }),
    [x],
  );

  if (message?.kind === "system") {
    return (
      <View testID={testID} style={{ alignItems: "center", paddingVertical: 6, paddingHorizontal: 24 }}>
        <NativeText preset="caption" style={{ color: colors.secondaryLabel, textAlign: "center" }}>
          {displayBody(message.body)}
        </NativeText>
      </View>
    );
  }

  const canSwipe = Boolean(message && !message.deletedAt && props.onReply);
  const reactions = message ? summarizeReactions(message, me) : [];
  const time = formatClock(createdAt);
  const moderation = moderationNote(message, { mine, observer: Boolean(props.observer) });
  const statusText = failed ? copy.notSent : sending ? copy.sending : null;
  const label = [
    senderName,
    message?.deletedAt ? copy.deleted : displayBody(body),
    attachments
      .map((a) =>
        a.kind === "image"
          ? copy.photo
          : a.kind === "voice"
            ? [copy.voice, a.transcript?.trim() ? fill(copy.transcriptLabel, { text: a.transcript.trim() }) : null].filter(Boolean).join(", ")
            : a.kind === "video"
              ? copy.video
              : copy.file,
      )
      .join(", "),
    shownCards
      .map((a) => {
        const s = runs.stateOf(a.id);
        return [cardTitle(attachmentKindOf(kinds, a.kind), a, { mine }), s.error].filter(Boolean).join(", ");
      })
      .join(", "),
    preview ? fill(copy.linkPreview, { title: preview.title?.trim() || linkHost(preview.url), site: preview.siteName?.trim() || linkHost(preview.url) }) : null,
    time,
    message?.editedAt ? copy.edited : null,
    statusText,
    moderation ? moderationText(moderation, copy) : null,
    reactions.length ? fill(copy.reactions, { count: reactions.reduce((n, r) => n + r.count, 0) }) : null,
  ]
    .filter(Boolean)
    .join(", ");

  const actions = [
    ...voices.flatMap((a, i) => [
      { name: `voice-${i}`, label: playingVoice === a.key ? copy.pauseVoice : copy.playVoice },
      { name: `voice-rate-${i}`, label: copy.changeSpeed },
    ]),
    ...photos.map((_, i) => ({ name: `photo-${i}`, label: photos.length > 1 ? fill(copy.openPhotoN, { n: i + 1 }) : copy.openImage })),
    ...videos.flatMap((a, i) => [
      { name: `video-${i}`, label: playingVideo === a.key ? copy.pauseVideo : copy.playVideo },
      // Mute and speed reach the player that is playing.
      ...(playingVideo === a.key ? [{ name: `video-mute-${i}`, label: copy.mute }, { name: `video-rate-${i}`, label: copy.changeSpeed }] : []),
      { name: `video-full-${i}`, label: copy.fullScreen },
    ]),
    ...cardActions.flatMap((c, i) => (c ? [{ name: `card-${i}`, label: c.label }] : [])),
    ...(preview ? [{ name: "open-link", label: copy.openLinkAction }] : []),
    ...(message && props.onReply && !message.deletedAt ? [{ name: "reply", label: copy.reply }] : []),
    ...(message && props.onLongPress && !message.deletedAt ? [{ name: "actions", label: copy.messageActions }] : []),
    ...(failed && !lost && props.onRetry ? [{ name: "retry", label: copy.retry }] : []),
    ...(lost && props.onReattach ? [{ name: "reattach", label: copy.attachAgain }] : []),
    ...(failed && props.onDiscard ? [{ name: "discard", label: copy.discard }] : []),
  ];
  const onAction = (name: string) => {
    const media = /^(voice-rate|voice|photo|video-full|video-mute|video-rate|video|card)-(\d+)$/.exec(name);
    if (media) {
      const i = Number(media[2]);
      if (media[1] === "card") cardActions[i]?.run();
      else if (media[1] === "video-mute" && videos[i]) toggleVideoMute(videos[i].key);
      else if (media[1] === "video-rate" && videos[i]) cycleVideoRate(videos[i].key);
      else if (media[1] === "video" && videos[i]) toggleVideo(videos[i].key);
      else if (media[1] === "video-full" && videos[i]) fullScreenVideo(videos[i].key);
      else if (media[1] === "voice" && voices[i]) toggleVoiceNote(voices[i].key);
      else if (media[1] === "voice-rate" && voices[i]) cycleVoiceNoteRate(voices[i].key);
      else if (media[1] === "photo" && photos[i]?.uri) props.onOpenImage?.(photos[i].uri, photos[i].name ? `${copy.photo}, ${photos[i].name}` : copy.photo);
      return;
    }
    if (name === "open-link" && preview) void openChatLink(preview.url, modules.webBrowser);
    else if (name === "reply" && message) props.onReply?.(message);
    else if (name === "actions" && message) props.onLongPress?.(message);
    else if (name === "retry" && pending) props.onRetry?.(pending.clientId);
    else if (name === "reattach" && pending) props.onReattach?.(pending.clientId, pending.files ?? []);
    else if (name === "discard" && pending) props.onDiscard?.(pending.clientId);
  };

  const quote = message?.replyToId ?? pending?.input.replyToId ?? null;
  const quoted = quote && repliedTo ? repliedTo : null;
  // A message that is only app attachments the slot drew nothing for has nothing to show or read.
  const invisible = Boolean(message && !message.deletedAt && !body && !attachments.length && !preview && !quote && !moderation && cards.length && !shownCards.length);
  const bubbleColor = mine ? colors.tint : colors.surface;
  const fg = mine ? "text-primary-foreground" : undefined;
  const textStyle = mine ? { fontSize: 17, lineHeight: 22 } : { fontSize: 17, lineHeight: 22, color: colors.label };

  return (
    <View
      testID={testID}
      accessibilityElementsHidden={invisible || undefined}
      importantForAccessibility={invisible ? "no-hide-descendants" : undefined}
      style={{ paddingHorizontal: 8, paddingTop: row.groupStart ? 8 : 2, backgroundColor: props.highlighted ? colors.fill : undefined, display: invisible ? "none" : undefined }}
    >
      {row.showName && sender?.name ? (
        <NativeText preset="caption" style={{ marginLeft: group ? 48 : 12, marginBottom: 2, color: colors.secondaryLabel }}>
          {sender.name}
        </NativeText>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: mine ? "flex-end" : "flex-start" }}>
        {group && !mine ? (
          <View style={{ width: 40, alignItems: "flex-start" }}>
            {row.showAvatar ? <NativeAvatar size={32} src={sender?.avatarUrl ?? null} fallback={initials(sender?.name)} alt={sender?.name} recyclingKey={row.senderId ?? undefined} /> : null}
          </View>
        ) : null}
        <Animated.View
          style={{ maxWidth: "80%", transform: [{ translateX: x }] }}
          {...(canSwipe ? responder.panHandlers : {})}
        >
          <Pressable
            testID={`${testID}-bubble`}
            accessible
            accessibilityLabel={label}
            accessibilityHint={failed ? copy.retry : undefined}
            accessibilityActions={actions}
            onAccessibilityAction={(e) => onAction(e.nativeEvent.actionName)}
            onLongPress={message && !message.deletedAt ? () => props.onLongPress?.(message) : undefined}
            delayLongPress={350}
            style={{
              paddingHorizontal: attachments.length && !body ? 4 : 12,
              paddingVertical: attachments.length && !body ? 4 : 8,
              borderRadius: 18,
              backgroundColor: bubbleColor,
              opacity: sending ? 0.6 : moderation === "hidden-mine" ? 0.7 : 1,
              gap: 4,
            }}
          >
            {quote ? (
              <View
                testID={`${testID}-quote`}
                style={{ borderLeftWidth: 3, borderLeftColor: mine ? colors.surface : colors.tint, paddingLeft: 8, paddingVertical: 2, opacity: 0.85 }}
              >
                <NativeText preset="caption" className={fg} style={mine ? { fontWeight: "600" } : { fontWeight: "600", color: colors.secondaryLabel }}>
                  {quoted ? (quoted.senderId === me ? copy.you : (person(quoted.senderId)?.name ?? "")) : ""}
                </NativeText>
                <NativeText preset="caption" numberOfLines={2} className={fg} style={mine ? undefined : { color: colors.secondaryLabel }}>
                  {quoted ? attachmentPreview(displayBody(quoted.body), quoted.attachments[0], kinds, Boolean(quoted.deletedAt)) : "…"}
                </NativeText>
              </View>
            ) : null}
            {attachments.length ? <MessageAttachments attachments={attachments} mine={mine} onOpenImage={props.onOpenImage} testID={testID} /> : null}
            {message && cards.length
              ? cards.map((a, i) => (
                  <AppAttachment
                    key={a.id}
                    attachment={a}
                    message={message}
                    kind={attachmentKindOf(kinds, a.kind)}
                    url={(a.path ? urls[a.path] : null) ?? a.url ?? null}
                    mine={mine}
                    slot={slot}
                    onOpenAttachment={props.onOpenAttachment}
                    onEmpty={onEmpty}
                    run={(task) => void runs.run(a.id, task)}
                    state={runs.stateOf(a.id)}
                    testID={`${testID}-card-${i}`}
                  />
                ))
              : null}
            {message?.deletedAt ? (
              <NativeText className={fg} style={[textStyle, { fontStyle: "italic", opacity: 0.7 }]}>
                {copy.deleted}
              </NativeText>
            ) : body ? (
              <NativeText className={fg} style={[textStyle, attachments.length ? { paddingHorizontal: 8, paddingBottom: 4 } : null]}>
                {displayBody(body)}
              </NativeText>
            ) : null}
            {moderation ? <ModerationMarker note={moderation} mine={mine} testID={`${testID}-moderation`} /> : null}
            {preview ? <ChatLinkPreviewCard preview={preview} mine={mine} images={props.linkPreviewImages} testID={`${testID}-preview`} /> : null}
          </Pressable>
        </Animated.View>
      </View>
      {reactions.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2, justifyContent: mine ? "flex-end" : "flex-start", marginLeft: group && !mine ? 40 : 0 }}>
          {reactions.map((r) => (
            <Pressable
              key={r.emoji}
              testID={`${testID}-reaction-${r.emoji}`}
              accessibilityRole="button"
              accessibilityState={{ selected: r.mine }}
              accessibilityLabel={`${r.emoji} ${r.count}`}
              disabled={!message || !props.onToggleReaction}
              onPress={() => message && props.onToggleReaction?.(message, r.emoji, !r.mine)}
              hitSlop={6}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                minHeight: 32,
                paddingHorizontal: 10,
                borderRadius: 16,
                backgroundColor: r.mine ? colors.fill : colors.surface,
                borderWidth: r.mine ? 1 : 0,
                borderColor: colors.tint,
              }}
            >
              <NativeText style={{ fontSize: 15 }}>{r.emoji}</NativeText>
              <NativeText preset="caption" style={{ color: colors.secondaryLabel }}>
                {String(r.count)}
              </NativeText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {row.groupEnd || failed ? (
        <View style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start", alignItems: "center", gap: 4, marginTop: 2, marginLeft: group && !mine ? 52 : 12, marginRight: 12 }}>
          {failed ? (
            <>
              <NativeText testID={`${testID}-failed`} preset="caption" style={{ color: colors.destructive }}>
                {pending?.error ?? copy.notSent}
              </NativeText>
              {lost ? (
                props.onReattach ? (
                  <SmallAction testID={`${testID}-reattach`} label={copy.attachAgain} onPress={() => props.onReattach?.(pending!.clientId, pending!.files ?? [])} color={colors.tint} />
                ) : null
              ) : (
                <SmallAction testID={`${testID}-retry`} label={copy.retry} onPress={() => props.onRetry?.(pending!.clientId)} color={colors.tint} />
              )}
              <SmallAction testID={`${testID}-discard`} label={copy.discard} onPress={() => props.onDiscard?.(pending!.clientId)} color={colors.destructive} />
            </>
          ) : (
            <NativeText preset="caption" style={{ color: colors.tertiaryLabel }}>
              {[time, message?.editedAt ? copy.edited : null, sending ? copy.sending : null].filter(Boolean).join(" · ")}
            </NativeText>
          )}
        </View>
      ) : null}
    </View>
  );
}

function SmallAction({ label, onPress, color, testID }: { label: string; onPress: () => void; color: unknown; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" }}>
      <NativeText preset="label" style={{ color: color as string }}>
        {label}
      </NativeText>
    </Pressable>
  );
}


export const MessageBubble = memo(MessageBubbleImpl);
