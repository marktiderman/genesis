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
const failEvery = (calls: ReturnType<typeof recordingList>["calls"]) =>
  calls.scrollToIndex.mockImplementation(({ index }: { index: number }) => (calls.props.at(-1)!.onScrollToIndexFailed as (i: unknown) => void)({ index, averageItemLength: 50 }));

afterEach(() => vi.useRealTimers());

describe("NativeThreadList openAt, after #888's review", () => {
  it("drops a queued opening retry when a newer move to the bottom starts (a send)", async () => {
    vi.useFakeTimers();
    const { List, calls } = recordingList();
    failEvery(calls);
    const ref = createRef<NativeThreadListHandle>();
    render(
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList ref={ref} testID="l" data={rows} keyExtractor={(r) => r.id} renderItem={renderRow} openAt="unread" />
      </GenesisModulesProvider>,
    );
    // The first try (on the next frame) fails and queues a retry 250 ms later.
    await tick(20);
    expect(calls.scrollToIndex).toHaveBeenCalledTimes(1);
    act(() => ref.current!.scrollToEnd({ animated: false }));
    await tick(2000);
    // Neither the queued retry nor the second placement pulls the list back to the unread row.
    expect(calls.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(calls.scrollToEnd).toHaveBeenCalled();
  });

  it("opens at the newest rows when the opening row goes before the list reaches it", async () => {
    vi.useFakeTimers();
    const { List, calls } = recordingList();
    failEvery(calls);
    const onAtBottomChange = vi.fn();
    const view = (data: Row[]) => (
      <GenesisModulesProvider modules={{ list: List as never }}>
        <NativeThreadList testID="l" data={data} keyExtractor={(r) => r.id} renderItem={renderRow} openAt="unread" onAtBottomChange={onAtBottomChange} />
      </GenesisModulesProvider>
    );
    const { rerender } = render(view(rows));
    await tick(20);
    expect(calls.scrollToIndex).toHaveBeenCalledTimes(1);
    // A refresh drops the row (the "New" line once it has been read elsewhere).
    rerender(view(rows.filter((r) => r.id !== "unread")));
    // At the first retry, well before the retries would run out.
    await tick(300);
    expect(calls.scrollToIndex).toHaveBeenCalledTimes(1);
    expect(calls.scrollToEnd).toHaveBeenCalled();
    expect(onAtBottomChange).toHaveBeenLastCalledWith(true);
  });
});
