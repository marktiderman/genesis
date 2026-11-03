// @feat:inbox-thread
import { forwardRef, useImperativeHandle, createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccessibilityInfo } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider } from "../../native-modules";
import { NativeThreadList, threadListMode, threadNearBottom, type NativeThreadListHandle } from "../thread-list";

type Row = { id: string; text: string };
const rows: Row[] = [
  { id: "a", text: "first" },
  { id: "b", text: "second" },
  { id: "c", text: "third" },
];

/** A list module that records its props and the calls made through its ref. */
function recordingList() {
  const calls = { props: [] as Record<string, unknown>[], scrollToIndex: vi.fn(), scrollToEnd: vi.fn(), scrollToOffset: vi.fn() };
  const List = forwardRef<unknown, Record<string, any>>(function List(props, ref) {
    calls.props.push(props);
    useImperativeHandle(ref, () => ({ scrollToIndex: calls.scrollToIndex, scrollToEnd: calls.scrollToEnd, scrollToOffset: calls.scrollToOffset }));
    return (
      <div data-testid={props.testID} role={props.accessibilityRole}>
        {props.ListHeaderComponent}
        {props.data.map((item: Row, index: number) => (
          <div key={props.keyExtractor(item)}>{props.renderItem({ item, index })}</div>
        ))}
      </div>
    );
  });
  return { List, calls };
}

const renderRow = (r: Row) => <span data-testid={`row-${r.id}`}>{r.text}</span>;

afterEach(() => vi.restoreAllMocks());

describe("threadListMode", () => {
  it("uses FlashList's chat mode, and FlatList's held position with following by hand", () => {
    expect(threadListMode(true, false)).toEqual({
      followsByHand: false,
      maintainVisibleContentPosition: { startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2, animateAutoScrollToBottom: true },
    });
    expect(threadListMode(true, true).maintainVisibleContentPosition.animateAutoScrollToBottom).toBe(false);
    expect(threadListMode(false, false)).toEqual({ followsByHand: true, maintainVisibleContentPosition: { minIndexForVisible: 0 } });
  });

  it("counts near the bottom as the bottom", () => {
    expect(threadNearBottom({ contentOffset: { y: 900 }, contentSize: { height: 1500 }, layoutMeasurement: { height: 500 } })).toBe(true);
    expect(threadNearBottom({ contentOffset: { y: 100 }, contentSize: { height: 1500 }, layoutMeasurement: { height: 500 } })).toBe(false);
  });
});

describe("NativeThreadList", () => {
  it("renders oldest first as a list, through the app's FlashList in chat mode, not inverted", () => {
    const { List, calls } = recordingList();
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} getItemType={() => "theirs"} />
      </GenesisModulesProvider>,
    );
    expect(screen.getByTestId("l").getAttribute("role")).toBe("list");
    expect([...screen.getByTestId("l").querySelectorAll('[data-testid^="row-"]')].map((e) => e.textContent)).toEqual(["first", "second", "third"]);
    const props = calls.props.at(-1)!;
    expect(props.inverted).toBeUndefined();
    expect(props.maintainVisibleContentPosition).toMatchObject({ startRenderingFromBottom: true });
    expect(props.keyboardDismissMode).toBe("interactive");
  });

  it("loads earlier rows near the top, and offers the button too", () => {
    const { List, calls } = recordingList();
    const onLoadEarlier = vi.fn();
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} hasEarlier onLoadEarlier={onLoadEarlier} />
      </GenesisModulesProvider>,
    );
    (calls.props.at(-1)!.onStartReached as () => void)();
    expect(onLoadEarlier).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("l-earlier"));
    expect(onLoadEarlier).toHaveBeenCalledTimes(2);
  });

  it("doesn't load earlier rows while they're already loading", () => {
    const { List, calls } = recordingList();
    const onLoadEarlier = vi.fn();
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} hasEarlier loadingEarlier onLoadEarlier={onLoadEarlier} />
      </GenesisModulesProvider>,
    );
    (calls.props.at(-1)!.onStartReached as () => void)();
    expect(onLoadEarlier).not.toHaveBeenCalled();
    expect(screen.getByTestId("l-earlier-loading")).toBeTruthy();
  });

  it("reports leaving and coming back to the bottom", () => {
    const { List, calls } = recordingList();
    const onAtBottomChange = vi.fn();
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} onAtBottomChange={onAtBottomChange} />
      </GenesisModulesProvider>,
    );
    const scroll = calls.props.at(-1)!.onScroll as (e: unknown) => void;
    scroll({ nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 500 } } });
    expect(onAtBottomChange).toHaveBeenLastCalledWith(false);
    scroll({ nativeEvent: { contentOffset: { y: 1500 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 500 } } });
    expect(onAtBottomChange).toHaveBeenLastCalledWith(true);
    expect(onAtBottomChange).toHaveBeenCalledTimes(2);
  });

  it("goes to a row it holds, centred, and says where it landed", async () => {
    const { List, calls } = recordingList();
    const announce = vi.fn();
    (AccessibilityInfo as { announceForAccessibility?: unknown }).announceForAccessibility = announce;
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} jumpTo="b" jumpAnnouncement={(r) => r.text} />
      </GenesisModulesProvider>,
    );
    await waitFor(() => expect(calls.scrollToIndex).toHaveBeenCalledWith(expect.objectContaining({ index: 1, viewPosition: 0.5 })));
    expect(announce).toHaveBeenCalledWith("second");
  });

  it("loads until a row it doesn't hold, and says when it can't be found", async () => {
    const { List } = recordingList();
    const onLoadUntil = vi.fn(async () => false);
    const onJumpFailed = vi.fn();
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} jumpTo="gone" onLoadUntil={onLoadUntil} onJumpFailed={onJumpFailed} />
      </GenesisModulesProvider>,
    );
    await waitFor(() => expect(onJumpFailed).toHaveBeenCalledWith("gone"));
    expect(onLoadUntil).toHaveBeenCalledWith("gone");
  });

  it("goes to the newest row through its handle", async () => {
    const { List, calls } = recordingList();
    const ref = createRef<NativeThreadListHandle>();
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList ref={ref} testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} />
      </GenesisModulesProvider>,
    );
    act(() => ref.current!.scrollToEnd({ animated: false }));
    await waitFor(() => expect(calls.scrollToEnd).toHaveBeenCalled());
  });

  it("shows the empty state when there are no rows", () => {
    render(<NativeThreadList testID="l" data={[] as Row[]} keyExtractor={(r) => r.id} renderItem={renderRow} empty={<span data-testid="none" />} />);
    expect(screen.getByTestId("none")).toBeTruthy();
  });
});
