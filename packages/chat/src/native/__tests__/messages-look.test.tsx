// @vitest-environment happy-dom
// @feat:chat
// The Messages look, by default: the chat roles' colors, the inbox's filters, menu and header
// items, the thread's time separators, the long-press menu, the + list, the details screen and the
// slots an app replaces a part through.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { PlatformColor } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveChatRoles } from "@marktiderman/genesis-design-system";
import { GenesisModulesProvider } from "@marktiderman/genesis-ui-native/components";
import type { ChatClient } from "../../core/client";
import type { ChatInboxItem, ChatMessage } from "../../core/types";
import { ChatProvider } from "../../react/index";
import { chatNativeCopy } from "../copy";
import { ChatNativeProvider } from "../context";
import { ChatDetailsScreen, isSelfMembers } from "../details-screen";
import { applyInboxFilter, ChatInboxScreen, defaultInboxFilters, inboxHeaderItems, isGroupConversation, isSelfConversation, matchesInboxSearch, pinnedConversations } from "../inbox-screen";
import { ChatMessageMenu, TAPBACKS } from "../message-menu";
import { MessageBubble } from "../message-bubble";
import { chatColors } from "../messages-look";
import { chatThreadStackOptions } from "../stack-options";
import { startsTimeSeparator, timeSeparatorLabel } from "../messages-time";
import { buildThreadRows } from "../rows";
import type { ThreadItem } from "../../core/thread";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

function item(over: Partial<ChatInboxItem> = {}): ChatInboxItem {
  return {
    conversationId: C, kind: "direct", title: null, subjectType: null, subjectId: null, status: "open", role: "member",
    otherUserId: SAM, memberCount: 2, lastSeq: 3, lastReadSeq: 3, unread: 0, mentioned: false, muted: false, pinned: false,
    archived: false, lastMessageAt: new Date().toISOString(), lastMessage: null, ...over,
  } as ChatInboxItem;
}

function msg(seq: number, senderId: string, createdAt: string, over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `m${seq}`, conversationId: C, seq, clientId: `c${seq}`, senderId, senderRole: "member", kind: "text", body: `body ${seq}`,
    mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone",
    silent: false, meta: {}, createdAt, editedAt: null, deletedAt: null, attachments: [], reactions: [], ...over,
  } as ChatMessage;
}

describe("chat colors", () => {
  it("are the design system's chat roles, the same whatever the brand, with the theme's text roles beside them", () => {
    const neutral = { label: "L", secondaryLabel: "S", tertiaryLabel: "T", separator: "P", destructive: "D" };
    const light = chatColors("light", neutral);
    // The test runtime is iOS: a role Messages draws in a system color is that PlatformColor.
    const expected = resolveChatRoles({ target: "ios", scheme: "light", platformColor: PlatformColor });
    expect(light.roles.sent).toEqual(PlatformColor("systemBlue"));
    expect(light.roles.received).toBe(expected.roles.received);
    expect(light.accents.photos).toEqual(expected.accents.photos);
    expect(light.label).toBe("L");
    expect(light.avatarGradient).toBe(`linear-gradient(180deg, ${String(expected.roles.avatarTop)}, ${String(expected.roles.avatarBottom)})`);
    const dark = chatColors("dark", neutral);
    expect(dark.roles.received).toBe(resolveChatRoles({ target: "android", scheme: "dark" }).roles.received);
    expect(dark.roles.received).not.toBe(light.roles.received);
  });
});

describe("the inbox's filters", () => {
  it("are All Messages, Unread and Groups by default, and an app adds its own as configuration", () => {
    const defaults = defaultInboxFilters(chatNativeCopy);
    expect(defaults.map((f) => f.id)).toEqual(["all", "unread", "groups"]);
    const items = [item({ conversationId: "a", unread: 2 }), item({ conversationId: "b", kind: "group", memberCount: 5, title: "Team" }), item({ conversationId: "c" })];
    expect(applyInboxFilter(items, defaults[1], ME).map((i) => i.conversationId)).toEqual(["a"]);
    expect(applyInboxFilter(items, defaults[2], ME).map((i) => i.conversationId)).toEqual(["b"]);
    const sample = { id: "sample", label: "Sample filter", icon: "star" as const, predicate: (i: ChatInboxItem) => i.conversationId !== "a", sort: (x: ChatInboxItem, y: ChatInboxItem) => y.conversationId.localeCompare(x.conversationId) };
    expect(applyInboxFilter(items, sample, ME).map((i) => i.conversationId)).toEqual(["c", "b"]);
  });

  it("tell a group, the conversation with yourself, the pins and a search match", () => {
    expect(isGroupConversation({ kind: "direct", memberCount: 2 })).toBe(false);
    expect(isGroupConversation({ kind: "cohort", memberCount: 3 })).toBe(true);
    expect(isSelfConversation({ kind: "direct", otherUserId: null, memberCount: 1 })).toBe(true);
    expect(isSelfConversation({ kind: "direct", otherUserId: SAM, memberCount: 2 })).toBe(false);
    expect(pinnedConversations([item({ pinned: true }), item({ pinned: true, archived: true }), item()])).toHaveLength(1);
    const nameOf = (id: string | null) => (id === SAM ? "Sam Lee" : undefined);
    expect(matchesInboxSearch(item(), "sam", nameOf)).toBe(true);
    expect(matchesInboxSearch(item({ lastMessage: { body: "Café at noon", deleted: false } as ChatInboxItem["lastMessage"] }), "cafe", nameOf)).toBe(true);
    expect(matchesInboxSearch(item(), "nobody", nameOf)).toBe(false);
  });

  it("go in the header's filter menu, the checked one first, then the app's entries, with Compose beside it", () => {
    const onFilter = vi.fn();
    const onCompose = vi.fn();
    const archived = vi.fn();
    const items = inboxHeaderItems({ filters: defaultInboxFilters(chatNativeCopy), active: "unread", onFilter, menu: [{ id: "archived", label: "Archived", sf: "archivebox", onPress: archived }], onCompose, copy: chatNativeCopy, tint: "x" }) as {
      type: string;
      icon?: { name: string };
      onPress?: () => void;
      menu?: { items: { items: { title: string; state?: string; onPress: () => void }[] }[] };
    }[];
    expect(items.map((i) => i.type)).toEqual(["menu", "button"]);
    expect(items[0]!.icon!.name).toBe("line.3.horizontal.decrease.circle.fill");
    const [filters, entries] = items[0]!.menu!.items;
    expect(filters!.items.map((a) => [a.title, a.state])).toEqual([["All Messages", "off"], ["Unread", "on"], ["Groups", "off"]]);
    filters!.items[2]!.onPress();
    expect(onFilter).toHaveBeenCalledWith("groups");
    entries!.items[0]!.onPress();
    expect(archived).toHaveBeenCalled();
    items[1]!.onPress!();
    expect(onCompose).toHaveBeenCalled();
  });
});

describe("times", () => {
  it("separate the thread where a day starts or an hour has passed, the day drawn bold", () => {
    expect(startsTimeSeparator(null, "2026-11-24T10:00:00")).toBe(true);
    expect(startsTimeSeparator("2026-11-24T10:00:00", "2026-11-24T10:40:00")).toBe(false);
    expect(startsTimeSeparator("2026-11-24T10:00:00", "2026-11-24T11:00:00")).toBe(true);
    expect(timeSeparatorLabel("2026-11-24T09:41:00", new Date("2026-11-24T12:00:00")).day).toBe("Today");
    expect(timeSeparatorLabel("2026-11-23T09:41:00", new Date("2026-11-24T12:00:00")).day).toBe("Yesterday");
    expect(timeSeparatorLabel("2026-10-01T09:41:00", new Date("2026-11-24T12:00:00")).time).toMatch(/^at /);
    // The words are the copy's.
    const words = { today: "Hoy", yesterday: "Ayer", atTime: "a las {time}" };
    expect(timeSeparatorLabel("2026-11-24T09:41:00", new Date("2026-11-24T12:00:00"), undefined, words).day).toBe("Hoy");
    expect(timeSeparatorLabel("2026-11-23T09:41:00", new Date("2026-11-24T12:00:00"), undefined, words).day).toBe("Ayer");
    expect(timeSeparatorLabel("2026-10-01T09:41:00", new Date("2026-11-24T12:00:00"), undefined, words).time).toMatch(/^a las /);
  });

  it("are rows the thread draws with `separators: \"time\"`", () => {
    const items: ThreadItem[] = [
      { type: "message", message: msg(1, SAM, "2026-11-24T09:00:00") },
      { type: "message", message: msg(2, ME, "2026-11-24T09:10:00") },
      { type: "message", message: msg(3, SAM, "2026-11-24T10:30:00") },
    ] as ThreadItem[];
    const rows = buildThreadRows(items, { me: ME, group: false, separators: "time", now: new Date("2026-11-24T12:00:00") });
    const days = rows.filter((r) => r.type === "day");
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ day: "Today" });
    // The default stays a heading per day.
    expect(buildThreadRows(items, { me: ME, group: false }).filter((r) => r.type === "day")).toHaveLength(1);
  });
});

describe("the long press on a bubble", () => {
  it("shows Messages' tapbacks over the bubble and its actions in the glass menu; a tapback reacts and closes", async () => {
    const onReact = vi.fn();
    const onClose = vi.fn();
    const onAction = vi.fn();
    const message = msg(1, SAM, new Date().toISOString());
    render(
      <ChatNativeProvider>
        <ChatMessageMenu
          target={{ message, rect: { x: 16, y: 300, width: 200, height: 40 } }}
          context={{ me: ME, role: "member", canPost: true, pinned: false, canPin: true, canCopy: true }}
          onClose={onClose}
          onReact={onReact}
          onAction={onAction}
          testID="menu"
        />
      </ChatNativeProvider>,
    );
    for (const e of TAPBACKS) expect(screen.getByTestId(`menu-react-${e}`)).toBeTruthy();
    expect(screen.getAllByRole("menuitem").map((e) => e.getAttribute("data-testid"))).toEqual(["menu-menu-reply", "menu-menu-copy", "menu-menu-pin"]);
    fireEvent.click(screen.getByTestId("menu-react-❤️"));
    expect(onReact).toHaveBeenCalledWith(message, "❤️", true);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("More reactions", () => {
  it("opens the emoji sheet only once the long-press layer has closed", async () => {
    const message = msg(1, SAM, new Date().toISOString());
    function Harness() {
      const [target, setTarget] = useState<{ message: ChatMessage; rect: null } | null>({ message, rect: null });
      return (
        <ChatMessageMenu
          target={target}
          context={{ me: ME, role: "member", canPost: true, pinned: false, canPin: true, canCopy: true }}
          onClose={() => setTarget(null)}
          onReact={vi.fn()}
          onAction={vi.fn()}
          testID="menu"
        />
      );
    }
    render(
      <ChatNativeProvider>
        <Harness />
      </ChatNativeProvider>,
    );
    expect(screen.queryByTestId("menu-emoji")).toBeNull();
    await act(async () => fireEvent.click(screen.getByTestId("menu-react-more")));
    await waitFor(() => expect(screen.queryByTestId("menu-layer")).toBeNull());
    await waitFor(() => expect(screen.getByTestId("menu-emoji")).toBeTruthy());
  });
});

describe("a bubble's tapbacks", () => {
  it("show three on the corner and the rest behind +N, which shows them all", () => {
    const reactions = ["❤️", "👍", "😂", "🎉", "🙏"].map((emoji, i) => ({ emoji, userId: `u${i}`, createdAt: new Date().toISOString() }));
    const message = msg(1, SAM, new Date().toISOString(), { reactions } as Partial<ChatMessage>);
    const row = { type: "message" as const, key: "c:c1", item: { type: "message" as const, message }, mine: false, senderId: SAM, groupStart: true, groupEnd: true, showName: false, showAvatar: false };
    render(
      <ChatNativeProvider>
        <MessageBubble row={row} me={ME} urls={{}} group={false} reducedMotion onToggleReaction={vi.fn()} testID="b" />
      </ChatNativeProvider>,
    );
    expect(screen.queryByTestId("b-reaction-🎉")).toBeNull();
    // The row makes room above for the tapbacks (the swipe clips what overflows it), and is opaque,
    // covering the swipe's reply arrow until the row is dragged.
    const drawn = JSON.parse(screen.getByTestId("b-row").dataset.style!) as { paddingTop: number; backgroundColor: unknown };
    expect(drawn.paddingTop).toBeGreaterThan(0);
    expect(drawn.backgroundColor).toBeTruthy();
    const more = screen.getByTestId("b-reactions-more");
    expect(more.getAttribute("aria-label")).toBe("2 more reactions");
    fireEvent.click(more);
    expect(screen.getByTestId("b-reaction-🎉")).toBeTruthy();
    expect(screen.getByTestId("b-reaction-🙏")).toBeTruthy();
  });
});

function fakeClient(over: Record<string, unknown> = {}) {
  return {
    inbox: vi.fn(async () => [item({ unread: 1, title: null })]),
    subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
    unreadTotal: vi.fn(async () => 0),
    conversation: vi.fn(async () => ({ id: C, kind: "direct", title: null, settings: {}, status: "open", archivedAt: null })),
    members: vi.fn(async () => [{ conversationId: C, userId: ME, role: "member", lastReadSeq: 0, joinedAt: "2026-10-01T00:00:00Z" }]),
    setMySettings: vi.fn(async () => {}),
    ...over,
  } as unknown as ChatClient & Record<string, ReturnType<typeof vi.fn>>;
}

function wrap(client: ChatClient, children: ReactNode, modules: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <GenesisModulesProvider modules={modules}>
        <ChatProvider client={client} userId={ME}>
          <ChatNativeProvider getPerson={(id) => (id === SAM ? { name: "Sam Lee" } : id === ME ? { name: "Avery Sample" } : undefined)}>{children}</ChatNativeProvider>
        </ChatProvider>
      </GenesisModulesProvider>
    </QueryClientProvider>
  );
}

describe("ChatInboxScreen", () => {
  it("draws Messages' rows (the unread dot, the face's initials, the time) and sets the stack's large title with the header items", async () => {
    const seen: Record<string, unknown>[] = [];
    const StackScreen = ({ options }: { options?: Record<string, unknown> }) => {
      if (options) seen.push(options);
      return null;
    };
    render(wrap(fakeClient(), <ChatInboxScreen onOpen={vi.fn()} onStart={vi.fn()} onOpenArchived={vi.fn()} testID="inbox" />, { router: { StackScreen, useFocusEffect: () => undefined } }));
    await waitFor(() => expect(screen.getByTestId(`inbox-row-${C}`)).toBeTruthy());
    expect(screen.getByTestId(`inbox-row-${C}-unread`)).toBeTruthy();
    expect(screen.getByTestId(`inbox-row-${C}-avatar`).textContent).toBe("SL");
    expect(screen.getByTestId(`inbox-row-${C}`).getAttribute("aria-label")).toMatch(/^Unread, Sam Lee/);
    const options = seen.at(-1)!;
    expect(options).toMatchObject({ title: "Messages", headerLargeTitle: true });
    expect((options.unstable_headerRightItems as () => { type: string }[])().map((i) => i.type)).toEqual(["menu", "button"]);
    expect(screen.getByTestId("inbox-search-input")).toBeTruthy();
  });

  it("takes a slot for a row, given the row's data", async () => {
    const Row = ({ title, testID }: { title: string; testID: string }) => <span data-testid={testID}>{`own ${title}`}</span>;
    render(wrap(fakeClient(), <ChatInboxScreen onOpen={vi.fn()} slots={{ row: Row }} nativeHeader={false} search={false} testID="inbox" />));
    await waitFor(() => expect(screen.getByTestId(`inbox-row-${C}`).textContent).toBe("own Sam Lee"));
    expect(screen.queryByTestId("inbox-search-input")).toBeNull();
  });
});

describe("the headers", () => {
  it("give the native header plain color strings (it takes no PlatformColor) and the thread's back button its chevron alone", () => {
    const options = chatThreadStackOptions({ headerTitle: "Sam" }, "#000000");
    expect(options).toMatchObject({ headerBackButtonDisplayMode: "minimal", headerStyle: { backgroundColor: "#000000" } });
  });

  it("set the inbox's large title and bar in the scheme's plain colors", async () => {
    const seen: Record<string, unknown>[] = [];
    const StackScreen = ({ options }: { options?: Record<string, unknown> }) => {
      if (options) seen.push(options);
      return null;
    };
    render(wrap(fakeClient(), <ChatInboxScreen onOpen={vi.fn()} testID="inbox" />, { router: { StackScreen, useFocusEffect: () => undefined } }));
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const o = seen.at(-1) as { headerLargeTitleStyle: { color: unknown }; headerTitleStyle: { color: unknown }; headerStyle: { backgroundColor: unknown }; headerLargeStyle: { backgroundColor: unknown } };
    for (const v of [o.headerLargeTitleStyle.color, o.headerTitleStyle.color, o.headerStyle.backgroundColor, o.headerLargeStyle.backgroundColor]) expect(typeof v).toBe("string");
  });
});

describe("ChatDetailsScreen", () => {
  it("shows the conversation with yourself as Just you, with your own face", async () => {
    expect(isSelfMembers({ kind: "direct" }, [ME], ME)).toBe(true);
    expect(isSelfMembers({ kind: "direct" }, [ME, SAM], ME)).toBe(false);
    render(wrap(fakeClient({ inbox: vi.fn(async () => [item({ otherUserId: null, memberCount: 1, title: "Notes" })]) }), <ChatDetailsScreen conversationId={C} nativeHeader={false} onSearch={vi.fn()} testID="details" />));
    await waitFor(() => expect(screen.getByText("Just you")).toBeTruthy());
    expect(screen.getByText("Avery Sample")).toBeTruthy();
    expect(screen.getByTestId("details-search").getAttribute("aria-label")).toBe("Search in conversation");
  });

  it("reads Hide Alerts as one switch, with its state, that toggles from the whole row", async () => {
    const client = fakeClient();
    render(wrap(client, <ChatDetailsScreen conversationId={C} nativeHeader={false} testID="details" />));
    const row = await screen.findByTestId("details-mute");
    expect(row.getAttribute("role")).toBe("switch");
    expect(row.getAttribute("aria-checked")).toBe("false");
    expect(row.getAttribute("aria-disabled")).not.toBe("true");
    await act(async () => fireEvent.click(row));
    await waitFor(() => expect(client.setMySettings).toHaveBeenCalledWith(C, expect.objectContaining({ mutedUntil: expect.any(String) })));
  });

  it("archives through the inbox's own action, then says so to the app", async () => {
    const client = fakeClient();
    const onArchived = vi.fn();
    render(wrap(client, <ChatDetailsScreen conversationId={C} nativeHeader={false} onArchived={onArchived} testID="details" />));
    await waitFor(() => expect(screen.getByTestId("details-archive")).toBeTruthy());
    await act(async () => fireEvent.click(screen.getByTestId("details-archive")));
    await waitFor(() => expect(client.setMySettings).toHaveBeenCalledWith(C, { archived: true }));
    await waitFor(() => expect(onArchived).toHaveBeenCalled());
  });
});
