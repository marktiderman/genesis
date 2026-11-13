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
    await waitFor(() => expect(screen.getByTestId("t-message-2").className).toMatch(/ring-2/));
    // It scrolls the list itself, never its ancestors (an inbox's other panes, the page).
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });

  it("goes to a row by jumpId when its id is the client's, and highlights it", async () => {
    const rows: ThreadMessage[] = [
      { id: "c1", jumpId: "m1", body: "first", mine: false, timestamp: "2026-10-01T09:00:00Z" },
      { id: "c2", jumpId: "m2", body: "second", mine: true, timestamp: "2026-10-01T09:01:00Z" },
    ];
    const onJumpFailed = vi.fn();
    render(<ThreadPage testID="t" messages={rows} composer={composer()} jumpTo="m2" onJumpFailed={onJumpFailed} />);
    await waitFor(() => expect(screen.getByTestId("t-message-c2").className).toMatch(/ring-2/));
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    expect(onJumpFailed).not.toHaveBeenCalled();
  });

  it("follows the bottom again after a jump that moved nothing (a short thread)", async () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer()} jumpTo="2" />);
    await waitFor(() => expect(screen.getByTestId("t-jump-latest")).toBeTruthy());
    // Everything's on screen, so no scroll event says so: the list looks for itself.
    await waitFor(() => expect(screen.queryByTestId("t-jump-latest")).toBeNull(), { timeout: 2000 });
  });

  it("says when a message to go to can't be found", async () => {
    const onJumpFailed = vi.fn();
    render(<ThreadPage testID="t" messages={messages} composer={composer()} jumpTo="gone" onLoadUntil={async () => false} onJumpFailed={onJumpFailed} />);
    await waitFor(() => expect(onJumpFailed).toHaveBeenCalledWith("gone"), { timeout: 2000 });
  });

  describe("a jump that doesn't land", () => {
    const status = () => screen.getAllByRole("status").map((el) => el.textContent).join("");

    it("tells a screen reader itself only when the app didn't take it on", async () => {
      const { unmount } = render(<ThreadPage testID="t" messages={messages} composer={composer()} jumpTo="gone" onLoadUntil={async () => false} labels={{ messageGone: "Not here" }} />);
      await waitFor(() => expect(status()).toContain("Not here"), { timeout: 2000 });
      unmount();
      const onJumpFailed = vi.fn();
      render(<ThreadPage testID="t" messages={messages} composer={composer()} jumpTo="gone" onLoadUntil={async () => false} onJumpFailed={onJumpFailed} labels={{ messageGone: "Not here" }} />);
      await waitFor(() => expect(onJumpFailed).toHaveBeenCalled(), { timeout: 2000 });
      await act(async () => void (await new Promise((r) => setTimeout(r, 100))));
      expect(status()).not.toContain("Not here");
    });

    it("leaves the reader where they are", async () => {
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => 2000);
      vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => 500);
      const onJumpFailed = vi.fn();
      const { rerender } = render(<ThreadPage testID="t" messages={messages} composer={composer()} onLoadUntil={async () => false} onJumpFailed={onJumpFailed} />);
      const log = screen.getByRole("log");
      log.scrollTop = 300;
      fireEvent.scroll(log);
      rerender(<ThreadPage testID="t" messages={messages} composer={composer()} jumpTo="gone" onLoadUntil={async () => false} onJumpFailed={onJumpFailed} />);
      await waitFor(() => expect(onJumpFailed).toHaveBeenCalled(), { timeout: 2000 });
      expect(log.scrollTop).toBe(300);
      expect(screen.getByTestId("t-jump-latest")).toBeTruthy();
    });
  });

  describe("the reader during a jump", () => {
    it.each([
      ["a wheel", (log: HTMLElement) => fireEvent.wheel(log)],
      ["a touch", (log: HTMLElement) => fireEvent.touchMove(log)],
      ["a key", (log: HTMLElement) => fireEvent.keyDown(log, { key: "PageUp" })],
      ["the scrollbar", (log: HTMLElement) => fireEvent.pointerDown(log)],
    ])("%s drops a jump still loading: the row arriving doesn't move the list", async (_name, move) => {
      let resolve: (v: boolean) => void = () => undefined;
      const onLoadUntil = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
      const onJumpFailed = vi.fn();
      const older = { id: "old", body: "older", mine: false, timestamp: "2026-10-01T08:00:00Z" };
      const { rerender } = render(<ThreadPage testID="t" messages={messages} composer={composer()} jumpTo="old" onLoadUntil={onLoadUntil} onJumpFailed={onJumpFailed} />);
      await waitFor(() => expect(onLoadUntil).toHaveBeenCalled());
      move(screen.getByRole("log"));
      await act(async () => resolve(true));
      vi.mocked(Element.prototype.scrollTo).mockClear();
      rerender(<ThreadPage testID="t" messages={[older, ...messages]} composer={composer()} jumpTo="old" onLoadUntil={onLoadUntil} onJumpFailed={onJumpFailed} />);
      await act(async () => void (await new Promise((r) => setTimeout(r, 600))));
      expect(Element.prototype.scrollTo).not.toHaveBeenCalled();
      expect(screen.getByTestId("t-message-old").className).not.toMatch(/ring-2/);
      expect(onJumpFailed).not.toHaveBeenCalled();
    });

    it("loads earlier pages again once it has dropped the jump", async () => {
      const onLoadEarlier = vi.fn();
      const onLoadUntil = vi.fn(() => new Promise<boolean>(() => undefined));
      render(<ThreadPage testID="t" messages={messages} composer={composer()} hasEarlier onLoadEarlier={onLoadEarlier} jumpTo="old" onLoadUntil={onLoadUntil} />);
      await waitFor(() => expect(onLoadUntil).toHaveBeenCalled());
      const log = screen.getByRole("log");
      log.scrollTop = 0;
      fireEvent.scroll(log);
      expect(onLoadEarlier).not.toHaveBeenCalled();
      fireEvent.wheel(log);
      await act(async () => {});
      fireEvent.scroll(log);
      expect(onLoadEarlier).toHaveBeenCalledTimes(1);
    });

    it("doesn't take focus from a field the reader is typing in", async () => {
      const { rerender } = render(<ThreadPage testID="t" messages={messages} composer={composer()} />);
      const input = screen.getByTestId("t-composer-input");
      input.focus();
      rerender(<ThreadPage testID="t" messages={messages} composer={composer()} jumpTo="2" />);
      await waitFor(() => expect(screen.getByTestId("t-message-2").className).toMatch(/ring-2/));
      expect(document.activeElement).toBe(input);
    });

    it("focuses the row it landed on otherwise", async () => {
      render(<ThreadPage testID="t" messages={messages} composer={composer()} jumpTo="2" />);
      await waitFor(() => expect(screen.getByTestId("t-message-2").className).toMatch(/ring-2/));
      expect(document.activeElement?.getAttribute("data-row-id")).toBe("2");
    });
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

  it("opens another conversation at its newest message, without loading earlier ones", () => {
    let height = 1000;
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => height);
    const onLoadEarlier = vi.fn();
    const { rerender } = render(<ThreadPage testID="t" conversationId="a" messages={messages} composer={composer()} hasEarlier onLoadEarlier={onLoadEarlier} />);
    const log = screen.getByRole("log");
    act(() => {
      log.scrollTop = 300;
      fireEvent.scroll(log);
    });
    onLoadEarlier.mockClear();
    height = 1400;
    const other: ThreadMessage[] = [{ id: "b1", body: "Hello", mine: false, authorName: "Ana", timestamp: "2026-10-24T10:00:00Z" }, { id: "b2", body: "Hi", mine: true, timestamp: "2026-10-24T10:00:00Z" }];
    rerender(<ThreadPage testID="t" conversationId="b" messages={other} composer={composer()} hasEarlier onLoadEarlier={onLoadEarlier} />);
    expect(log.scrollTop).toBe(1400);
    expect(onLoadEarlier).not.toHaveBeenCalled();
  });

  it("opens again at the newest after a loading state", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => 1200);
    const { rerender } = render(<ThreadPage testID="t" conversationId="a" messages={messages} composer={composer()} />);
    rerender(<ThreadPage testID="t" conversationId="b" messages={[]} loading composer={composer()} />);
    rerender(<ThreadPage testID="t" conversationId="b" messages={messages} composer={composer()} />);
    expect(screen.getByRole("log").scrollTop).toBe(1200);
  });

  it("keeps live announcements off the log, and says only someone else's new message", () => {
    const { rerender } = render(<ThreadPage testID="t" messages={messages} composer={composer()} />);
    expect(screen.getByRole("log").getAttribute("aria-live")).toBe("off");
    const announcer = screen.getByTestId("t-messages-announcer");
    expect(announcer.textContent?.replace(/\u200b/g, "")).toBe("");
    rerender(<ThreadPage testID="t" messages={[...messages, { id: "4", body: "Fixed now", mine: false, authorName: "Support", timestamp: "2026-10-24T10:00:00Z" }]} composer={composer()} />);
    expect(announcer.textContent?.replace(/\u200b/g, "")).toBe("Support: Fixed now");
    rerender(<ThreadPage testID="t" messages={[...messages, { id: "4", body: "Fixed now", mine: false, authorName: "Support", timestamp: "2026-10-24T10:00:00Z" }, { id: "5", body: "Thanks", mine: true, timestamp: "2026-10-24T10:00:00Z" }]} composer={composer()} />);
    expect(announcer.textContent?.replace(/\u200b/g, "")).toBe("Support: Fixed now");
  });

  it("says a new message only when it just arrived, and the same words twice", () => {
    const m = (id: string, body: string, mine = false): ThreadMessage => ({ id, body, mine, authorName: "Ana", timestamp: "2026-10-24T10:00:00Z" });
    const { rerender } = render(<ThreadPage testID="t" messages={[m("a", "Hi")]} composer={composer()} />);
    const announcer = screen.getByTestId("t-messages-announcer");
    rerender(<ThreadPage testID="t" messages={[m("a", "Hi"), m("b", "Ok")]} composer={composer()} />);
    const first = announcer.textContent;
    rerender(<ThreadPage testID="t" messages={[m("a", "Hi"), m("b", "Ok"), m("c", "Ok")]} composer={composer()} />);
    expect(announcer.textContent?.replace(/\u200b/g, "")).toBe("Ana: Ok");
    expect(announcer.textContent).not.toBe(first);
    // Discarding the newest uncovers an older row: not said again.
    const before = announcer.textContent;
    rerender(<ThreadPage testID="t" messages={[m("a", "Hi"), m("b", "Ok")]} composer={composer()} />);
    expect(announcer.textContent).toBe(before);
  });

  it("asks for earlier messages again once a page arrives, and in a short thread", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => 2000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => 500);
    const onLoadEarlier = vi.fn();
    const { rerender } = render(<ThreadPage testID="t" messages={messages.slice(1)} composer={composer()} hasEarlier onLoadEarlier={onLoadEarlier} />);
    const log = screen.getByRole("log");
    act(() => {
      log.scrollTop = 50;
      fireEvent.scroll(log);
    });
    expect(onLoadEarlier).toHaveBeenCalledTimes(1);
    // The page arrives without loadingEarlier ever being set.
    rerender(<ThreadPage testID="t" messages={messages} composer={composer()} hasEarlier onLoadEarlier={onLoadEarlier} />);
    act(() => {
      log.scrollTop = 40;
      fireEvent.scroll(log);
    });
    expect(onLoadEarlier).toHaveBeenCalledTimes(2);
  });

  it("loads earlier messages in a thread shorter than the screen", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => 400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => 500);
    const onLoadEarlier = vi.fn();
    render(<ThreadPage testID="t" messages={messages} composer={composer()} hasEarlier onLoadEarlier={onLoadEarlier} />);
    // A browser clamps a short thread's scrollTop to 0 (happy-dom doesn't); the observer, or a scroll, then asks.
    act(() => {
      const log = screen.getByRole("log");
      log.scrollTop = 0;
      fireEvent.scroll(log);
    });
    expect(onLoadEarlier).toHaveBeenCalledTimes(1);
  });

  it("loads earlier messages near the top on scroll, once per page", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => 2000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => 500);
    const onLoadEarlier = vi.fn();
    render(<ThreadPage testID="t" messages={messages} composer={composer()} hasEarlier onLoadEarlier={onLoadEarlier} />);
    const log = screen.getByRole("log");
    act(() => {
      log.scrollTop = 100;
      fireEvent.scroll(log);
      fireEvent.scroll(log);
    });
    expect(onLoadEarlier).toHaveBeenCalledTimes(1);
  });

  it("describes a failed message's retry with its state", () => {
    render(<ThreadPage testID="t" messages={[{ id: "f", body: "Oops", mine: true, status: "failed", onRetry: vi.fn(), timestamp: "2026-10-24T10:00:00Z" }]} composer={composer()} />);
    const retry = screen.getByTestId("t-message-f");
    const described = document.getElementById(retry.getAttribute("aria-describedby")!);
    expect(described?.textContent).toBe("Not sent. Select to retry.");
  });
});

describe("ThreadPage (web): review follow-ups", () => {
  it("makes the log a tab stop, and keeps focus on it when Jump to latest goes away", () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(() => 2000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => 500);
    render(<ThreadPage testID="t" messages={messages} composer={composer()} />);
    const log = screen.getByRole("log");
    expect(log.tabIndex).toBe(0);
    act(() => {
      log.scrollTop = 0;
      fireEvent.scroll(log);
    });
    const pill = screen.getByTestId("t-jump-latest");
    pill.focus();
    fireEvent.click(pill);
    expect(document.activeElement).toBe(log);
  });

  it("renders no times on the server, so hydration in another time zone matches", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(<ThreadPage testID="t" messages={messages} composer={composer()} />);
    expect(html).not.toMatch(/\d{1,2}:\d{2}/);
    const inbox = renderToString(<InboxPage testID="i" items={[{ id: "a", title: "Ada", timestamp: "2026-10-24T09:00:00Z" }]} />);
    expect(inbox).not.toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("ComposerBar", () => {
  it("sends on Enter, adds a line on Shift+Enter, and won't send a blank message", () => {
    const onSend = vi.fn();
    const { rerender } = render(<ComposerBar testID="c" value="  " onChangeText={vi.fn()} onSend={onSend} />);
    expect(screen.getByTestId("c-send").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByTestId("c-send"));
    expect(onSend).not.toHaveBeenCalled();
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
    expect(screen.getByRole("radio", { name: "Internal note" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radiogroup", { name: "Send as" })).toBeTruthy();
    expect(screen.getByLabelText("Internal note", { selector: "textarea" })).toBeTruthy();
    expect(screen.getByTestId("c").getAttribute("data-tone")).toBe("internal");
    fireEvent.click(screen.getByRole("radio", { name: "Reply" }));
    expect(onModeChange).toHaveBeenCalledWith("reply");
  });

  it("spins while sending, keeps focus on send, won't send twice, and announces it", () => {
    const onSend = vi.fn();
    const { rerender } = render(<ComposerBar testID="c" value="Hi" onChangeText={vi.fn()} onSend={onSend} />);
    const send = screen.getByTestId("c-send");
    send.focus();
    expect(screen.getByTestId("c-status").textContent).toBe("");
    rerender(<ComposerBar testID="c" value="Hi" onChangeText={vi.fn()} onSend={onSend} sending />);
    expect(document.activeElement).toBe(send);
    expect(screen.getByTestId("c-sending")).toBeTruthy();
    expect(screen.getByTestId("c-status").textContent).toBe("Sending");
    fireEvent.click(send);
    expect(onSend).not.toHaveBeenCalled();
    rerender(<ComposerBar testID="c" value="" onChangeText={vi.fn()} onSend={onSend} />);
    expect(document.activeElement).toBe(send);
  });

  it("doesn't send on the Enter that confirms an input method (Safari's keyCode 229)", () => {
    const onSend = vi.fn();
    render(<ComposerBar testID="c" value="こんにちは" onChangeText={vi.fn()} onSend={onSend} />);
    fireEvent.keyDown(screen.getByTestId("c-input"), { key: "Enter", keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("adds a line on Enter on a touch screen", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: q === "(pointer: coarse)", media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    const onSend = vi.fn();
    render(<ComposerBar testID="c" value="Hi" onChangeText={vi.fn()} onSend={onSend} />);
    fireEvent.keyDown(screen.getByTestId("c-input"), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("InboxPage (web)", () => {
  it("asks for the next page once per page, and not when there are no more", () => {
    const observers: Array<(e: Array<{ isIntersecting: boolean }>) => void> = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void) {
          observers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    const onEndReached = vi.fn();
    const rows = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
    const { rerender } = render(<InboxPage testID="i" items={rows} onEndReached={() => onEndReached()} />);
    const fire = () => act(() => observers.at(-1)!([{ isIntersecting: true }]));
    fire();
    rerender(<InboxPage testID="i" items={rows} onEndReached={() => onEndReached()} />);
    fire();
    expect(onEndReached).toHaveBeenCalledTimes(1);
    const more = [...rows, { id: "c", title: "C" }];
    rerender(<InboxPage testID="i" items={more} onEndReached={() => onEndReached()} />);
    fire();
    expect(onEndReached).toHaveBeenCalledTimes(2);
    const count = observers.length;
    rerender(<InboxPage testID="i" items={[...more, { id: "d", title: "D" }]} hasMore={false} onEndReached={() => onEndReached()} />);
    expect(observers.length).toBe(count);
    vi.unstubAllGlobals();
  });

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

  it("lets a row shrink to its list, so a long title truncates instead of widening the row", () => {
    render(<InboxPage testID="i" items={items} now={now} />);
    // A flex item's min-width is its content's unless min-w-0 says otherwise (jsdom has no layout).
    expect(screen.getByTestId("i-row-a").className).toMatch(/(^|\s)min-w-0(\s|$)/);
  });

  it("puts a row's actions in a menu", () => {
    render(<InboxPage testID="i" items={items} now={now} />);
    expect(screen.getByRole("button", { name: "More: Cy" })).toBeTruthy();
  });

  it("moves between rows with the arrow keys and j/k, and the tab stop follows", () => {
    render(<InboxPage testID="i" items={items} now={now} />);
    screen.getByTestId("i-row-a").focus();
    fireEvent.keyDown(document.activeElement!, { key: "j" });
    expect(document.activeElement).toBe(screen.getByTestId("i-row-b"));
    expect(screen.getByTestId("i-row-b").tabIndex).toBe(0);
    expect(screen.getByTestId("i-row-a").tabIndex).toBe(-1);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByTestId("i-row-a"));
  });

  it("ignores keys that aren't aimed at a row, and reaches a row's More with Right", () => {
    const withMenu = items.map((i) => ({ ...i, swipeActions: [{ id: "archive", label: "Archive", onPress: vi.fn() }] }));
    render(<InboxPage testID="i" items={withMenu} now={now} />);
    const more = screen.getByTestId("i-row-a-more");
    expect(more.tabIndex).toBe(-1);
    screen.getByTestId("i-row-a").focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(more);
    fireEvent.keyDown(more, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByTestId("i-row-a"));
    // Keys inside an open menu (portaled, but bubbling through React) stay the menu's.
    fireEvent.keyDown(screen.getByTestId("i-row-b"), { key: "x" });
    const item = document.createElement("div");
    item.setAttribute("role", "menuitem");
    screen.getByTestId("i-row-a").closest("li")!.appendChild(item);
    item.tabIndex = -1;
    item.focus();
    fireEvent.keyDown(item, { key: "ArrowDown" });
    expect(document.activeElement).toBe(item);
  });

  it("says an unread count as \"3 unread\"", () => {
    render(<InboxPage testID="i" items={[{ id: "z", title: "Zed", unreadCount: 3 }]} now={now} />);
    expect(screen.getByTestId("i-row-z").textContent).toContain("3 unread");
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

describe("InboxPage (web): Home and End", () => {
  it("go to the first and last rows", () => {
    const items: InboxItem[] = [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }];
    render(<InboxPage testID="i" items={items} />);
    const first = screen.getByTestId("i-row-a");
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect(document.activeElement).toBe(screen.getByTestId("i-row-c"));
    fireEvent.keyDown(screen.getByTestId("i-row-c"), { key: "Home" });
    expect(document.activeElement).toBe(first);
  });
});

describe("ThreadPage (web): files, errors and the modes' name", () => {
  const withFile = (attachment: Partial<NonNullable<ThreadMessage["attachments"]>[number]>): ThreadMessage[] => [
    { id: "1", body: "See attached", mine: false, timestamp: "2026-10-01T09:00:00Z", attachments: [{ id: "f", kind: "file", uri: "https://example.test/a.pdf", name: "a.pdf", ...attachment }] },
  ];

  it("shows a file by name, as a link to it", () => {
    render(<ThreadPage testID="t" messages={withFile({})} composer={null} />);
    const link = screen.getByTestId("t-attachment-f");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("https://example.test/a.pdf");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("a.pdf");
    expect(link.textContent).toContain("example.test");
    expect(link.hasAttribute("download")).toBe(false);
  });

  it("downloads a blob: file under its name, with no host to show", () => {
    render(<ThreadPage testID="t" messages={withFile({ uri: "blob:https://example.test/1" })} composer={null} />);
    const link = screen.getByTestId("t-attachment-f");
    expect(link.getAttribute("download")).toBe("a.pdf");
    expect(link.textContent).toBe("a.pdf");
  });

  it("never links a file to a script, and onPress takes over", () => {
    const onPress = vi.fn();
    const { rerender } = render(<ThreadPage testID="t" messages={withFile({ uri: "javascript:alert(1)" })} composer={null} />);
    expect(screen.getByTestId("t-attachment-f").tagName).toBe("SPAN");
    rerender(<ThreadPage testID="t" messages={withFile({ onPress })} composer={null} />);
    fireEvent.click(screen.getByTestId("t-attachment-f"));
    expect(onPress).toHaveBeenCalled();
  });

  it("still draws an image by default", () => {
    render(<ThreadPage testID="t" messages={[{ id: "1", body: "", mine: false, timestamp: "2026-10-01T09:00:00Z", attachments: [{ id: "i", uri: "https://example.test/a.png" }] }]} composer={null} />);
    expect(screen.getByTestId("t-attachment-i").querySelector("img")).toBeTruthy();
  });

  it("has an error state, with Try again", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ThreadPage testID="t" messages={[]} composer={null} error onRetry={onRetry} />);
    expect(screen.getByTestId("t-error").textContent).toContain("Couldn't load this conversation");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByTestId("t-empty")).toBeNull();
    rerender(<ThreadPage testID="t" messages={[]} composer={null} error errorTitle="Oops" errorBody="Later" />);
    expect(screen.getByTestId("t-error").textContent).toContain("Oops");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows the rows it has even with error", () => {
    render(<ThreadPage testID="t" messages={messages} composer={null} error />);
    expect(screen.queryByTestId("t-error")).toBeNull();
    expect(screen.getByTestId("t-message-1")).toBeTruthy();
  });

  it("names the mode picker from the composer", () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer({ modesLabel: "Envoyer comme", modes: [{ id: "a", label: "A" }, { id: "b", label: "B" }] } as never)} />);
    expect(screen.getByTestId("t-composer-modes").getAttribute("aria-label")).toBe("Envoyer comme");
  });
});

describe("InboxLayout: views when narrow, and the toggle's row", () => {
  const wide = (min: number) =>
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: Number(/(\d+)px/.exec(q)?.[1] ?? 0) <= min, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);

  it("opens the views in a sheet from a button naming the chosen one, and closes on a choice", async () => {
    wide(400);
    const onSelect = vi.fn();
    render(<InboxLayout testID="l" views={<InboxViews views={[{ id: "mine", label: "Mine" }]} onSelect={onSelect} />} activeViewLabel="Mine" list={<p>L</p>} />);
    expect(screen.getByTestId("l-views-open").textContent).toContain("Mine");
    fireEvent.click(screen.getByTestId("l-views-open"));
    const sheet = await screen.findByTestId("l-views-sheet");
    fireEvent.click(sheet.querySelector('[data-testid="inbox-views-mine"]')!);
    expect(onSelect).toHaveBeenCalledWith("mine");
    await waitFor(() => expect(screen.queryByTestId("l-views-sheet")).toBeNull());
  });

  it("keeps the toggle's row for a thread element, at any width", () => {
    wide(800);
    render(<InboxLayout testID="l" list={<p>L</p>} thread={<p>T</p>} context={<p>C</p>} onBack={vi.fn()} threadOpen />);
    const toggle = screen.getByTestId("l-toggle-context");
    expect(toggle.parentElement!.className).toContain("border-b");
    expect(toggle.parentElement!.className).not.toContain("md:hidden");
    expect(toggle.className).toContain("ml-auto");
  });

  it("hides Back from md up by class, so a server-rendered desktop page never shows it", () => {
    wide(400);
    render(<InboxLayout testID="l" list={<p>L</p>} thread={<p>T</p>} onBack={vi.fn()} threadOpen />);
    expect(screen.getByTestId("l-back").className).toContain("md:hidden");
  });

  it("hands the toggle to a thread that places it", () => {
    wide(800);
    render(<InboxLayout testID="l" list={<p>L</p>} context={<p>C</p>} thread={({ contextToggle }) => <header data-testid="mine">{contextToggle}</header>} threadOpen />);
    expect(screen.getByTestId("mine").contains(screen.getByTestId("l-toggle-context"))).toBe(true);
    expect(screen.getAllByTestId("l-toggle-context")).toHaveLength(1);
  });

  it("spends no row from md up when the thread places the toggle, and only Back on a phone", () => {
    wide(400);
    render(<InboxLayout testID="l" list={<p>L</p>} context={<p>C</p>} onBack={vi.fn()} thread={({ contextToggle }) => <header>{contextToggle}</header>} threadOpen />);
    const row = screen.getByTestId("l-back").parentElement!;
    expect(row.className).toContain("md:hidden");
    expect(row.contains(screen.getByTestId("l-toggle-context"))).toBe(false);
  });
});

describe("InboxLayout", () => {
  it("shows the list or the open thread on narrow screens, with Back", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
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

  it("runs the shortcuts only inside the layout, and not while typing or in a dialog", () => {
    const s = { onNext: vi.fn(), onReply: vi.fn(), onNote: vi.fn(), onBack: vi.fn(), onClose: vi.fn() };
    render(
      <>
        <button type="button" data-testid="outside">Sidebar</button>
        <InboxLayout
          list={<button type="button" data-testid="row">Row</button>}
          thread={
            <>
              <textarea data-testid="field" />
              <div role="alertdialog"><button type="button" data-testid="cancel">Cancel</button></div>
            </>
          }
          shortcuts={s}
          threadOpen
        />
      </>,
    );
    const row = screen.getByTestId("row");
    for (const key of ["j", "r", "n", "Escape"]) fireEvent.keyDown(row, { key });
    expect([s.onNext, s.onReply, s.onNote, s.onBack].map((f) => f.mock.calls.length)).toEqual([1, 1, 1, 1]);
    fireEvent.keyDown(screen.getByTestId("field"), { key: "r" });
    fireEvent.keyDown(screen.getByTestId("outside"), { key: "e" });
    fireEvent.keyDown(screen.getByTestId("cancel"), { key: "e" });
    expect(s.onReply).toHaveBeenCalledTimes(1);
    expect(s.onClose).not.toHaveBeenCalled();
  });

  it("renders the same on the server and in the first client render (narrow, default sidebar)", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: true, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    window.localStorage.setItem("inbox:ssr", "0");
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const ui = <InboxLayout testID="l" list={<p>L</p>} thread={<p>T</p>} context={<p>Requester</p>} contextStorageKey="inbox:ssr" />;
    const host = document.createElement("div");
    host.innerHTML = renderToString(ui);
    document.body.appendChild(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(host, ui, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    // After hydration: wide, and the remembered "closed" applies.
    expect(host.querySelector('[data-testid="l-context"]')).toBeNull();
    host.remove();
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

  it("closes the context sheet on Escape without going back, and keeps focus inside it", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    const onBack = vi.fn();
    render(<InboxLayout testID="l" list={<p>L</p>} thread={<p>T</p>} context={<button type="button">Assign</button>} threadOpen shortcuts={{ onBack }} />);
    fireEvent.click(screen.getByTestId("l-toggle-context"));
    const sheet = await screen.findByTestId("l-context-sheet");
    expect(sheet.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Assign")).toBeNull());
    expect(onBack).not.toHaveBeenCalled();
  });
});
