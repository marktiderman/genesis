// @feat:inbox-thread
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadPage, getThreadPageStackOptions, readReceiptFor, type ThreadMessage } from "../thread-page";
import { KeyboardScrollProvider, type KeyboardScrollProps } from "../keyboard";

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

  it("falls back to a KeyboardAvoidingView without a keyboard scroll view", () => {
    render(<ThreadPage testID="t" messages={messages} composer={composer()} />);
    expect(screen.getByTestId("t-kav")).toBeTruthy();
    expect(screen.queryByTestId("t-keyboard")).toBeNull();
  });

  it("puts the messages and the composer in the app's keyboard scroll view, and scrolls to the newest", () => {
    const scrollToEnd = vi.fn();
    const Scroll = forwardRef<unknown, KeyboardScrollProps & { children?: ReactNode }>(function Scroll({ children, testID }, ref) {
      useImperativeHandle(ref, () => ({ scrollToEnd }));
      return <div data-testid={testID}>{children}</div>;
    });
    render(
      <KeyboardScrollProvider component={Scroll}>
        <ThreadPage testID="t" messages={messages} composer={composer()} />
      </KeyboardScrollProvider>,
    );
    const scroll = screen.getByTestId("t-keyboard");
    expect(scroll.querySelector('[data-testid="t-composer-input"]')).toBeTruthy();
    expect(screen.queryByTestId("t-kav")).toBeNull();
    expect(scrollToEnd).toHaveBeenCalled();
  });

  it("composes a standard header by default", () => {
    expect(getThreadPageStackOptions({ headerTitle: "Report" })).toEqual({ title: "Report" });
  });
});
