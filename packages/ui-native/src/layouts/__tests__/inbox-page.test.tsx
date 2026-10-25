// @feat:inbox-thread
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert, Platform, StyleSheet } from "react-native";
import { InboxPage, formatInboxTime, getInboxPageStackOptions, type InboxItem } from "../inbox-page";

const NOW = new Date(2026, 9, 24, 15, 0);
const now = () => NOW;

function styleOf(el: Element): Record<string, unknown> {
  return StyleSheet.flatten(JSON.parse((el as HTMLElement).dataset.style ?? "null"));
}

const os = Platform.OS;
afterEach(() => {
  Platform.OS = os;
  vi.mocked(Alert.alert).mockClear();
});

const items: InboxItem[] = [
  { id: "a", title: "Save button does nothing", preview: "Thanks, we're on it.", timestamp: new Date(2026, 9, 24, 9, 41), unreadCount: 2, meta: "In progress", onPress: vi.fn() },
  { id: "b", title: "Dark mode", preview: "You: please", timestamp: new Date(2026, 9, 23, 12, 0), unread: true },
  { id: "c", title: "Old one", timestamp: new Date(2026, 8, 1) },
];

describe("formatInboxTime", () => {
  it("reads as a time today, Yesterday, a weekday this week, then a date", () => {
    expect(formatInboxTime(new Date(2026, 9, 24, 9, 41), NOW)).toMatch(/9:41/);
    expect(formatInboxTime(new Date(2026, 9, 23, 9, 41), NOW)).toBe("Yesterday");
    expect(formatInboxTime(new Date(2026, 9, 20, 9, 41), NOW)).toBe(new Date(2026, 9, 20).toLocaleDateString(undefined, { weekday: "long" }));
    expect(formatInboxTime(new Date(2026, 8, 1), NOW)).not.toMatch(/2026/);
    expect(formatInboxTime(new Date(2025, 8, 1), NOW)).toMatch(/2025/);
  });
});

describe("InboxPage", () => {
  it("shows the empty state, with its action, when there are no items", () => {
    const onEmptyAction = vi.fn();
    render(<InboxPage testID="inbox" items={[]} emptyTitle="No reports" emptyBody="Send one" emptyActionLabel="Send feedback" onEmptyAction={onEmptyAction} />);
    expect(screen.getByTestId("inbox-empty").textContent).toContain("No reports");
    fireEvent.click(screen.getByTestId("inbox-empty-action"));
    expect(onEmptyAction).toHaveBeenCalled();
  });

  it("shows a spinner while the first page loads, and an error (with Try again) when the read failed", () => {
    const onRefresh = vi.fn();
    const { unmount } = render(<InboxPage testID="inbox" items={[]} loading emptyTitle="No reports" />);
    expect(screen.getByTestId("inbox-loading")).toBeTruthy();
    expect(screen.queryByTestId("inbox-empty")).toBeNull();
    unmount();
    render(<InboxPage testID="inbox" items={[]} error errorTitle="Couldn't load" onRefresh={onRefresh} />);
    expect(screen.getByTestId("inbox-error").textContent).toContain("Couldn't load");
    fireEvent.click(screen.getByTestId("inbox-error-action"));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("renders every row with its time, preview and status, newest first as given", () => {
    render(<InboxPage testID="inbox" items={items} now={now} />);
    const rows = ["a", "b", "c"].map((id) => screen.getByTestId(`inbox-row-${id}`));
    expect(rows).toHaveLength(3);
    expect(screen.getByTestId("inbox-row-b-time").textContent).toBe("Yesterday");
    expect(screen.getByTestId("inbox-row-a-meta").textContent).toBe("In progress");
  });

  it("shows unread as a count or a dot, and says it to VoiceOver", () => {
    render(<InboxPage testID="inbox" items={items} now={now} />);
    expect(screen.getByTestId("inbox-row-a-count").textContent).toBe("2");
    expect(screen.getByTestId("inbox-row-a").getAttribute("aria-label")).toMatch(/^2 unread, Save button does nothing/);
    expect(styleOf(screen.getByTestId("inbox-row-b-unread")).borderRadius).toBe(5);
    expect(screen.getByTestId("inbox-row-b").getAttribute("aria-label")).toMatch(/^Unread, Dark mode/);
    expect(styleOf(screen.getByTestId("inbox-row-c-unread")).borderRadius).toBeUndefined();
  });

  it("opens a row on press", () => {
    render(<InboxPage testID="inbox" items={items} now={now} />);
    fireEvent.click(screen.getByTestId("inbox-row-a"));
    expect(items[0]!.onPress).toHaveBeenCalled();
  });

  it("offers swipe actions as accessibility actions and on long press, without a gesture library", () => {
    const remove = vi.fn();
    const markRead = vi.fn();
    render(
      <InboxPage
        testID="inbox"
        now={now}
        items={[{ id: "x", title: "Thread", swipeActions: [{ id: "read", label: "Mark read", onPress: markRead }, { id: "delete", label: "Delete", destructive: true, onPress: remove }] }]}
      />,
    );
    const row = screen.getByTestId("inbox-row-x");
    expect(row.getAttribute("data-a11y-actions")).toBe("read,delete");
    row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "delete" }));
    expect(remove).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(row);
    const [title, , buttons] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect(title).toBe("Thread");
    expect(buttons?.map((b) => [b.text, b.style])).toEqual([["Mark read", "default"], ["Delete", "destructive"], ["Cancel", "cancel"]]);
    buttons?.[0]?.onPress?.();
    expect(markRead).toHaveBeenCalled();
  });

  it("wraps rows with actions in the swipeable slot, and a null slot leaves them bare", () => {
    function Swipe({ actions, children, testID }: { actions: { id: string }[]; children?: ReactNode; testID: string }) {
      return (
        <div data-testid={testID} data-actions={actions.map((a) => a.id).join(",")}>
          {children}
        </div>
      );
    }
    const withActions = [{ id: "x", title: "T", swipeActions: [{ id: "delete", label: "Delete", onPress: () => {} }] }];
    const { unmount } = render(<InboxPage testID="inbox" items={withActions} slots={{ swipeable: Swipe }} />);
    expect(screen.getByTestId("inbox-row-x-swipe").getAttribute("data-actions")).toBe("delete");
    expect(screen.getByTestId("inbox-row-x-swipe").querySelector('[data-testid="inbox-row-x"]')).toBeTruthy();
    unmount();
    render(<InboxPage testID="inbox" items={withActions} slots={{ swipeable: null }} />);
    expect(screen.queryByTestId("inbox-row-x-swipe")).toBeNull();
    expect(screen.getByTestId("inbox-row-x")).toBeTruthy();
  });

  it("on iOS, draws one inset rounded group of cells, like SettingsPage", () => {
    Platform.OS = "ios";
    render(<InboxPage testID="inbox" items={items} now={now} />);
    const first = styleOf(screen.getByTestId("inbox-row-a-cell"));
    const middle = styleOf(screen.getByTestId("inbox-row-b-cell"));
    const last = styleOf(screen.getByTestId("inbox-row-c-cell"));
    expect(first).toMatchObject({ marginHorizontal: 16, borderTopLeftRadius: 10, borderBottomLeftRadius: 0, backgroundColor: { semantic: ["secondarySystemGroupedBackground"] } });
    expect(middle).toMatchObject({ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 });
    expect(last).toMatchObject({ borderTopLeftRadius: 0, borderBottomLeftRadius: 10 });
    expect(screen.queryByTestId("inbox-row-c-separator-line")).toBeNull();
    expect(screen.getByTestId("inbox-row-a-separator-line")).toBeTruthy();
  });

  it("on Android, rows are full width", () => {
    Platform.OS = "android";
    render(<InboxPage testID="inbox" items={items} now={now} />);
    expect(styleOf(screen.getByTestId("inbox-row-a-cell")).marginHorizontal).toBeUndefined();
  });

  it("shows the paging spinner while more load, and the header and section title", () => {
    render(<InboxPage testID="inbox" items={items} now={now} loadingMore header={<span data-testid="filter" />} sectionTitle="Your reports" />);
    expect(screen.getByTestId("inbox-footer")).toBeTruthy();
    expect(screen.getByTestId("filter")).toBeTruthy();
    expect(screen.getByTestId("inbox-section-title").textContent).toBe("Your reports");
  });

  it("composes a large-title header by default", () => {
    expect(getInboxPageStackOptions({ headerTitle: "Help" })).toMatchObject({ title: "Help", headerLargeTitle: true });
  });
});
