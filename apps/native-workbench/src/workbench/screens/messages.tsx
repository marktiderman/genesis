/**
 * Messages: an inbox of conversations (InboxPage) with unread, muted and pinned marks, avatars and
 * swipe actions that change the rows; chat's bubbles (MessageBubble, ChatTypingBubble) drawing a
 * sample group conversation from memory, with no ChatProvider and no network; and chat's Messages
 * look (the inbox, the bubbles' long press and + list, the details) on genesis-chat's in-memory
 * client, also with no network.
 */
import { useCallback, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryChatClient, type ChatMessage } from "@marktiderman/genesis-chat";
import { ChatProvider } from "@marktiderman/genesis-chat/react";
import {
  buildThreadRows,
  ChatBubbleShape,
  ChatDetailsScreen,
  ChatGlassCircle,
  ChatInboxScreen,
  ChatMessageMenu,
  ChatNativeProvider,
  ChatPlusList,
  ChatSymbol,
  ChatTypingBubble,
  MessageBubble,
  useChatColors,
  type ChatPerson,
  type ChatPlusItem,
  type ChatRect,
  type MessageActionId,
} from "@marktiderman/genesis-chat/native";
import { NativeText, NativeUserAvatar, useThemeRoles } from "@marktiderman/genesis-ui-native";
import { InboxPage, ScreenContainer, type InboxItem, type InboxSwipeAction } from "@marktiderman/genesis-ui-native/layouts";
import type { WorkbenchScreen } from "../registry";
import { SAMPLE_MESSAGES } from "../sample-data";

// --- Inbox --------------------------------------------------------------------------------------

const PREVIEWS = [
  "Can you take a look at the launch checklist before Friday?",
  "Pushed the fix for the login loop. Tests are green.",
  "Lunch on Thursday? There's a new place near the office.",
  "The numbers for Q4 are in the shared folder.",
  "Thanks! That's exactly what I needed.",
  "Reminder: design review moves to 3 PM tomorrow.",
  "I left a few comments on the onboarding draft.",
  "Can we push the sync to next week?",
  "Here's the recording from this morning's call.",
  "Sounds good, ship it.",
  "Do you have the updated contract from Acme?",
  "Happy Friday, everyone!",
];

/** Minutes ago for each thread: today, yesterday, this week and older, so every time format shows. */
const AGO_MINUTES = [2, 18, 55, 3 * 60, 9 * 60, 26 * 60, 30 * 60, 3 * 24 * 60, 4 * 24 * 60, 6 * 24 * 60, 12 * 24 * 60, 40 * 24 * 60];

interface Thread {
  id: string;
  from: string;
  preview: string;
  at: Date;
  unread: number;
  pinned: boolean;
  muted: boolean;
}

function sampleThreads(): Thread[] {
  const now = Date.now();
  return SAMPLE_MESSAGES.slice(0, 12).map((m, i) => ({
    id: m.id,
    from: m.from,
    preview: PREVIEWS[i]!,
    at: new Date(now - AGO_MINUTES[i]! * 60_000),
    unread: i === 0 ? 3 : i === 1 || i === 4 || i === 7 ? 1 : 0,
    pinned: i === 2,
    muted: i === 5,
  }));
}

function Inbox() {
  const header = useMemo(() => ({ headerTitle: "Inbox", large: false }), []);
  const [threads, setThreads] = useState<Thread[]>(sampleThreads);
  const [last, setLast] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const change = useCallback((id: string, update: (t: Thread) => Thread | null, said: string) => {
    setThreads((all) => all.flatMap((t) => (t.id === id ? (update(t) ?? []) : [t])));
    setLast(said);
  }, []);

  const items: InboxItem[] = useMemo(
    () =>
      threads.map((t) => {
        const actions: InboxSwipeAction[] = [
          t.unread
            ? { id: "read", label: "Read", icon: "mail-open", accent: "blue", swipe: { side: "leading", full: true }, onPress: () => change(t.id, (x) => ({ ...x, unread: 0 }), `Read ${t.from}`) }
            : { id: "unread", label: "Unread", icon: "message-unread", accent: "blue", swipe: { side: "leading", full: true }, onPress: () => change(t.id, (x) => ({ ...x, unread: 1 }), `Marked ${t.from} unread`) },
          { id: "pin", label: t.pinned ? "Unpin" : "Pin", icon: t.pinned ? "pin-off" : "pin", accent: "orange", swipe: { side: "leading" }, onPress: () => change(t.id, (x) => ({ ...x, pinned: !x.pinned }), `${t.pinned ? "Unpinned" : "Pinned"} ${t.from}`) },
          { id: "mute", label: t.muted ? "Show Alerts" : "Hide Alerts", icon: t.muted ? "bell" : "bell-off", accent: "purple", swipe: { side: "trailing" }, onPress: () => change(t.id, (x) => ({ ...x, muted: !x.muted }), `${t.muted ? "Unmuted" : "Muted"} ${t.from}`) },
          { id: "archive", label: "Archive", icon: "archive", tone: "neutral", confirms: true, swipe: { side: "trailing", full: true }, onPress: () => change(t.id, () => null, `Archived ${t.from}`) },
        ];
        return {
          id: t.id,
          title: t.from,
          preview: t.preview,
          timestamp: t.at,
          unread: t.unread > 0,
          unreadCount: t.unread > 1 ? t.unread : undefined,
          pinned: t.pinned,
          muted: t.muted,
          avatar: <NativeUserAvatar name={t.from} />,
          onPress: () => change(t.id, (x) => ({ ...x, unread: 0 }), `Opened ${t.from}`),
          swipeActions: actions,
          testID: `workbench-inbox-row-${t.id}`,
        };
      }),
    [threads, change],
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setThreads(sampleThreads());
      setLast("Refreshed");
      setRefreshing(false);
    }, 800);
  }, []);

  return (
    <ScreenContainer header={header} testID="workbench-inbox">
      <InboxPage
        items={items}
        refreshing={refreshing}
        onRefresh={refresh}
        header={
          <NativeText testID="workbench-inbox-last" preset="body-sm" className="px-5 pb-2 pt-3 text-muted-foreground">
            {last || "Swipe a row either way, long press it, or pull to refresh."}
          </NativeText>
        }
        emptyTitle="Inbox zero"
        emptyBody="Everything's archived. Pull to bring the samples back."
        emptyActionLabel="Restore samples"
        onEmptyAction={() => setThreads(sampleThreads())}
        testID="workbench-inbox-page"
      />
    </ScreenContainer>
  );
}

// --- Bubbles ------------------------------------------------------------------------------------

const ME = "u-me";
const PEOPLE: Record<string, ChatPerson> = {
  [ME]: { name: "You" },
  "u-ada": { name: "Ada Lovelace" },
  "u-alan": { name: "Alan Turing" },
};
const getPerson = (id: string) => PEOPLE[id];

const SCRIPT: { from: string; body: string; minutesAgo: number; reactions?: { emoji: string; userId: string }[] }[] = [
  { from: "u-ada", body: "Morning! Did the new build go out?", minutesAgo: 26 * 60 },
  { from: ME, body: "It did, last night around 11.", minutesAgo: 26 * 60 - 3 },
  { from: "u-alan", body: "Crash rate is down to 0.2% since then 🎉", minutesAgo: 26 * 60 - 5, reactions: [{ emoji: "🎉", userId: "u-ada" }, { emoji: "🎉", userId: ME }] },
  { from: "u-ada", body: "Nice work, both of you.", minutesAgo: 42 },
  { from: "u-ada", body: "Can we look at the onboarding copy today?", minutesAgo: 41 },
  { from: "u-ada", body: "The second screen still says “Workspace” where it should say “Team”.", minutesAgo: 41 },
  { from: ME, body: "Yes, I'll fix it this afternoon.", minutesAgo: 30 },
  { from: ME, body: "Want to pair on it at 2?", minutesAgo: 29, reactions: [{ emoji: "👍", userId: "u-alan" }] },
  { from: "u-alan", body: "Works for me. I'll bring the latest designs.", minutesAgo: 12 },
  { from: ME, body: "Perfect, see you then.", minutesAgo: 4 },
];

function sampleMessage(i: number, line: (typeof SCRIPT)[number], now: number): ChatMessage {
  return {
    id: `m${i + 1}`,
    conversationId: "c-sample",
    seq: i + 1,
    clientId: `client-${i + 1}`,
    senderId: line.from,
    senderRole: "member",
    kind: "text",
    body: line.body,
    mentions: [],
    replyToId: null,
    threadRootId: null,
    threadCount: 0,
    threadLastAt: null,
    topic: null,
    visibility: "everyone",
    silent: false,
    meta: {},
    createdAt: new Date(now - line.minutesAgo * 60_000).toISOString(),
    editedAt: null,
    deletedAt: null,
    attachments: [],
    reactions: line.reactions ?? [],
  };
}

const NO_URLS: Record<string, string> = {};

function Bubbles() {
  const header = useMemo(() => ({ headerTitle: "Message bubbles", large: false }), []);
  const colors = useThemeRoles();
  const backdrop = String(colors.groupedBackground);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const now = Date.now();
    return SCRIPT.map((line, i) => sampleMessage(i, line, now));
  });
  const [last, setLast] = useState("");

  const rows = useMemo(() => buildThreadRows(messages.map((message) => ({ type: "message" as const, message })), { me: ME, group: true }), [messages]);
  const lastMine = useMemo(() => [...messages].reverse().find((m) => m.senderId === ME)?.id, [messages]);

  const onToggleReaction = useCallback((message: ChatMessage, emoji: string, on: boolean) => {
    setMessages((all) =>
      all.map((m) =>
        m.id !== message.id ? m : { ...m, reactions: on ? [...m.reactions, { emoji, userId: ME }] : m.reactions.filter((r) => !(r.emoji === emoji && r.userId === ME)) },
      ),
    );
    setLast(`${on ? "Reacted" : "Took back"} ${emoji}`);
  }, []);
  const onReply = useCallback((message: ChatMessage) => setLast(`Replying to “${message.body}”`), []);
  const onLongPress = useCallback((message: ChatMessage) => setLast(`Long pressed “${message.body}”`), []);

  return (
    <ScreenContainer header={header} scroll style={{ backgroundColor: backdrop }} testID="workbench-bubbles">
      <ChatNativeProvider getPerson={getPerson}>
        <NativeText testID="workbench-bubbles-last" preset="body-sm" className="px-5 pb-1 pt-4 text-muted-foreground">
          {last || "Swipe a bubble right to reply, long press it, or tap a reaction."}
        </NativeText>
        <View style={{ paddingHorizontal: 8, paddingBottom: 24 }}>
          {rows.map((row) => {
            if (row.type === "day") {
              return (
                <NativeText key={row.key} preset="caption" className="py-3 text-center font-semibold text-muted-foreground">
                  {row.label}
                </NativeText>
              );
            }
            if (row.type !== "message") return null;
            const id = row.item.type === "message" ? row.item.message.id : row.key;
            return (
              <MessageBubble
                key={row.key}
                row={row}
                me={ME}
                urls={NO_URLS}
                group
                reducedMotion={false}
                receipt={id === lastMine ? "Read 9:41" : null}
                onToggleReaction={onToggleReaction}
                onReply={onReply}
                onLongPress={onLongPress}
                backdrop={backdrop}
                testID={`workbench-bubbles-message-${id}`}
              />
            );
          })}
          <View style={{ paddingTop: 8 }}>
            <ChatTypingBubble label="Ada Lovelace is typing…" userId="u-ada" group reducedMotion={false} testID="workbench-bubbles-typing" />
          </View>
        </View>
      </ChatNativeProvider>
    </ScreenContainer>
  );
}

export const messagesInbox: WorkbenchScreen = {
  id: "inbox",
  title: "Inbox",
  summary: "Twelve threads with avatars, unread dots and counts, a pinned and a muted row; swipe for Read or Unread and Pin, Hide Alerts and Archive (a full swipe archives); pull to refresh restores them.",
  section: "Messages",
  package: "genesis-ui-native",
  covers: ["InboxPage", "NativeUserAvatar"],
  screen: Inbox,
};

export const messagesBubbles: WorkbenchScreen = {
  id: "bubbles",
  title: "Message bubbles",
  summary: "A group conversation from memory: runs of bubbles with names and avatars, a day divider, reactions you can toggle, a read receipt on your last message, swipe to reply and the typing bubble.",
  section: "Messages",
  package: "genesis-chat",
  covers: ["MessageBubble", "ChatTypingBubble", "ChatNativeProvider"],
  screen: Bubbles,
};

// --- The Messages look, on the in-memory client -------------------------------------------------

const ADA = "u-ada";
const ALAN = "u-alan";
const GRACE = "u-grace";
const LOOK_PEOPLE: Record<string, ChatPerson> = { [ME]: { name: "Sam Sample" }, [ADA]: { name: "Ada Lovelace" }, [ALAN]: { name: "Alan Turing" }, [GRACE]: { name: "Grace Hopper" } };
const lookPerson = (id: string) => LOOK_PEOPLE[id];
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** Four conversations: an unread direct one, a pinned group, a muted one and the conversation with yourself. */
const SAMPLE_CHAT = createMemoryChatClient({
  me: ME,
  conversations: [
    {
      id: "c-ada",
      kind: "direct",
      members: [{ userId: ME, lastReadSeq: 1 }, { userId: ADA }],
      messages: [
        { senderId: ME, body: "Did the new build go out?", createdAt: minutesAgo(90) },
        { senderId: ADA, body: "It did, last night around 11.", createdAt: minutesAgo(80), reactions: [{ emoji: "❤️", userId: ME }] },
        { senderId: ADA, body: "Crash rate is down since then.", createdAt: minutesAgo(5) },
      ],
    },
    {
      id: "c-team",
      kind: "group",
      title: "Launch team",
      pinned: true,
      members: [{ userId: ME, role: "owner" }, { userId: ADA }, { userId: ALAN, role: "admin" }, { userId: GRACE }],
      messages: [
        { senderId: ALAN, body: "Checklist is in the shared folder.", createdAt: minutesAgo(300) },
        { senderId: ME, body: "Thanks, I'll go through it today.", createdAt: minutesAgo(240) },
      ],
    },
    {
      id: "c-alan",
      kind: "direct",
      muted: true,
      members: [{ userId: ME }, { userId: ALAN }],
      messages: [{ senderId: ALAN, body: "Lunch on Thursday?", createdAt: minutesAgo(26 * 60) }],
    },
    {
      id: "c-self",
      kind: "direct",
      title: "Notes",
      members: [{ userId: ME }],
      messages: [{ senderId: ME, body: "Remember to book the room.", createdAt: minutesAgo(3 * 24 * 60) }],
    },
  ],
});

/** genesis-chat's providers over the in-memory client: the screens below read it as they would a server. */
function SampleChat({ children }: { children: ReactNode }) {
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const loadPeople = useCallback(async (ids: string[]) => Object.fromEntries(ids.flatMap((id) => (LOOK_PEOPLE[id] ? [[id, LOOK_PEOPLE[id]!]] : []))), []);
  return (
    <QueryClientProvider client={queries}>
      <ChatProvider client={SAMPLE_CHAT} userId={ME} loadPeople={loadPeople}>
        <ChatNativeProvider getPerson={lookPerson}>{children}</ChatNativeProvider>
      </ChatProvider>
    </QueryClientProvider>
  );
}

function ChatInbox() {
  const header = useMemo(() => ({ headerTitle: "Messages inbox", large: false }), []);
  const [last, setLast] = useState("");
  const pageProps = useMemo(
    () => ({
      header: (
        <NativeText testID="workbench-chat-inbox-last" preset="body-sm" className="px-5 pb-2 pt-3 text-muted-foreground">
          {last || "Tap, swipe or long press a row; type in the search field."}
        </NativeText>
      ),
    }),
    [last],
  );
  return (
    <ScreenContainer header={header} testID="workbench-chat-inbox">
      <SampleChat>
        <ChatInboxScreen
          nativeHeader={false}
          onOpen={(id) => setLast(`Opened ${id}`)}
          onStart={() => setLast("New message")}
          onSearchMessages={(q) => setLast(`Searched messages for “${q}”`)}
          pageProps={pageProps}
          testID="workbench-chat-inbox-list"
        />
      </SampleChat>
    </ScreenContainer>
  );
}

const LOOK_LINES: { id: string; mine: boolean; body: string; position: "single" | "first" | "middle" | "last" }[] = [
  { id: "l1", mine: false, body: "Morning! Did the new build go out?", position: "single" },
  { id: "l2", mine: true, body: "It did, last night around 11.", position: "first" },
  { id: "l3", mine: true, body: "Crash rate is down since then.", position: "last" },
  { id: "l4", mine: false, body: "Long press a bubble for the tapbacks and the menu.", position: "single" },
];

function lookMessage(line: (typeof LOOK_LINES)[number], i: number): ChatMessage {
  return { ...sampleMessage(i, { from: line.mine ? ME : ADA, body: line.body, minutesAgo: 10 - i }, Date.now()), id: line.id };
}

function LookBubble({ line, onLongPress }: { line: (typeof LOOK_LINES)[number]; onLongPress: (message: ChatMessage, rect: ChatRect) => void }) {
  const c = useChatColors();
  const ref = useRef<ComponentRef<typeof View> | null>(null);
  const message = useMemo(() => lookMessage(line, LOOK_LINES.indexOf(line)), [line]);
  return (
    <View style={{ alignItems: line.mine ? "flex-end" : "flex-start", marginTop: line.position === "middle" || line.position === "last" ? 2 : 10, paddingHorizontal: 16 }}>
      <View ref={ref} collapsable={false} style={{ maxWidth: "75%" }}>
        <Pressable
          testID={`workbench-messages-look-bubble-${line.id}`}
          accessibilityRole="button"
          accessibilityLabel={line.body}
          delayLongPress={300}
          onLongPress={() => ref.current?.measureInWindow((x, y, width, height) => onLongPress(message, { x, y, width, height }))}
        >
          <ChatBubbleShape mine={line.mine} position={line.position} maxWidth="100%">
            <NativeText style={{ fontSize: 17, lineHeight: 22, color: line.mine ? c.roles.onSent : c.roles.onReceived }}>{line.body}</NativeText>
          </ChatBubbleShape>
        </Pressable>
      </View>
    </View>
  );
}

function MessagesLook() {
  const header = useMemo(() => ({ headerTitle: "Messages look", large: false }), []);
  return (
    <ScreenContainer header={header} testID="workbench-messages-look">
      <ChatNativeProvider getPerson={lookPerson}>
        <MessagesLookBody />
      </ChatNativeProvider>
    </ScreenContainer>
  );
}

function MessagesLookBody() {
  const c = useChatColors();
  const [last, setLast] = useState("");
  const [target, setTarget] = useState<{ message: ChatMessage; rect: ChatRect } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const plusItems: ChatPlusItem[] = useMemo(
    () => [
      { id: "camera", label: "Camera", icon: "camera", sf: "camera.fill", color: c.accents.camera, onPress: () => setLast("Camera") },
      { id: "photos", label: "Photos", icon: "image", sf: "photo.on.rectangle", color: c.accents.photos, onPress: () => setLast("Photos") },
      { id: "audio", label: "Audio", icon: "mic", sf: "waveform", color: c.accents.audio, onPress: () => setLast("Audio") },
      { id: "video", label: "Video", icon: "video", sf: "video.fill", color: c.accents.video, onPress: () => setLast("Video") },
      { id: "send-later", label: "Send Later", icon: "clock", sf: "clock.fill", color: c.accents.schedule, onPress: () => setLast("Send Later") },
    ],
    [c],
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.roles.pageSolid }}>
      <NativeText testID="workbench-messages-look-last" preset="body-sm" className="px-5 pb-1 pt-4 text-muted-foreground">
        {last || "Long press a bubble, or tap + for the list."}
      </NativeText>
      <View style={{ flex: 1, paddingTop: 8 }}>
        {LOOK_LINES.map((line) => (
          <LookBubble key={line.id} line={line} onLongPress={(message, rect) => setTarget({ message, rect })} />
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 24 }}>
        <ChatGlassCircle size={40} testID="workbench-messages-look-plus" label="More" onPress={() => setPlusOpen(true)}>
          <ChatSymbol icon="plus" sf="plus" size={19} weight="medium" color={c.label} />
        </ChatGlassCircle>
        <NativeText preset="body-sm" className="text-muted-foreground">
          The composer's + list
        </NativeText>
      </View>
      <ChatPlusList open={plusOpen} onClose={() => setPlusOpen(false)} items={plusItems} testID="workbench-messages-look-plus-list" />
      <ChatMessageMenu
        target={target}
        context={{ me: ME, role: "member", canPost: true, pinned: false, canPin: true, canCopy: true }}
        onClose={() => setTarget(null)}
        onReact={(message, emoji, on) => setLast(`${on ? "Reacted" : "Took back"} ${emoji} on “${message.body}”`)}
        onAction={(message, action: MessageActionId) => setLast(`${action} “${message.body}”`)}
        testID="workbench-messages-look-menu"
      />
    </View>
  );
}

function ChatDetails() {
  const header = useMemo(() => ({ headerTitle: "Conversation details", large: false }), []);
  const [last, setLast] = useState("");
  return (
    <ScreenContainer header={header} testID="workbench-chat-details">
      <NativeText testID="workbench-chat-details-last" preset="body-sm" className="px-5 pb-1 pt-3 text-muted-foreground">
        {last || "A group's details: Search, Pin, Scheduled, Hide Alerts, its members and Archive."}
      </NativeText>
      <SampleChat>
        <ChatDetailsScreen
          conversationId="c-team"
          nativeHeader={false}
          onSearch={() => setLast("Search in conversation")}
          onOpenScheduled={() => setLast("Scheduled messages")}
          onArchived={() => setLast("Archived")}
          testID="workbench-chat-details-screen"
        />
      </SampleChat>
    </ScreenContainer>
  );
}

export const messagesChatInbox: WorkbenchScreen = {
  id: "chat-inbox",
  title: "Messages inbox",
  summary: "genesis-chat's inbox in the Messages look on sample conversations: plain rows with faces, an unread dot, a pinned group's face, a muted row and the conversation with yourself; round swipe actions, the long press's peek over a glass menu, and the glass search field.",
  section: "Messages",
  package: "genesis-chat",
  covers: ["ChatInboxScreen", "ChatInboxRowContent", "ChatPinnedFaces", "ChatSearchField", "ChatConversationMenu", "ChatConversationPreview", "ChatFace", "ChatSymbol", "ChatTap"],
  screen: ChatInbox,
};

export const messagesLook: WorkbenchScreen = {
  id: "messages-look",
  title: "Messages look",
  summary: "Bubbles in the chat roles with tails; a long press lifts a bubble with the tapbacks over it and the glass menu under it; + opens the glass list of round colored icons.",
  section: "Messages",
  package: "genesis-chat",
  covers: ["ChatBubbleShape", "ChatBubbleTail", "ChatMessageMenu", "ChatContextOverlay", "ChatGlassMenu", "ChatGlassPanel", "ChatGlassCircle", "ChatGlassList", "ChatPlusList", "ChatAccentIcon"],
  screen: MessagesLook,
};

export const messagesChatDetails: WorkbenchScreen = {
  id: "chat-details",
  title: "Conversation details",
  summary: "A group's details on sample data: the large face and name, round glass Search, Pin and Scheduled, Hide Alerts as a switch, the members with their admins, and Archive in red.",
  section: "Messages",
  package: "genesis-chat",
  covers: ["ChatDetailsScreen", "ChatDetailsHero", "ChatDetailsActions", "ChatDetailsSettings", "ChatDetailsMembers", "ChatDetailsDanger"],
  screen: ChatDetails,
};
