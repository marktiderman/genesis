/**
 * Messages: an inbox of conversations (InboxPage) with unread, muted and pinned marks, avatars and
 * swipe actions that change the rows; and chat's bubbles (MessageBubble, ChatTypingBubble) drawing
 * a sample group conversation from memory, with no ChatProvider and no network.
 */
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import type { ChatMessage } from "@marktiderman/genesis-chat";
import { buildThreadRows, ChatNativeProvider, ChatTypingBubble, MessageBubble, type ChatPerson } from "@marktiderman/genesis-chat/native";
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
