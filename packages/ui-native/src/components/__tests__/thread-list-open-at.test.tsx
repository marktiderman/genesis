// @feat:inbox-thread
import { createRef, forwardRef, useImperativeHandle } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider } from "../../native-modules";
import { NativeThreadList, type NativeThreadListHandle } from "../thread-list";

type Row = { id: string };
const rows: Row[] = [{ id: "a" }, { id: "b" }, { id: "unread" }, { id: "c" }];

function recordingList() {
  const calls = { props: [] as Record<string, unknown>[], scrollToIndex: vi.fn(), scrollToEnd: vi.fn(), scrollToOffset: vi.fn() };
  const List = forwardRef<unknown, Record<string, any>>(function List(props, ref) {
    calls.props.push(props);
    useImperativeHandle(ref, () => ({ scrollToIndex: calls.scrollToIndex, scrollToEnd: calls.scrollToEnd, scrollToOffset: calls.scrollToOffset }));
    return null;
  });
  return { List, calls };
}

const tick = async (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const renderRow = () => null;

afterEach(() => vi.useRealTimers());

describe("NativeThreadList openAt", () => {
  it("opens with the first unread at the top of the screen, once, without highlighting it", async () => {
    vi.useFakeTimers();
    const { List, calls } = recordingList();
    const onAtBottomChange = vi.fn();
    const { rerender } = render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} openAt="unread" onAtBottomChange={onAtBottomChange} />
      </GenesisModulesProvider>,
    );
    await tick(300);
    expect(calls.scrollToIndex).toHaveBeenCalledWith({ index: 2, animated: false, viewPosition: 0 });
    expect(onAtBottomChange).toHaveBeenCalledWith(false);
    const count = calls.scrollToIndex.mock.calls.length;
    // A new message later doesn't send it back there.
    rerender(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={[...rows, { id: "d" }]} keyExtractor={(r) => r.id} renderItem={renderRow} openAt="unread" />
      </GenesisModulesProvider>,
    );
    await tick(300);
    expect(calls.scrollToIndex).toHaveBeenCalledTimes(count);
  });

  it("waits until the first unread is known (undefined), then opens at it", async () => {
    vi.useFakeTimers();
    const { List, calls } = recordingList();
    const view = (openAt: string | null | undefined) => (
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} openAt={openAt} />
      </GenesisModulesProvider>
    );
    const { rerender } = render(view(undefined));
    await tick(300);
    expect(calls.scrollToIndex).not.toHaveBeenCalled();
    rerender(view("unread"));
    await tick(300);
    expect(calls.scrollToIndex).toHaveBeenCalledWith({ index: 2, animated: false, viewPosition: 0 });
  });

  it("doesn't move a list the reader has already scrolled", async () => {
    vi.useFakeTimers();
    const { List, calls } = recordingList();
    const view = (openAt: string | null | undefined) => (
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} openAt={openAt} />
      </GenesisModulesProvider>
    );
    const { rerender } = render(view(undefined));
    act(() => (calls.props.at(-1)!.onScrollBeginDrag as () => void)());
    rerender(view("unread"));
    await tick(300);
    expect(calls.scrollToIndex).not.toHaveBeenCalled();
  });

  it("doesn't move a list the reader scrolled without a drag (VoiceOver, a wheel), but opens past the list's own placement", async () => {
    vi.useFakeTimers();
    const { List, calls } = recordingList();
    const view = (openAt: string | null | undefined) => (
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} openAt={openAt} />
      </GenesisModulesProvider>
    );
    const scroll = (y: number) => (calls.props.at(-1)!.onScroll as (e: unknown) => void)({ nativeEvent: { contentOffset: { y }, contentSize: { height: 3000 }, layoutMeasurement: { height: 600 } } });
    const { rerender } = render(view(undefined));
    // FlashList placing itself at the bottom: not the reader.
    act(() => scroll(2400));
    rerender(view("unread"));
    await tick(300);
    expect(calls.scrollToIndex).toHaveBeenCalled();

    calls.scrollToIndex.mockClear();
    const second = recordingList();
    const view2 = (openAt: string | null | undefined) => (
      <GenesisModulesProvider modules={{ list: second.List as never }}>
        <NativeThreadList testID="m" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} openAt={openAt} />
      </GenesisModulesProvider>
    );
    const r2 = render(view2(undefined));
    // VoiceOver's three-finger scroll up: no drag, but away from the bottom.
    act(() => (second.calls.props.at(-1)!.onScroll as (e: unknown) => void)({ nativeEvent: { contentOffset: { y: 200 }, contentSize: { height: 3000 }, layoutMeasurement: { height: 600 } } }));
    r2.rerender(view2("unread"));
    await tick(300);
    expect(second.calls.scrollToIndex).not.toHaveBeenCalled();
  });

  it("retries a row the list hasn't measured (FlatList), then opens at the newest rather than leave the reader at the top", async () => {
    vi.useFakeTimers();
    const { List, calls } = recordingList();
    // FlatList without getItemLayout can't scroll to a row outside its first window: it reports a failure.
    calls.scrollToIndex.mockImplementation(({ index }: { index: number }) => (calls.props.at(-1)!.onScrollToIndexFailed as (i: unknown) => void)({ index, averageItemLength: 50 }));
    const onAtBottomChange = vi.fn();
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} openAt="unread" onAtBottomChange={onAtBottomChange} />
      </GenesisModulesProvider>,
    );
    await tick(2000);
    // Near it by the estimate, then by id again, three times at most.
    expect(calls.scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
    expect(calls.scrollToIndex.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.scrollToIndex.mock.calls.every(([o]) => o.viewPosition === 0 && o.animated === false)).toBe(true);
    expect(calls.scrollToEnd).toHaveBeenCalled();
    expect(onAtBottomChange).toHaveBeenLastCalledWith(true);
  });

  it("opens an empty thread at the bottom, and its first message doesn't move it", async () => {
    vi.useFakeTimers();
    const { List, calls } = recordingList();
    const view = (data: Row[]) => (
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={data} keyExtractor={(r) => r.id} renderItem={renderRow} openAt={null} empty={null} />
      </GenesisModulesProvider>
    );
    const { rerender } = render(view([]));
    await tick(300);
    rerender(view([{ id: "first" }]));
    await tick(300);
    expect(calls.scrollToIndex).not.toHaveBeenCalled();
  });

  it("waits for the first page, and leaves a jump to jumpTo", async () => {
    vi.useFakeTimers();
    const { List, calls } = recordingList();
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} openAt="unread" jumpTo="a" />
      </GenesisModulesProvider>,
    );
    await tick(300);
    expect(calls.scrollToIndex.mock.calls.every(([o]) => o.viewPosition === 0.5)).toBe(true);
  });
});

describe("NativeThreadList after a send", () => {
  it("scrolls to the end once under FlashList, whose bottom anchoring follows the new row", async () => {
    vi.useFakeTimers();
    const { List, calls } = recordingList();
    const ref = createRef<NativeThreadListHandle>();
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList ref={ref} testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} />
      </GenesisModulesProvider>,
    );
    act(() => ref.current!.scrollToEnd({ animated: true }));
    await tick(400);
    expect(calls.scrollToEnd).toHaveBeenCalledTimes(1);
  });
});
