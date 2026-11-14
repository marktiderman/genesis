// @feat:inbox-thread
/**
 * InboxPage's start of the list: a list that keeps a bounded number of pages loads back the ones it
 * dropped from the front when the person scrolls to the top (as NativeResourceView's own list does).
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const seen: Record<string, unknown>[] = [];
vi.mock("react-native", async (original) => {
  const rn = await original<Record<string, unknown>>();
  const Real = rn.FlatList as (props: Record<string, unknown>) => unknown;
  return {
    ...rn,
    FlatList: (props: Record<string, unknown>) => {
      seen.push(props);
      return Real(props);
    },
  };
});

const { InboxPage } = await import("../inbox-page");

describe("InboxPage onStartReached", () => {
  it("hands the list the start-of-list handler and keeps the rows on screen in place", () => {
    const onStartReached = vi.fn();
    render(<InboxPage items={[{ id: "a", title: "One" }]} onStartReached={onStartReached} />);
    const props = seen.at(-1)!;
    expect(props.onStartReached).toBe(onStartReached);
    expect(props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  });

  it("leaves both off without one", () => {
    render(<InboxPage items={[{ id: "a", title: "One" }]} />);
    const props = seen.at(-1)!;
    expect(props.onStartReached).toBeUndefined();
    expect(props.maintainVisibleContentPosition).toBeUndefined();
  });
});
