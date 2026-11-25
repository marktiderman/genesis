// @vitest-environment happy-dom
// @feat:chat
// The inbox row's actions, as Messages has them: Unread (or Read) and Pin to the right, Hide Alerts
// and Delete to the left, Archive in the menu only. Delete asks first, then deletes for you only.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { InboxItem } from "@marktiderman/genesis-ui-native/layouts";
import type { ChatClient } from "../../core/client";
import { ChatProvider } from "../../react/index";
import { ChatNativeProvider } from "../context";

// The rows the inbox hands InboxPage, which is drawn as it is (nothing about it is mocked away).
const seen: { items: InboxItem[] } = { items: [] };
vi.mock("@marktiderman/genesis-ui-native/layouts", async (original) => {
  const real = await original<typeof import("@marktiderman/genesis-ui-native/layouts")>();
  return {
    ...real,
    InboxPage: (props: Parameters<typeof real.InboxPage>[0]) => {
      seen.items = props.items;
      return createElement(real.InboxPage, props);
    },
  };
});
const alerts: { title: string; body?: string; buttons: { text: string; onPress?: () => void }[] }[] = [];
vi.mock("react-native", async (original) => ({
  ...(await original<object>()),
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  Alert: {
    alert: (title: string, body?: string, buttons: { text: string; onPress?: () => void }[] = []) => alerts.push({ title, body, buttons }),
  },
}));

// eslint-disable-next-line import/first
import { ChatInboxScreen } from "../inbox-screen";

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";

function row(unread: number, muted = false) {
  return {
    conversationId: C, kind: "direct", title: "Sam", subjectType: null, subjectId: null, status: null, role: "member",
    otherUserId: null, memberCount: 2, lastSeq: 3, lastReadSeq: 3 - unread, unread, mentioned: false, muted, pinned: false,
    archived: false, lastMessageAt: new Date().toISOString(), lastMessage: null,
  };
}

async function renderWith(item: ReturnType<typeof row>, over: Record<string, unknown> = {}, screen: { current: Record<string, unknown> } = { current: {} }, extra: ReturnType<typeof row>[] = []) {
  const client = {
    inbox: vi.fn(async () => [item, ...extra]),
    subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
    unreadTotal: vi.fn(async () => 0),
    markRead: vi.fn(async () => 3),
    // What the long press's peek reads (the conversation's latest messages).
    conversation: vi.fn(async () => ({ id: C, kind: "direct", title: null, settings: {}, status: "open", archivedAt: null })),
    members: vi.fn(async () => []),
    kind: vi.fn(async () => ({ kind: "direct", label: "Direct", maxMembers: 2 })),
    myRole: vi.fn(async () => "member"),
    canPost: vi.fn(async () => true),
    messages: vi.fn(async () => ({ messages: [], hasEarlier: false })),
    message: vi.fn(async () => null),
    subscribeConversation: vi.fn(() => ({ unsubscribe: vi.fn(), typing: vi.fn(), recording: vi.fn(), send: vi.fn() })),
    pins: vi.fn(async () => []),
    fileUrls: vi.fn(async () => ({})),
    setMySettings: vi.fn(async () => {}),
    deleteConversationForMe: vi.fn(async () => {}),
    ...over,
  } as unknown as ChatClient & Record<string, ReturnType<typeof vi.fn>>;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A thread this device opened before: Delete for me must not leave its history cached.
  qc.setQueryData(["genesis-chat", "conversation", C, "messages", null, null], { pages: [{ messages: [{ id: "old" }] }] });
  qc.setQueryData(["genesis-chat", "pins", C], ["old"]);
  const tree = () => (
    <QueryClientProvider client={qc}>
      <ChatProvider client={client} userId={ME}>
        <ChatNativeProvider>
          {/* An inline onOpen, as an app writes it: a new function every render. */}
          <ChatInboxScreen onOpen={() => {}} {...screen.current} />
        </ChatNativeProvider>
      </ChatProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  await waitFor(() => expect(seen.items.length).toBe(1));
  await act(async () => {});
  const actions = seen.items[0]!.swipeActions ?? [];
  return { client, qc, actions, byId: (id: string) => actions.find((a) => a.id === id)!, rerender: () => view.rerender(tree()) };
}

describe("ChatInboxScreen's row actions", () => {
  it("are Messages': Unread and Pin leading, Hide Alerts and Delete trailing, Archive in the menu only", async () => {
    const { actions, byId } = await renderWith(row(0));
    expect(actions.map((a) => a.id)).toEqual(["unread", "pin", "alerts", "delete", "archive"]);
    expect(byId("unread")).toMatchObject({ swipe: { side: "leading", full: true }, tone: "info", icon: "message-unread" });
    expect(byId("pin")).toMatchObject({ swipe: { side: "leading" }, accent: "orange" });
    expect(byId("alerts")).toMatchObject({ swipe: { side: "trailing" }, accent: "indigo", icon: "bell-off", label: "Hide Alerts" });
    expect(byId("delete")).toMatchObject({ swipe: { side: "trailing", full: true }, destructive: true, confirms: true });
    expect(byId("archive")).toMatchObject({ swipe: false });
  });

  it("Mark as Unread sets the mark for you; an unread row offers Read instead", async () => {
    const first = await renderWith(row(0));
    first.byId("unread").onPress();
    await waitFor(() => expect(first.client.setMySettings).toHaveBeenCalledWith(C, { markedUnread: true }));
    cleanup();
    const second = await renderWith(row(2));
    expect(second.actions.map((a) => a.id)).toContain("read");
    second.byId("read").onPress();
    await waitFor(() => expect(second.client.markRead).toHaveBeenCalledWith(C));
  });

  it("Delete asks first, then deletes for you only, up to the last message the row showed", async () => {
    const { client, qc, byId } = await renderWith(row(0));
    byId("delete").onPress();
    expect(client.deleteConversationForMe).not.toHaveBeenCalled();
    expect(alerts.at(-1)!.body).toMatch(/removed for you/);
    const confirm = alerts.at(-1)!.buttons.find((b) => b.text === "Delete")!;
    confirm.onPress!();
    await waitFor(() => expect(client.deleteConversationForMe).toHaveBeenCalledWith(C, 3));
    // The thread this device had cached is gone, so a new message can't bring the history back here.
    await waitFor(() => expect(qc.getQueryData(["genesis-chat", "conversation", C, "messages", null, null])).toBeUndefined());
    expect(qc.getQueryData(["genesis-chat", "pins", C])).toBeUndefined();
  });

  it("says so when an action fails, instead of doing nothing", async () => {
    const failing = await renderWith(row(0), {
      setMySettings: vi.fn(async () => {
        throw new Error("You aren't in this conversation");
      }),
      deleteConversationForMe: vi.fn(async () => {
        throw new Error("Offline");
      }),
    });
    failing.byId("unread").onPress();
    await waitFor(() => expect(alerts.at(-1)).toMatchObject({ title: "That didn't work", body: "You aren't in this conversation" }));
    failing.byId("delete").onPress();
    alerts.at(-1)!.buttons.find((b) => b.text === "Delete")!.onPress!();
    await waitFor(() => expect(alerts.at(-1)).toMatchObject({ title: "That didn't work", body: "Offline" }));
    // A failed delete leaves the cached thread alone.
    expect(failing.qc.getQueryData(["genesis-chat", "pins", C])).toEqual(["old"]);
  });

  it("a muted row offers Show Alerts, which clears the mute", async () => {
    const { client, byId } = await renderWith(row(0, true));
    expect(byId("alerts")).toMatchObject({ label: "Show Alerts", icon: "bell" });
    byId("alerts").onPress();
    await waitFor(() => expect(client.setMySettings).toHaveBeenCalledWith(C, { mutedUntil: null }));
  });

  it("puts every action on the drawn row for the screen reader, and a long press opens the menu", async () => {
    const { client } = await renderWith(row(0));
    const drawn = screen.getByTestId(`chat-inbox-row-${C}`);
    expect(drawn.getAttribute("data-a11y-actions")).toBe("unread,pin,alerts,delete,archive");
    // VoiceOver's Archive runs the action, from the row itself.
    act(() => void drawn.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "archive" })));
    await waitFor(() => expect(client.setMySettings).toHaveBeenCalledWith(C, { archived: true }));
    // A long press opens Messages' layer: the conversation over a glass menu of the row's actions.
    act(() => void fireEvent.contextMenu(drawn));
    await waitFor(() => expect(screen.getByTestId(`chat-inbox-row-${C}-menu`)).toBeTruthy());
    expect(screen.getByTestId(`chat-inbox-row-${C}-preview`)).toBeTruthy();
    // No sheet: the long press is the rowMenu alone.
    expect(screen.queryByTestId("chat-inbox-menu")).toBeNull();
    expect(screen.getAllByRole("menuitem").map((e) => e.getAttribute("data-testid"))).toEqual(["unread", "pin", "alerts", "delete", "archive"].map((id) => `chat-inbox-row-${C}-menu-menu-${id}`));
    // VoiceOver's actions survive the long press, and still run.
    expect(drawn.getAttribute("data-a11y-actions")).toBe("unread,pin,alerts,delete,archive");
    act(() => void drawn.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "pin" })));
    await waitFor(() => expect(client.setMySettings).toHaveBeenCalledWith(C, { pinned: true }));
  });

  it("hands InboxPage the same rows while the screen re-renders with the same conversations, so each row's memo holds", async () => {
    const { rerender } = await renderWith(row(0));
    const before = seen.items;
    rerender();
    expect(seen.items).toBe(before);
  });

  it("keeps its pins and search row when the app gives pageProps.header, with that header among them", async () => {
    const pinned = { ...row(0), conversationId: "33333333-3333-4333-8333-333333333333", title: "Robin", pinned: true };
    await renderWith(row(0), {}, { current: { pageProps: { header: createElement("span", { "data-testid": "own-header" }) } } }, [pinned]);
    expect(screen.getByTestId("own-header")).toBeTruthy();
    expect(screen.getByTestId("chat-inbox-pins")).toBeTruthy();
  });

  it("offers a new rowActions' set at once, without waiting for the inbox to change", async () => {
    const props = { current: { rowActions: (_i: unknown, d: { id: string }[]) => d } as Record<string, unknown> };
    const view = await renderWith(row(0), {}, props);
    expect(seen.items[0]!.swipeActions!.map((a) => a.id)).toContain("pin");
    props.current = { rowActions: (_i: unknown, d: { id: string }[]) => d.filter((a) => a.id !== "pin") };
    view.rerender();
    await waitFor(() => expect(seen.items[0]!.swipeActions!.map((a) => a.id)).not.toContain("pin"));
  });

});
