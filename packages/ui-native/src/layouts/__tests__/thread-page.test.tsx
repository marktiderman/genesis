// @feat:inbox-thread
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadPage, getThreadPageStackOptions, readReceiptFor, type ThreadMessage } from "../thread-page";
import { GenesisModulesProvider } from "../../native-modules";

const messages: ThreadMessage[] = [
  { id: "1", body: "The save button does nothing", mine: true, timestamp: "2026-10-24T09:00:00Z" },
  { id: "2", body: "Thanks, we're on it.", mine: false, authorName: "Support", timestamp: "2026-10-24T09:05:00Z" },
  { id: "3", body: "It happens on every screen", mine: true, timestamp: "2026-10-24T09:10:00Z", attachments: [{ id: "s", uri: "file:///shot.png", width: 390, height: 844 }] },
];

const composer = (over: Partial<Parameters<typeof ThreadPage>[0]["composer"] & object> = {}) => ({
  value: "",
  onChangeText: vi.fn(),
  onSend: vi.fn(),
  ...over,
});

describe("readReceiptFor", () => {
  it("is my newest message sent before the other side read the thread", () => {
    expect(readReceiptFor(messages, "2026-10-24T09:11:00Z")).toBe("3");
    expect(readReceiptFor(messages, "2026-10-24T09:06:00Z")).toBe("1");
    expect(readReceiptFor(messages, "2026-10-24T08:00:00Z")).toBeNull();
    expect(readReceiptFor(messages, null)).toBeNull();
  });

  it("never marks a message that is still sending or failed", () => {
    const pending: ThreadMessage[] = [...messages, { id: "4", body: "x", mine: true, timestamp: "2026-10-24T09:12:00Z", status: "sending" }];
    expect(readReceiptFor(pending, "2026-10-24T09:20:00Z")).toBe("3");
  });
});

describe("ThreadPage", () => {
  it("renders messages oldest first, theirs with the author's name, and attachments", () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer()} />);
    const list = screen.getByTestId("t-messages");
    const ids = [...list.querySelectorAll('[data-testid^="t-message-"]')].map((el) => el.getAttribute("data-testid")).filter((id) => !id!.endsWith("-time"));
    expect(ids).toEqual(["t-message-1", "t-message-2", "t-message-3"]);
    expect(list.textContent).toContain("Support");
    expect(screen.getByTestId("t-attachment-s")).toBeTruthy();
    expect(screen.getByTestId("t-message-1").getAttribute("aria-label")).toMatch(/^You, The save button does nothing/);
  });

  it("shows the read receipt under my newest read message", () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer()} readAt="2026-10-24T09:11:00Z" readLabel="Seen" />);
    expect(screen.getByTestId("t-read-receipt").textContent).toBe("Seen");
  });

  it("sends from the composer, and won't send a blank message", () => {
    const c = composer({ value: "  " });
    const { rerender } = render(<ThreadPage testID="t" messages={messages} composer={c} />);
    expect((screen.getByTestId("t-composer-send") as HTMLButtonElement).disabled).toBe(true);
    const typed = composer({ value: "More detail" });
    rerender(<ThreadPage testID="t" messages={messages} composer={typed} />);
    fireEvent.change(screen.getByTestId("t-composer-input"), { target: { value: "More detail!" } });
    expect(typed.onChangeText).toHaveBeenCalledWith("More detail!");
    fireEvent.click(screen.getByTestId("t-composer-send"));
    expect(typed.onSend).toHaveBeenCalled();
  });

  it("shows a spinner instead of Send while sending", () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer({ value: "x", sending: true })} />);
    expect(screen.getByTestId("t-composer-sending")).toBeTruthy();
    expect(screen.queryByTestId("t-composer-send")).toBeNull();
  });

  it("is read-only with no composer, and says why", () => {
    render(<ThreadPage testID="t" messages={messages} composer={null} closedNotice="This report is closed." />);
    expect(screen.queryByTestId("t-composer")).toBeNull();
    expect(screen.getByTestId("t-closed").textContent).toBe("This report is closed.");
  });

  it("retries a failed message on tap", () => {
    const onRetry = vi.fn();
    render(<ThreadPage testID="t" messages={[{ id: "f", body: "hi", mine: true, timestamp: "2026-10-24T09:00:00Z", status: "failed", onRetry }]} composer={composer()} />);
    expect(screen.getByTestId("t-message-f-time").textContent).toMatch(/Not sent/);
    fireEvent.click(screen.getByTestId("t-message-f"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("loads earlier messages from the top", () => {
    const onLoadEarlier = vi.fn();
    render(<ThreadPage testID="t" messages={messages} composer={composer()} hasEarlier onLoadEarlier={onLoadEarlier} />);
    fireEvent.click(screen.getByTestId("t-earlier"));
    expect(onLoadEarlier).toHaveBeenCalled();
  });

  it("fills the composer accessory and header slots", () => {
    const Attach = ({ testID }: { testID: string }) => <button data-testid={testID}>Attach</button>;
    render(<ThreadPage testID="t" messages={messages} composer={composer()} header={<span data-testid="about" />} slots={{ composerAccessory: Attach }} />);
    expect(screen.getByTestId("t-composer-accessory")).toBeTruthy();
    expect(screen.getByTestId("about")).toBeTruthy();
  });

  it("shows the empty state for a thread with no messages", () => {
    render(<ThreadPage testID="t" messages={[]} composer={composer()} emptyTitle="Say hello" />);
    expect(screen.getByTestId("t-empty").textContent).toContain("Say hello");
  });

  it("sits in React Native's KeyboardAvoidingView without the keyboard module", () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer()} />);
    const keyboard = screen.getByTestId("t-keyboard");
    expect(keyboard.querySelector('[data-testid="t-composer-input"]')).toBeTruthy();
    expect(keyboard.querySelector('[data-testid="t-messages"]')).toBeTruthy();
  });

  it("follows the keyboard frame by frame with the app's keyboard-controller KeyboardAvoidingView", () => {
    const seen: Record<string, unknown>[] = [];
    const Kav = ({ children, testID, ...rest }: Record<string, unknown> & { children?: ReactNode; testID?: string }) => {
      seen.push(rest);
      return <div data-testid={testID}>{children}</div>;
    };
    render(
      <GenesisModulesProvider modules={{ keyboardAvoidingView: Kav }}>
        <ThreadPage testID="t" messages={messages} composer={composer()} keyboardVerticalOffset={64} />
      </GenesisModulesProvider>,
    );
    expect(seen.at(-1)).toMatchObject({ behavior: "translate-with-padding", automaticOffset: true, keyboardVerticalOffset: 64 });
  });

  it("shows events as centred lines, and keeps them out of the read receipt", () => {
    const withEvent: ThreadMessage[] = [...messages, { id: "e", kind: "event", body: "Sam was assigned", mine: true, timestamp: "2026-10-24T09:20:00Z" }];
    render(<ThreadPage testID="t" messages={withEvent} composer={composer()} readAt="2026-10-24T10:00:00Z" />);
    expect(screen.getByTestId("t-event-e").textContent).toBe("Sam was assigned");
    expect(screen.queryByTestId("t-message-e")).toBeNull();
    expect(readReceiptFor(withEvent, "2026-10-24T10:00:00Z")).toBe("3");
  });

  it("marks the first unread with a divider", () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer()} firstUnreadId="2" labels={{ newMessages: "Unread" }} />);
    expect(screen.getByTestId("t-unread").textContent).toBe("Unread");
  });

  it("says each send state, and discards on request", () => {
    const onDiscard = vi.fn();
    const rows: ThreadMessage[] = [
      { id: "p", body: "a", mine: true, timestamp: "2026-10-24T09:00:00Z", status: "pending" },
      { id: "z", body: "b", mine: true, timestamp: "2026-10-24T09:00:00Z", status: "paused" },
      { id: "c", body: "c", mine: true, timestamp: "2026-10-24T09:00:00Z", status: "conflict", onRetry: vi.fn(), onDiscard },
    ];
    render(<ThreadPage testID="t" messages={rows} composer={composer()} />);
    expect(screen.getByTestId("t-message-p-time").textContent).toBe("Waiting to send");
    expect(screen.getByTestId("t-message-z-time").textContent).toBe("Sign in to send");
    expect(screen.getByTestId("t-message-c-time").textContent).toMatch(/changed elsewhere/);
    fireEvent.click(screen.getByTestId("t-message-c-discard"));
    expect(onDiscard).toHaveBeenCalled();
  });

  it("says it's updating while fresher rows load", () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer()} updating />);
    expect(screen.getByTestId("t-updating").textContent).toBe("Updating…");
  });

  it("tints an internal note, and the composer in its internal mode", () => {
    const rows: ThreadMessage[] = [{ id: "n", body: "Check the logs", mine: true, tone: "internal", timestamp: "2026-10-24T09:00:00Z" }];
    const onModeChange = vi.fn();
    render(
      <ThreadPage
        testID="t"
        messages={rows}
        composer={composer({ modes: [{ id: "reply", label: "Reply" }, { id: "note", label: "Internal note", tone: "internal" }], mode: "note", onModeChange })}
      />,
    );
    expect(screen.getByTestId("t-composer-mode-note").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("t-composer-input").getAttribute("placeholder")).toBe("Internal note");
    fireEvent.click(screen.getByTestId("t-composer-mode-reply"));
    expect(onModeChange).toHaveBeenCalledWith("reply");
  });

  it("says an internal note is one, to VoiceOver", () => {
    const rows: ThreadMessage[] = [{ id: "n", body: "Check the logs", mine: true, tone: "internal", timestamp: "2026-10-24T09:00:00Z" }];
    render(<ThreadPage testID="t" messages={rows} composer={composer()} />);
    expect(screen.getByTestId("t-message-n").getAttribute("aria-label")).toMatch(/^You, Internal note, Check the logs/);
  });

  it("offers Discard only on a message that hasn't gone", () => {
    const onDiscard = vi.fn();
    const rows: ThreadMessage[] = [{ id: "s", body: "sent", mine: true, timestamp: "2026-10-24T09:00:00Z", onDiscard }];
    render(<ThreadPage testID="t" messages={rows} composer={composer()} />);
    expect(screen.queryByTestId("t-message-s-discard")).toBeNull();
  });

  it("doesn't offer Discard while a message is sending (it may already be on the server)", () => {
    const onDiscard = vi.fn();
    const rows: ThreadMessage[] = [
      { id: "a", body: "a", mine: true, timestamp: "2026-10-24T09:00:00Z", status: "sending", onDiscard },
      { id: "b", body: "b", mine: true, timestamp: "2026-10-24T09:01:00Z", status: "pending", onDiscard },
    ];
    render(<ThreadPage testID="t" messages={rows} composer={composer()} />);
    expect(screen.queryByTestId("t-message-a-discard")).toBeNull();
    expect(screen.getByTestId("t-message-b-discard")).toBeTruthy();
  });

  it("warns in development when keyboard-controller is set up but not passed as keyboardAvoidingView", async () => {
    const { KeyboardScrollProvider } = await import("../keyboard");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Scroll = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    render(
      <KeyboardScrollProvider component={Scroll}>
        <ThreadPage testID="t" messages={messages} composer={composer()} />
      </KeyboardScrollProvider>,
    );
    expect(warn.mock.calls.some(([m]) => String(m).includes("keyboardAvoidingView"))).toBe(true);
    warn.mockRestore();
  });

  it("shows a skeleton, not the empty state, while the first page loads", () => {
    render(<ThreadPage testID="t" messages={[]} composer={composer()} loading />);
    expect(screen.getByTestId("t-messages-loading")).toBeTruthy();
    expect(screen.queryByTestId("t-empty")).toBeNull();
  });

  it("pins the header region above the list", () => {
    const Props = ({ testID }: { testID: string }) => <div data-testid={testID}>Open · Sam</div>;
    render(<ThreadPage testID="t" messages={messages} composer={composer()} slots={{ headerRegion: Props }} />);
    const region = screen.getByTestId("t-header-region");
    expect(region.textContent).toBe("Open · Sam");
    expect(screen.getByTestId("t-messages").contains(region)).toBe(false);
    // Outside the keyboard-avoiding view, so it doesn't move with the keyboard.
    expect(screen.getByTestId("t-keyboard").contains(region)).toBe(false);
  });

  it("composes a standard header by default", () => {
    expect(getThreadPageStackOptions({ headerTitle: "Report" })).toEqual({ title: "Report" });
  });
});

describe("ThreadPage's jumpId", () => {
  it("goes to a message by jumpId when its id is the client's: that row, highlighted, and nothing gone", async () => {
    const scrollToIndex = vi.fn();
    const List = forwardRef<unknown, Record<string, any>>(function List(props, ref) {
      useImperativeHandle(ref, () => ({ scrollToIndex, scrollToEnd: vi.fn(), scrollToOffset: vi.fn() }));
      return (
        <div>
          {props.data.map((item: ThreadMessage, index: number) => (
            <div key={props.keyExtractor(item)}>{props.renderItem({ item, index })}</div>
          ))}
        </div>
      );
    });
    const onJumpFailed = vi.fn();
    const Message = ({ id, highlighted }: { id: string; highlighted: boolean }) => <span data-testid={`m-${id}`} data-highlighted={String(highlighted)} />;
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <ThreadPage
          testID="jump"
          messages={[
            { id: "c1", jumpId: "m1", body: "first", mine: false, timestamp: "2026-10-01T09:00:00Z" },
            { id: "c2", jumpId: "m2", body: "second", mine: true, timestamp: "2026-10-01T09:01:00Z" },
          ]}
          composer={null}
          jumpTo="m2"
          onJumpFailed={onJumpFailed}
          slots={{ message: Message as never }}
        />
      </GenesisModulesProvider>,
    );
    await waitFor(() => expect(scrollToIndex).toHaveBeenCalledWith(expect.objectContaining({ index: 1 })));
    await waitFor(() => expect(screen.getByTestId("m-c2").getAttribute("data-highlighted")).toBe("true"));
    expect(screen.getByTestId("m-c1").getAttribute("data-highlighted")).toBe("false");
    expect(onJumpFailed).not.toHaveBeenCalled();
  });
});
