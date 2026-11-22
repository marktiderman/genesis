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
