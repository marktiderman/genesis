// @feat:inbox-thread
import * as React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerBar, InboxLayout, InboxPage, InboxViews, ThreadPage, type InboxItem, type ThreadMessage } from "../messaging";

const messages: ThreadMessage[] = [
  { id: "1", body: "The save button does nothing", mine: true, timestamp: "2026-10-24T09:00:00Z" },
  { id: "2", body: "Thanks, we're on it.", mine: false, authorName: "Support", timestamp: "2026-10-24T09:05:00Z" },
  { id: "e", kind: "event", body: "Sam was assigned", mine: false, timestamp: "2026-10-24T09:06:00Z" },
  { id: "3", body: "It happens on every screen", mine: true, timestamp: "2026-10-24T09:10:00Z" },
];
const composer = (over: Partial<React.ComponentProps<typeof ThreadPage>["composer"] & object> = {}) => ({ value: "", onChangeText: vi.fn(), onSend: vi.fn(), ...over });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn() as never;
});
afterEach(() => vi.restoreAllMocks());

describe("ThreadPage (web)", () => {
  it("renders messages oldest first in a log, events as lines, and the read receipt", () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer()} readAt="2026-10-24T09:30:00Z" readLabel="Seen" />);
    const log = screen.getByRole("log", { name: "Messages" });
    const ids = [...log.querySelectorAll("[data-row-id]")].map((el) => el.getAttribute("data-row-id"));
    expect(ids).toEqual(["1", "2", "e", "3"]);
    expect(screen.getByTestId("t-event-e").textContent).toContain("Sam was assigned");
    expect(screen.getByTestId("t-read-receipt").textContent).toBe("Seen");
  });

  it("says who sent a message, and that an internal note is one", () => {
    render(<ThreadPage testID="t" messages={[{ id: "n", body: "Check the logs", mine: true, tone: "internal", timestamp: "2026-10-24T09:00:00Z" }]} composer={composer()} />);
    expect(screen.getByTestId("t-message-n").textContent).toMatch(/^You, Internal note: Check the logs/);
  });

  it("retries a failed message on click, and offers Discard only while it hasn't gone", () => {
    const onRetry = vi.fn();
    const onDiscard = vi.fn();
    const rows: ThreadMessage[] = [
      { id: "f", body: "hi", mine: true, timestamp: "2026-10-24T09:00:00Z", status: "failed", onRetry, onDiscard },
      { id: "s", body: "ok", mine: true, timestamp: "2026-10-24T09:01:00Z", onDiscard },
    ];
    render(<ThreadPage testID="t" messages={rows} composer={composer()} />);
    fireEvent.click(screen.getByTestId("t-message-f"));
    expect(onRetry).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("t-message-f-discard"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("t-message-s-discard")).toBeNull();
  });

  it("says each send state", () => {
    const rows: ThreadMessage[] = (["pending", "paused", "conflict"] as const).map((status, i) => ({ id: status, body: String(i), mine: true, timestamp: "2026-10-24T09:00:00Z", status }));
    render(<ThreadPage testID="t" messages={rows} composer={composer()} />);
    expect(screen.getByTestId("t-message-pending-time").textContent).toBe("Waiting to send");
    expect(screen.getByTestId("t-message-paused-time").textContent).toBe("Sign in to send");
    expect(screen.getByTestId("t-message-conflict-time").textContent).toMatch(/changed elsewhere/);
  });

  it("marks the first unread, shows loading, updating, and the closed notice", () => {
    const { rerender } = render(<ThreadPage testID="t" messages={messages} composer={composer()} firstUnreadId="3" updating />);
    expect(screen.getByTestId("t-unread").getAttribute("aria-label")).toBe("New messages");
    expect(screen.getByTestId("t-updating").textContent).toBe("Updating…");
    rerender(<ThreadPage testID="t" messages={[]} composer={composer()} loading />);
    expect(screen.getByTestId("t-messages-loading")).toBeTruthy();
    expect(screen.queryByTestId("t-empty")).toBeNull();
    rerender(<ThreadPage testID="t" messages={messages} composer={null} closedNotice="This report is closed." />);
    expect(screen.getByTestId("t-closed").textContent).toBe("This report is closed.");
  });

  it("pins the header region outside the log", () => {
    const Props = ({ testID }: { testID: string }) => <div data-testid={testID}>Open · Sam</div>;
    render(<ThreadPage testID="t" messages={messages} composer={composer()} slots={{ headerRegion: Props }} />);
    expect(screen.getByRole("log").contains(screen.getByTestId("t-header-region"))).toBe(false);
  });

  it("loads earlier messages from the button", () => {
    const onLoadEarlier = vi.fn();
    render(<ThreadPage testID="t" messages={messages} composer={composer()} hasEarlier onLoadEarlier={onLoadEarlier} />);
    fireEvent.click(screen.getByTestId("t-earlier"));
    expect(onLoadEarlier).toHaveBeenCalled();
  });

  it("goes to a message it holds and highlights it", async () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer()} jumpTo="2" />);
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(screen.getByTestId("t-message-2").className).toMatch(/ring-2/);
  });

  it("says when a message to go to can't be found", async () => {
    const onJumpFailed = vi.fn();
    render(<ThreadPage testID="t" messages={messages} composer={composer()} jumpTo="gone" onLoadUntil={async () => false} onJumpFailed={onJumpFailed} />);
    await waitFor(() => expect(onJumpFailed).toHaveBeenCalledWith("gone"), { timeout: 2000 });
  });

  it("keeps the place when earlier messages arrive above", () => {
    let height = 1000;
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => height);
    const { rerender } = render(<ThreadPage testID="t" messages={messages.slice(2)} composer={composer()} />);
    const log = screen.getByRole("log");
    act(() => {
      log.scrollTop = 300;
      fireEvent.scroll(log);
    });
    height = 1600;
    rerender(<ThreadPage testID="t" messages={messages} composer={composer()} />);
    expect(log.scrollTop).toBe(900);
  });
});

describe("ComposerBar", () => {
  it("sends on Enter, adds a line on Shift+Enter, and won't send a blank message", () => {
    const onSend = vi.fn();
    const { rerender } = render(<ComposerBar testID="c" value="  " onChangeText={vi.fn()} onSend={onSend} />);
    expect((screen.getByTestId("c-send") as HTMLButtonElement).disabled).toBe(true);
    rerender(<ComposerBar testID="c" value="Hi" onChangeText={vi.fn()} onSend={onSend} />);
    fireEvent.keyDown(screen.getByTestId("c-input"), { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId("c-input"), { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("sends on Cmd/Ctrl+Enter only, with sendOn mod-enter", () => {
    const onSend = vi.fn();
    render(<ComposerBar testID="c" value="Hi" onChangeText={vi.fn()} onSend={onSend} sendOn="mod-enter" />);
    fireEvent.keyDown(screen.getByTestId("c-input"), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId("c-input"), { key: "Enter", ctrlKey: true });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("shows modes, labels the input with an internal mode, and switches", () => {
    const onModeChange = vi.fn();
    render(
      <ComposerBar
        testID="c"
        value=""
        onChangeText={vi.fn()}
        onSend={vi.fn()}
        modes={[{ id: "reply", label: "Reply" }, { id: "note", label: "Internal note", tone: "internal" }]}
        mode="note"
        onModeChange={onModeChange}
      />,
    );
    expect(screen.getByRole("tab", { name: "Internal note" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Internal note", { selector: "textarea" })).toBeTruthy();
    expect(screen.getByTestId("c").getAttribute("data-tone")).toBe("internal");
    fireEvent.click(screen.getByRole("tab", { name: "Reply" }));
    expect(onModeChange).toHaveBeenCalledWith("reply");
  });

  it("spins while sending, and announces it", () => {
    render(<ComposerBar testID="c" value="Hi" onChangeText={vi.fn()} onSend={vi.fn()} sending />);
    expect(screen.getByRole("status", { name: "Sending" })).toBeTruthy();
    expect(screen.queryByTestId("c-send")).toBeNull();
  });
});

describe("InboxPage (web)", () => {
  const now = () => new Date(2026, 9, 24, 12, 0);
  const items: InboxItem[] = [
    { id: "a", title: "Ada", preview: "See you then", timestamp: new Date(2026, 9, 24, 9, 41), unread: true, onPress: vi.fn() },
    { id: "b", title: "Bo", preview: "Thanks!", timestamp: new Date(2026, 9, 23, 9, 0), unreadCount: 3, selected: true },
    { id: "c", title: "Cy", meta: "Closed", swipeActions: [{ id: "archive", label: "Archive", onPress: vi.fn() }] },
  ];

  it("renders rows with unread, counts, times and the selected one", () => {
    render(<InboxPage testID="i" items={items} now={now} />);
    expect(screen.getByRole("list", { name: "Conversations" })).toBeTruthy();
    expect(screen.getByTestId("i-row-a-unread")).toBeTruthy();
    expect(screen.getByTestId("i-row-b-count").textContent).toBe("3");
    expect(screen.getByTestId("i-row-b").textContent).toContain("Yesterday");
    expect(screen.getByTestId("i-row-b").getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByTestId("i-row-a"));
    expect(items[0]!.onPress).toHaveBeenCalled();
  });

  it("puts a row's actions in a menu", () => {
    render(<InboxPage testID="i" items={items} now={now} />);
    expect(screen.getByRole("button", { name: "More: Cy" })).toBeTruthy();
  });

  it("moves between rows with the arrow keys and j/k", () => {
    render(<InboxPage testID="i" items={items} now={now} />);
    const list = screen.getByRole("list");
    screen.getByTestId("i-row-a").focus();
    fireEvent.keyDown(list, { key: "j" });
    expect(document.activeElement).toBe(screen.getByTestId("i-row-b"));
    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByTestId("i-row-a"));
  });

  it("shows loading, error and empty states", () => {
    const { rerender } = render(<InboxPage testID="i" items={[]} loading />);
    expect(screen.getByTestId("i-loading")).toBeTruthy();
    rerender(<InboxPage testID="i" items={[]} error errorTitle="Offline" />);
    expect(screen.getByTestId("i-empty").textContent).toContain("Offline");
    const onAction = vi.fn();
    rerender(<InboxPage testID="i" items={[]} emptyTitle="No reports" emptyActionLabel="Send feedback" onEmptyAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe("InboxLayout", () => {
  it("shows the list or the open thread on narrow screens, with Back", () => {
    const onBack = vi.fn();
    const { rerender } = render(<InboxLayout testID="l" views={<p>Views</p>} list={<p>List</p>} thread={<p>Thread</p>} context={<p>Ctx</p>} onBack={onBack} />);
    expect(screen.getByTestId("l-list").className).toMatch(/(^|\s)flex(\s|$)/);
    expect(screen.getByTestId("l-thread").className).toMatch(/(^|\s)hidden(\s|$)/);
    rerender(<InboxLayout testID="l" list={<p>List</p>} thread={<p>Thread</p>} threadOpen onBack={onBack} />);
    expect(screen.getByTestId("l-list").className).toMatch(/(^|\s)hidden(\s|$)/);
    fireEvent.click(screen.getByTestId("l-back"));
    expect(onBack).toHaveBeenCalled();
  });

  it("names its regions", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: true, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    render(<InboxLayout testID="l" views={<p>V</p>} list={<p>L</p>} thread={<p>T</p>} context={<p>C</p>} />);
    expect(screen.getByRole("navigation", { name: "Views" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Details" })).toBeTruthy();
  });
});

describe("the 3-pane inbox (help desk)", () => {
  const items: InboxItem[] = [
    { id: "a", title: "Ada", timestamp: new Date(2026, 9, 24, 9, 41) },
    { id: "b", title: "Bo", timestamp: new Date(2026, 9, 24, 9, 0) },
  ];

  it("marks the open conversation from selectedId, and opens one with onSelect", () => {
    const onSelect = vi.fn();
    render(<InboxPage testID="i" items={items} selectedId="b" onSelect={onSelect} />);
    expect(screen.getByTestId("i-row-b").getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByTestId("i-row-a"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("lists views with counts and marks the active one", () => {
    const onSelect = vi.fn();
    render(<InboxViews testID="v" views={[{ id: "mine", label: "Mine", count: 4 }, { id: "all", label: "All open" }]} activeId="mine" onSelect={onSelect} />);
    expect(screen.getByTestId("v-mine").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("v-mine").textContent).toContain("4");
    fireEvent.click(screen.getByTestId("v-all"));
    expect(onSelect).toHaveBeenCalledWith("all");
  });

  it("runs the shortcuts, but not while typing", () => {
    const s = { onNext: vi.fn(), onReply: vi.fn(), onNote: vi.fn(), onBack: vi.fn() };
    render(
      <InboxLayout list={<p>L</p>} thread={<textarea data-testid="field" />} shortcuts={s} threadOpen />,
    );
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: "r" });
    fireEvent.keyDown(document.body, { key: "n" });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect([s.onNext, s.onReply, s.onNote, s.onBack].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1]);
    fireEvent.keyDown(screen.getByTestId("field"), { key: "r" });
    expect(s.onReply).toHaveBeenCalledTimes(1);
  });

  it("puts the context beside the thread when wide, and toggles it, remembering the choice", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: true, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    window.localStorage.removeItem("inbox:ctx");
    render(<InboxLayout testID="l" list={<p>L</p>} thread={<p>T</p>} context={<p>Requester</p>} contextStorageKey="inbox:ctx" />);
    expect(screen.getByTestId("l-context").textContent).toBe("Requester");
    fireEvent.click(screen.getByTestId("l-toggle-context"));
    expect(screen.queryByTestId("l-context")).toBeNull();
    expect(window.localStorage.getItem("inbox:ctx")).toBe("0");
  });

  it("keeps the context in a closed sheet on narrow screens until asked", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    render(<InboxLayout testID="l" list={<p>L</p>} thread={<p>T</p>} context={<p>Requester</p>} threadOpen />);
    expect(screen.queryByText("Requester")).toBeNull();
    fireEvent.click(screen.getByTestId("l-toggle-context"));
    expect(screen.getByText("Requester")).toBeTruthy();
  });
});
