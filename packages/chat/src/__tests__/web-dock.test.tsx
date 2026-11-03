/**
 * @vitest-environment happy-dom
 * @feat:chat-dock
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatProvider } from "../react";
import {
  ChatDock,
  ChatDockProvider,
  chatDockReducer,
  createMemoryChatClient,
  emptyChatDock,
  useChatDock,
  type ChatDockApi,
  type ChatDockItem,
  type MemoryConversationSeed,
} from "../web";

afterEach(cleanup);
configure({ asyncUtilTimeout: 4000 });

const ME = "00000000-0000-4000-8000-0000000000a1";
const SAM = "00000000-0000-4000-8000-0000000000b2";
const LEE = "00000000-0000-4000-8000-0000000000c3";
const names: Record<string, string> = { [ME]: "Me", [SAM]: "Sam", [LEE]: "Lee" };
const resolveUser = (id: string) => ({ name: names[id] ?? "Someone" });
const at = (min: number) => new Date(Date.now() - (60 - min) * 60_000).toISOString();

const conv = (id: string, title: string, over: Partial<MemoryConversationSeed> = {}): MemoryConversationSeed => ({
  id,
  title,
  members: [{ userId: ME }, { userId: SAM }, { userId: LEE }],
  messages: [{ id: `${id}-m1`, senderId: SAM, body: `Hello from ${title}`, createdAt: at(1) }],
  ...over,
});

const conversation = (id: string): ChatDockItem => ({ type: "conversation", id, conversationId: id, minimized: false });

function setWidth(width: number) {
  (window as unknown as { happyDOM: { setViewport: (v: { width: number; height: number }) => void } }).happyDOM.setViewport({ width, height: 900 });
}

let dock: ChatDockApi;
function Grab() {
  dock = useChatDock();
  return null;
}

function mount(opts: { onExpand?: (item: ChatDockItem) => void; storageKey?: string; children?: ReactNode } = {}) {
  const client = createMemoryChatClient({
    me: ME,
    conversations: [conv("c1", "Morning crew"), conv("c2", "Book club"), conv("c3", "Climbing"), conv("c4", "Parents")],
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ChatProvider client={client} userId={ME}>
        <ChatDockProvider {...(opts.onExpand ? { onExpand: opts.onExpand } : {})} {...(opts.storageKey ? { storageKey: opts.storageKey } : {})}>
          <Grab />
          {opts.children}
          <ChatDock resolveUser={resolveUser} />
        </ChatDockProvider>
      </ChatProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe("chatDockReducer", () => {
  it("opens first, brings an open one back to the front un-minimized, and drops the oldest past max", () => {
    let s = emptyChatDock;
    for (const id of ["a", "b", "c"]) s = chatDockReducer(s, { type: "open", item: conversation(id) });
    expect(s.items.map((i) => i.id)).toEqual(["c", "b", "a"]);
    s = chatDockReducer(s, { type: "minimize", id: "a", minimized: true });
    s = chatDockReducer(s, { type: "open", item: conversation("a") });
    expect(s.items.map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(s.items[0]!.minimized).toBe(false);
    s = chatDockReducer(s, { type: "open", item: conversation("d") });
    expect(s.items.map((i) => i.id)).toEqual(["d", "a", "c"]);
    expect(s.activeId).toBe("d");
  });

  it("closing the active one makes the next active, and closing the last closes the sheet", () => {
    let s = chatDockReducer(emptyChatDock, { type: "open", item: conversation("a") });
    s = chatDockReducer(s, { type: "open", item: conversation("b") });
    s = chatDockReducer(s, { type: "close", id: "b" });
    expect(s.activeId).toBe("a");
    expect(s.sheetOpen).toBe(true);
    s = chatDockReducer(s, { type: "close", id: "a" });
    expect(s).toEqual({ items: [], activeId: null, sheetOpen: false });
  });

  it("keeps the same state object for no-op actions", () => {
    const s = chatDockReducer(emptyChatDock, { type: "open", item: conversation("a") });
    expect(chatDockReducer(s, { type: "close", id: "zzz" })).toBe(s);
    expect(chatDockReducer(s, { type: "minimize", id: "a", minimized: false })).toBe(s);
    expect(chatDockReducer(emptyChatDock, { type: "sheet", open: true })).toBe(emptyChatDock);
  });

  it("honours a max of 1", () => {
    let s = chatDockReducer(emptyChatDock, { type: "open", item: conversation("a") }, 1);
    s = chatDockReducer(s, { type: "open", item: conversation("b") }, 1);
    expect(s.items.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("ChatDock on a wide screen", () => {
  beforeEach(() => setWidth(1280));

  it("draws nothing until something opens", () => {
    mount();
    expect(screen.queryByTestId("genesis-chat-dock")).toBeNull();
  });

  it("opens a conversation in a window with the thread's own title, messages and composer", async () => {
    mount();
    act(() => dock.open("c1"));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    expect(await within(win).findByText("Hello from Morning crew")).toBeTruthy();
    expect(within(win).getAllByText("Morning crew").length).toBeGreaterThan(0);
    expect(within(win).getByRole("textbox")).toBeTruthy();
    // One header: the dock's bar fills the thread's header slot.
    expect(within(win).queryByTestId("genesis-chat-thread-header")).toBeNull();
    expect(within(win).getAllByTestId("genesis-chat-dock-titlebar")).toHaveLength(1);
  });

  it("holds three windows, newest on the right edge, and a fourth replaces the one used longest ago", async () => {
    mount();
    act(() => {
      dock.open("c1");
      dock.open("c2");
      dock.open("c3");
    });
    await waitFor(() => expect(screen.getAllByTestId("genesis-chat-dock-window")).toHaveLength(3));
    act(() => dock.open("c4"));
    await waitFor(() => expect(screen.getByRole("region", { name: "Parents" })).toBeTruthy());
    const wins = screen.getAllByTestId("genesis-chat-dock-window");
    expect(wins).toHaveLength(3);
    expect(screen.queryByRole("region", { name: "Morning crew" })).toBeNull();
  });

  it("minimizes to a bar without the thread (so it isn't marked read), and opens again", async () => {
    mount();
    act(() => dock.open("c1"));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    await within(win).findByText("Hello from Morning crew");
    fireEvent.click(within(win).getByTestId("genesis-chat-dock-toggle"));
    await waitFor(() => expect(win.getAttribute("data-minimized")).toBe("true"));
    expect(within(win).queryByRole("textbox")).toBeNull();
    const toggle = within(win).getByTestId("genesis-chat-dock-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(await within(win).findByRole("textbox")).toBeTruthy();
  });

  it("Escape in a window minimizes it", async () => {
    mount();
    act(() => dock.open("c1"));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    const box = await within(win).findByRole("textbox");
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(win.getAttribute("data-minimized")).toBe("true"));
  });

  it("closes a window", async () => {
    mount();
    act(() => dock.open("c1"));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    fireEvent.click(within(win).getByTestId("genesis-chat-dock-close"));
    await waitFor(() => expect(screen.queryByTestId("genesis-chat-dock-window")).toBeNull());
  });

  it("expand hands the conversation to the Messages page and takes it out of the dock", async () => {
    const onExpand = vi.fn();
    mount({ onExpand });
    act(() => dock.open("c2"));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    fireEvent.click(within(win).getByTestId("genesis-chat-dock-expand"));
    expect(onExpand).toHaveBeenCalledWith(expect.objectContaining({ type: "conversation", conversationId: "c2" }));
    await waitFor(() => expect(screen.queryByTestId("genesis-chat-dock-window")).toBeNull());
  });

  it("has no expand button without somewhere to expand to", async () => {
    mount();
    act(() => dock.open("c1"));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    expect(within(win).queryByTestId("genesis-chat-dock-expand")).toBeNull();
  });

  it("shows a minimized conversation's unread count on its bar", async () => {
    const client = mount();
    act(() => dock.open("c3", { minimized: true }));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    const label = () => within(win).getByTestId("genesis-chat-dock-toggle").getAttribute("aria-label");
    await waitFor(() => expect(label()).toContain("Climbing, 1 unread"));
    act(() => void client.receive("c3", SAM, "On the wall at six"));
    await waitFor(() => expect(label()).toContain("Climbing, 2 unread"));
    // Still a bar: the new message didn't open it or mark it read.
    expect(win.getAttribute("data-minimized")).toBe("true");
  });

  it("opens a panel of the app's own (the help desk messenger), once per id, with its own expand", async () => {
    mount({ onExpand: vi.fn() });
    const panelExpand = vi.fn();
    act(() => dock.openPanel({ id: "help", title: "Help", render: () => <p>How can we help?</p>, onExpand: panelExpand }));
    act(() => dock.openPanel({ id: "help", title: "Help", render: () => <p>How can we help?</p>, onExpand: panelExpand }));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    expect(screen.getAllByTestId("genesis-chat-dock-window")).toHaveLength(1);
    expect(within(win).getByText("How can we help?")).toBeTruthy();
    fireEvent.click(within(win).getByTestId("genesis-chat-dock-expand"));
    expect(panelExpand).toHaveBeenCalledTimes(1);
  });

  it("keeps the open conversations across a reload, as bars, when given a storageKey", async () => {
    window.localStorage.clear();
    mount({ storageKey: "dock-test" });
    act(() => {
      dock.open("c1");
      dock.openPanel({ id: "help", title: "Help", render: () => null });
    });
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("dock-test") ?? "[]")).toEqual([{ conversationId: "c1" }]));
    cleanup();
    mount({ storageKey: "dock-test" });
    const win = await screen.findByTestId("genesis-chat-dock-window");
    expect(win.getAttribute("data-minimized")).toBe("true");
    expect(dock.items.map((i) => i.id)).toEqual(["c1"]);
  });

  it("ignores storage it can't read", () => {
    window.localStorage.setItem("dock-bad", "{not json");
    mount({ storageKey: "dock-bad" });
    expect(dock.items).toEqual([]);
  });
});

describe("ChatDock on a narrow screen", () => {
  beforeEach(() => setWidth(390));
  afterEach(() => setWidth(1280));

  it("opens in a side sheet, switches between open conversations, and closes to a bubble", async () => {
    mount();
    act(() => {
      dock.open("c1");
      dock.open("c2");
    });
    const sheet = await screen.findByTestId("genesis-chat-dock-sheet");
    expect(await within(sheet).findByText("Hello from Book club")).toBeTruthy();
    const tabs = within(sheet).getByTestId("genesis-chat-dock-switcher");
    fireEvent.click(within(tabs).getByRole("tab", { name: /Morning crew/ }));
    expect(await within(sheet).findByText("Hello from Morning crew")).toBeTruthy();

    act(() => dock.setSheetOpen(false));
    const bubble = await screen.findByTestId("genesis-chat-dock-bubble");
    fireEvent.click(bubble);
    expect(await screen.findByTestId("genesis-chat-dock-sheet")).toBeTruthy();
  });
});
