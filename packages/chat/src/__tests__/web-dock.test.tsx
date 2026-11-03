/**
 * @vitest-environment happy-dom
 * @feat:chat-dock
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatProvider } from "../react";
import {
  ChatDock,
  ChatDockProvider,
  chatDockReducer,
  chatDockWindowsThatFit,
  createMemoryChatClient,
  forgetChatDock,
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
    expect(s).toMatchObject({ items: [], activeId: null, sheetOpen: false, used: {} });
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

  it("updates a docked panel's unread count in place, without moving or opening it", async () => {
    mount();
    act(() => {
      dock.openPanel({ id: "help", title: "Help", render: () => <p>Help home</p>, minimized: true });
      dock.open("c1");
    });
    await waitFor(() => expect(screen.getAllByTestId("genesis-chat-dock-window")).toHaveLength(2));
    act(() => dock.updatePanel("help", { unread: 3 }));
    const help = screen.getByRole("region", { name: "Help" });
    expect(within(help).getByTestId("genesis-chat-dock-toggle").getAttribute("aria-label")).toContain("Help, 3 unread");
    expect(help.getAttribute("data-minimized")).toBe("true");
    expect(dock.items.map((i) => i.id)).toEqual(["c1", "help"]);
    // Not docked: nothing happens.
    act(() => dock.updatePanel("nope", { unread: 1 }));
    expect(dock.items).toHaveLength(2);
  });

  it("keeps the open conversations across a reload, as bars, when given a storageKey", async () => {
    window.localStorage.clear();
    mount({ storageKey: "dock-test" });
    act(() => {
      dock.open("c1");
      dock.openPanel({ id: "help", title: "Help", render: () => null });
    });
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(`dock-test:${ME}`) ?? "[]")).toEqual([{ conversationId: "c1" }]));
    cleanup();
    mount({ storageKey: "dock-test" });
    const win = await screen.findByTestId("genesis-chat-dock-window");
    expect(win.getAttribute("data-minimized")).toBe("true");
    expect(dock.items.map((i) => i.id)).toEqual(["c1"]);
    // Kept per person: someone else signing in on this browser sees none of it.
    expect(window.localStorage.getItem("dock-test")).toBeNull();
    forgetChatDock("dock-test", ME);
    expect(window.localStorage.getItem(`dock-test:${ME}`)).toBeNull();
  });

  it("ignores storage it can't read", () => {
    window.localStorage.setItem(`dock-bad:${ME}`, "{not json");
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

describe("the review's fixes (#655)", () => {
  beforeEach(() => setWidth(1280));

  it("keeps what you were typing when a window is minimized, restored, or Escaped", async () => {
    mount();
    act(() => dock.open("c1"));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    const box = (await within(win).findByRole("textbox")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "half a thought" } });
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(win.getAttribute("data-minimized")).toBe("true"));
    fireEvent.click(within(win).getByTestId("genesis-chat-dock-toggle"));
    await waitFor(() => expect((within(win).getByRole("textbox") as HTMLTextAreaElement).value).toBe("half a thought"));
  });

  it("doesn't minimize on Escape while an input method is composing", async () => {
    mount();
    act(() => dock.open("c1"));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    const box = await within(win).findByRole("textbox");
    fireEvent.keyDown(box, { key: "Escape", isComposing: true });
    fireEvent.keyDown(box, { key: "Escape", keyCode: 229 });
    expect(win.getAttribute("data-minimized")).toBeNull();
  });

  it("focuses the composer on open, and the window's bar when Escape minimizes it", async () => {
    mount();
    act(() => dock.open("c1"));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    const box = await within(win).findByRole("textbox");
    await waitFor(() => expect(document.activeElement).toBe(box));
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(within(win).getByTestId("genesis-chat-dock-toggle")));
  });

  it("keeps focus on the bar's toggle when it minimizes and restores", async () => {
    mount();
    act(() => dock.open("c1"));
    const win = await screen.findByTestId("genesis-chat-dock-window");
    await within(win).findByRole("textbox");
    const toggle = within(win).getByTestId("genesis-chat-dock-toggle");
    toggle.focus();
    fireEvent.click(toggle);
    await waitFor(() => expect(win.getAttribute("data-minimized")).toBe("true"));
    expect(within(win).getByTestId("genesis-chat-dock-toggle")).toBe(toggle);
    expect(document.activeElement).toBe(toggle);
  });

  it("returns the same state for an update that changes nothing, or reopening the window in front", () => {
    let s = chatDockReducer(emptyChatDock, { type: "open", item: { type: "panel", id: "help", title: "Help", render: () => null, unread: 2, minimized: false } });
    expect(chatDockReducer(s, { type: "update", id: "help", patch: { unread: 2 } })).toBe(s);
    expect(chatDockReducer(s, { type: "update", id: "help", patch: { unread: 3 } })).not.toBe(s);
    s = chatDockReducer(s, { type: "open", item: conversation("a") });
    expect(chatDockReducer(s, { type: "open", item: conversation("a") })).toBe(s);
    expect(chatDockReducer(s, { type: "activate", id: "a" })).toBe(s);
    expect(chatDockReducer(s, { type: "closeAll" })).not.toBe(s);
    expect(chatDockReducer(emptyChatDock, { type: "closeAll" })).toBe(emptyChatDock);
  });

  it("settles when an effect keeps a panel's unread count live (the README's pattern)", async () => {
    let renders = 0;
    function Live({ unread }: { unread: number }) {
      const d = useChatDock();
      renders++;
      useEffect(() => d.updatePanel("help", { unread }), [d, unread]);
      return null;
    }
    mount({ children: <Live unread={4} /> });
    act(() => dock.openPanel({ id: "help", title: "Help", render: () => null }));
    await waitFor(() => expect(dock.items[0]).toMatchObject({ unread: 4 }));
    const settled = renders;
    await new Promise((r) => setTimeout(r, 50));
    expect(renders).toBe(settled);
  });

  it("replaces the window used longest ago: restoring one counts as using it", () => {
    let s = emptyChatDock;
    for (const id of ["a", "b", "c"]) s = chatDockReducer(s, { type: "open", item: conversation(id) });
    s = chatDockReducer(s, { type: "minimize", id: "a", minimized: true });
    s = chatDockReducer(s, { type: "minimize", id: "a", minimized: false });
    s = chatDockReducer(s, { type: "open", item: conversation("d") });
    expect(s.items.map((i) => i.id).sort()).toEqual(["a", "c", "d"]);
  });

  it("shows as many windows as fit, and the rest behind +N, one of which comes to the front", async () => {
    expect(chatDockWindowsThatFit(1280, 3)).toBe(3);
    expect(chatDockWindowsThatFit(1000, 3)).toBe(2);
    expect(chatDockWindowsThatFit(800, 3)).toBe(1);
    expect(chatDockWindowsThatFit(1000, 1)).toBe(1);
    setWidth(1000);
    mount();
    act(() => {
      dock.open("c1");
      dock.open("c2");
      dock.open("c3");
    });
    await waitFor(() => expect(screen.getAllByTestId("genesis-chat-dock-window")).toHaveLength(2));
    const more = screen.getByTestId("genesis-chat-dock-more");
    expect(more.getAttribute("aria-label")).toBe("1 more conversation");
    act(() => dock.bringToFront("c1"));
    await waitFor(() => expect(screen.getByRole("region", { name: "Morning crew" })).toBeTruthy());
    expect(screen.queryByRole("region", { name: "Book club" })).toBeNull();
  });

  it("drops a conversation brought back from storage that no longer exists", async () => {
    window.localStorage.setItem(`dock-gone:${ME}`, JSON.stringify([{ conversationId: "c1" }, { conversationId: "gone" }]));
    mount({ storageKey: "dock-gone" });
    await waitFor(() => expect(dock.items.map((i) => i.id)).toEqual(["c1"]));
  });

  it("announces the unread total politely", async () => {
    mount();
    act(() => dock.open("c3", { minimized: true }));
    const live = await screen.findByTestId("genesis-chat-dock-announce");
    expect(live.getAttribute("aria-live")).toBe("polite");
    await waitFor(() => expect(live.textContent).toBe("1 unread in your open conversations"));
  });

  it("hydrates server HTML without a mismatch, then brings stored bars back", async () => {
    window.localStorage.setItem(`dock-ssr:${ME}`, JSON.stringify([{ conversationId: "c1" }]));
    const client = createMemoryChatClient({ me: ME, conversations: [conv("c1", "Morning crew")] });
    const tree = () => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ChatProvider client={client} userId={ME}>
          <ChatDockProvider storageKey="dock-ssr">
            <Grab />
            <ChatDock resolveUser={resolveUser} />
          </ChatDockProvider>
        </ChatProvider>
      </QueryClientProvider>
    );
    const html = renderToString(tree());
    expect(html).not.toContain("genesis-chat-dock-window");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(host, tree(), { onRecoverableError: recoverable });
    });
    await waitFor(() => expect(host.querySelector('[data-testid="genesis-chat-dock-window"]')).toBeTruthy());
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors.mock.calls.filter((c) => /hydrat/i.test(String(c[0])))).toEqual([]);
    errors.mockRestore();
    act(() => root!.unmount());
    host.remove();
  });
});

describe("the narrow screen's switcher (#655)", () => {
  beforeEach(() => setWidth(390));
  afterEach(() => setWidth(1280));

  it("switches without reordering, keeps each tab's draft, and moves with the arrow keys", async () => {
    mount();
    act(() => {
      dock.open("c1");
      dock.open("c2");
    });
    const sheet = await screen.findByTestId("genesis-chat-dock-sheet");
    const tabs = within(sheet).getByTestId("genesis-chat-dock-switcher");
    const order = () => within(tabs).getAllByRole("tab").map((t) => t.id);
    const before = order();
    const panel = () => within(sheet).getAllByRole("tabpanel").find((p) => !p.hidden)!;
    const box = (await within(panel()).findByRole("textbox")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "for book club" } });
    fireEvent.click(within(tabs).getByRole("tab", { name: /Morning crew/ }));
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: /Morning crew/ }).getAttribute("aria-selected")).toBe("true"));
    expect(order()).toEqual(before);
    const selected = within(tabs).getByRole("tab", { selected: true });
    expect(selected.getAttribute("tabindex")).toBe("0");
    expect(document.getElementById(selected.getAttribute("aria-controls")!)).toBe(panel());
    fireEvent.keyDown(selected, { key: "ArrowLeft" });
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: /Book club/ }).getAttribute("aria-selected")).toBe("true"));
    expect(((await within(panel()).findByRole("textbox")) as HTMLTextAreaElement).value).toBe("for book club");
  });
});
