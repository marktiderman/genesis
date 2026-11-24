// @feat:inbox-thread
import { memo, useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Text } from "react-native";
import { InboxPage, type InboxItem, type InboxPageSlotMap } from "../inbox-page";

const NOW = new Date(2026, 9, 24, 15, 0);
const now = () => NOW;
const items: InboxItem[] = [
  { id: "a", title: "Sam", timestamp: new Date(2026, 9, 24, 9, 41) },
  { id: "b", title: "Tia", timestamp: new Date(2026, 9, 23, 12, 0) },
];

describe("InboxPage rows", () => {
  it("keeps each row's props equal while the page re-renders with the same items, so a memoized row doesn't redraw", () => {
    const renders: Record<string, number> = {};
    const Row = memo(function Row(row: InboxPageSlotMap["row"]) {
      renders[row.id] = (renders[row.id] ?? 0) + 1;
      return <Text testID={row.testID}>{row.title}</Text>;
    });
    const slots = { row: Row };
    let bump: () => void = () => undefined;
    function Screen() {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      return <InboxPage testID="inbox" items={items} now={now} slots={slots} header={<Text>{String(n)}</Text>} />;
    }
    render(<Screen />);
    expect(screen.getByTestId("inbox-row-a").textContent).toBe("Sam");
    const before = { ...renders };
    act(() => bump());
    act(() => bump());
    expect(renders).toEqual(before);
  });

  it("turns its time labels over when the clock passes midnight, on the next render", () => {
    let clock = new Date(2026, 9, 24, 23, 59);
    // One function for every render, as an app's clock is: only the minute key can turn the labels over.
    const nowFn = () => clock;
    const at = [{ id: "a", title: "Sam", timestamp: new Date(2026, 9, 24, 9, 41) }];
    let bump: () => void = () => undefined;
    function Screen() {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      return <InboxPage testID="inbox" items={at} now={nowFn} header={<Text>{String(n)}</Text>} />;
    }
    render(<Screen />);
    expect(screen.getByTestId("inbox-row-a-time").textContent).toMatch(/9:41/);
    clock = new Date(2026, 9, 25, 0, 1);
    act(() => bump());
    expect(screen.getByTestId("inbox-row-a-time").textContent).toBe("Yesterday");
  });

  it("gives a formatter of the app's own the exact clock, every render (the default reads only minutes)", () => {
    let clock = new Date(2026, 9, 24, 12, 0, 45);
    const nowFn = () => clock;
    const seconds = (date: Date, now: Date) => `${Math.round((now.getTime() - date.getTime()) / 1000)}s ago`;
    const at = [{ id: "a", title: "Sam", timestamp: new Date(2026, 9, 24, 12, 0, 30) }];
    let bump: () => void = () => undefined;
    function Screen() {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      return <InboxPage testID="inbox" items={at} now={nowFn} formatTime={seconds} header={<Text>{String(n)}</Text>} />;
    }
    render(<Screen />);
    expect(screen.getByTestId("inbox-row-a-time").textContent).toBe("15s ago");
    clock = new Date(2026, 9, 24, 12, 0, 55);
    act(() => bump());
    expect(screen.getByTestId("inbox-row-a-time").textContent).toBe("25s ago");
  });
});
