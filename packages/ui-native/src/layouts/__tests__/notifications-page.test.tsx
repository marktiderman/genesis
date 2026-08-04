import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  NotificationsPage,
  __test,
  getNotificationsPageStackOptions,
  type NotificationItem,
} from "../notifications-page";

const NOW = new Date("2026-05-04T10:00:00Z");

describe("NotificationsPage groupByDate", () => {
  it("buckets items by Today / Yesterday / Earlier", () => {
    const items: NotificationItem[] = [
      { id: "1", title: "Today A", timestamp: "2026-05-04T08:00:00Z" },
      { id: "2", title: "Yesterday A", timestamp: "2026-05-03T20:00:00Z" },
      { id: "3", title: "Older", timestamp: "2026-05-01T08:00:00Z" },
      { id: "4", title: "Today B", timestamp: "2026-05-04T09:00:00Z" },
    ];
    const sections = __test.groupByDate(items, NOW);
    expect(sections.map((s) => s.title)).toEqual([
      "Today",
      "Yesterday",
      "Earlier",
    ]);
    expect(sections[0].data).toHaveLength(2);
    expect(sections[1].data).toHaveLength(1);
    expect(sections[2].data).toHaveLength(1);
  });

  it("omits empty buckets", () => {
    const items: NotificationItem[] = [
      { id: "1", title: "Today only", timestamp: NOW.toISOString() },
    ];
    const sections = __test.groupByDate(items, NOW);
    expect(sections.map((s) => s.title)).toEqual(["Today"]);
  });
});

describe("NotificationsPage rendering", () => {
  it("renders empty state when no items", () => {
    render(<NotificationsPage testID="notifs" items={[]} />);
    expect(screen.getByTestId("notifs-empty")).toBeTruthy();
  });

  it("renders sectioned list when items present", () => {
    render(
      <NotificationsPage
        testID="notifs"
        items={[
          {
            id: "1",
            title: "Welcome",
            timestamp: NOW.toISOString(),
            unread: true,
          },
        ]}
      />,
    );
    expect(screen.getByTestId("notifs-list")).toBeTruthy();
    expect(screen.getByTestId("notifs-row-1")).toBeTruthy();
  });

  it("uses custom emptyState when provided", () => {
    render(
      <NotificationsPage
        testID="notifs"
        items={[]}
        emptyState={<span data-testid="custom-empty">Custom</span>}
      />,
    );
    expect(screen.getByTestId("custom-empty")).toBeTruthy();
    expect(screen.queryByTestId("notifs-empty")).toBeNull();
  });
});

describe("getNotificationsPageStackOptions", () => {
  it("wires Mark all read button when onMarkAllRead provided", () => {
    const onMarkAllRead = vi.fn();
    const opts = getNotificationsPageStackOptions({ onMarkAllRead });
    expect(typeof opts.headerRight).toBe("function");
    expect(opts.headerLargeTitle).toBe(true);
    expect(opts.title).toBe("Notifications");
  });

  it("respects header right override", () => {
    const customRight = () => null;
    const opts = getNotificationsPageStackOptions({
      onMarkAllRead: () => {},
      headerRight: customRight,
    });
    expect(opts.headerRight).toBe(customRight);
  });
});
