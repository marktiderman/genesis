/**
 * genesis-core's `live` option on `useResource` and `useOne`, and
 * ResourcePage's `live` passthrough, driven through a real React tree with
 * fake timers.
 *
 * - subscribes while mounted, unsubscribes on unmount, and only when asked;
 * - a burst of change events causes ONE refetch, through the provider's
 *   normal read (the event payload is never written to the cache);
 * - a pending undoable delete or edit stays applied over that refetch;
 * - `useOne` refetches only for its own record;
 * - a hidden page marks the reads stale instead of refetching.
 */
import { act, render, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LIVE_DEBOUNCE_MS,
  GenesisProvider,
  useOne,
  useResource,
  type DataProvider,
  type ListResult,
  type ResourceChangeEvent,
  type UndoableWrite,
} from "@marktiderman/genesis-core";
import { ResourcePage } from "../../components/data/ResourcePage";

type Row = { id: string; title: string };

function setup(rows: Row[] = [
  { id: "t1", title: "Write" },
  { id: "t2", title: "Read" },
]) {
  const listeners: { resource: string; params: unknown; cb: (e: ResourceChangeEvent) => void }[] = [];
  const unsubscribe = vi.fn();
  let serverRows = rows;
  const provider: DataProvider = {
    getList: vi.fn(async () => ({ data: serverRows, total: serverRows.length })),
    getOne: vi.fn(async (_r, { id }) => ({ data: serverRows.find((r) => r.id === id) ?? { id, title: "?" } })) as DataProvider["getOne"],
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async (_r, { data }) => ({ data: { id: "new", ...(data as object) } })) as DataProvider["create"],
    update: vi.fn(async (_r, { id, data }) => ({ data: { id, ...(data as object) } })) as DataProvider["update"],
    deleteOne: vi.fn(async (_r, { id }) => ({ data: { id } })),
    subscribe: vi.fn((resource, params, cb) => {
      const entry = { resource, params, cb };
      listeners.push(entry);
      return () => {
        unsubscribe(resource);
        listeners.splice(listeners.indexOf(entry), 1);
      };
    }),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
  const emit = (event: ResourceChangeEvent) => {
    for (const l of [...listeners]) l.cb(event);
  };
  const setServerRows = (next: Row[]) => {
    serverRows = next;
  };
  return { provider, queryClient, wrapper, emit, listeners, unsubscribe, setServerRows };
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(async () => {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useResource — live", () => {
  it("does not subscribe unless asked", async () => {
    const { provider, wrapper } = setup();
    renderHook(() => useResource<Row>("tasks"), { wrapper });
    await flush();
    expect(provider.subscribe).not.toHaveBeenCalled();
  });

  it("subscribes while mounted and unsubscribes on unmount", async () => {
    const { provider, wrapper, unsubscribe, listeners } = setup();
    const { unmount } = renderHook(() => useResource<Row>("tasks", { live: true }), { wrapper });
    await flush();
    expect(provider.subscribe).toHaveBeenCalledTimes(1);
    expect(vi.mocked(provider.subscribe!).mock.calls[0]![0]).toBe("tasks");
    unmount();
    expect(unsubscribe).toHaveBeenCalledWith("tasks");
    expect(listeners).toHaveLength(0);
  });

  it("refetches once per burst of events, through the provider's read", async () => {
    const { provider, wrapper, emit, setServerRows } = setup();
    const { result } = renderHook(() => useResource<Row>("tasks", { live: true }), { wrapper });
    await flush();
    expect(provider.getList).toHaveBeenCalledTimes(1);

    setServerRows([{ id: "t1", title: "Changed elsewhere" }, { id: "t2", title: "Read" }]);
    act(() => {
      // The payload is a hint: a bogus record here must never reach the cache.
      emit({ type: "updated", id: "t1", record: { id: "t1", title: "FROM PAYLOAD" } });
      emit({ type: "updated", id: "t2" });
      emit({ type: "created", id: "t3" });
    });
    await flush(DEFAULT_LIVE_DEBOUNCE_MS - 10);
    expect(provider.getList).toHaveBeenCalledTimes(1);
    await flush(20);
    expect(provider.getList).toHaveBeenCalledTimes(2);
    expect(result.current.list.data!.data[0]!.title).toBe("Changed elsewhere");
  });

  it("honours a custom debounce", async () => {
    const { provider, wrapper, emit } = setup();
    renderHook(() => useResource<Row>("tasks", { live: { debounceMs: 1000 } }), { wrapper });
    await flush();
    act(() => emit({ type: "changed" }));
    await flush(500);
    expect(provider.getList).toHaveBeenCalledTimes(1);
    await flush(600);
    expect(provider.getList).toHaveBeenCalledTimes(2);
  });

  it("still refetches during a steady stream of events", async () => {
    const { provider, wrapper, emit } = setup();
    renderHook(() => useResource<Row>("tasks", { live: { debounceMs: 100 } }), { wrapper });
    await flush();
    // An event every 50 ms never goes quiet for 100 ms; the cap is 400 ms.
    for (let i = 0; i < 10; i++) {
      act(() => emit({ type: "updated", id: "t1" }));
      await flush(50);
    }
    expect(vi.mocked(provider.getList).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a pending undoable delete and edit applied over the live refetch", async () => {
    const { provider, queryClient, wrapper, emit } = setup();
    const undos: UndoableWrite[] = [];
    const { result } = renderHook(
      () =>
        useResource<Row>("tasks", {
          live: true,
          mutationMode: "undoable",
          undoDelayMs: 10_000,
          onUndoable: (w) => undos.push(w),
        }),
      { wrapper },
    );
    await flush();
    await act(async () => {
      await result.current.remove("t1");
      await result.current.update("t2", { title: "Edited" });
    });
    const rows = () =>
      (queryClient.getQueriesData<ListResult<Row>>({ queryKey: ["tasks", "list"] })[0]![1]!).data;
    expect(rows()).toEqual([{ id: "t2", title: "Edited" }]);

    // Someone else's change arrives while both writes wait for their undo.
    act(() => emit({ type: "updated", id: "t2" }));
    await flush(DEFAULT_LIVE_DEBOUNCE_MS + 10);
    expect(provider.getList).toHaveBeenCalledTimes(2);
    // The server still has both rows as they were; the patches win.
    expect(rows()).toEqual([{ id: "t2", title: "Edited" }]);
    expect(provider.deleteOne).not.toHaveBeenCalled();
    expect(provider.update).not.toHaveBeenCalled();

    // Undo still puts the row back.
    await act(async () => {
      await undos[0]!.undo();
    });
    await flush();
    expect(rows().map((r) => r.id)).toEqual(["t1", "t2"]);
  });

  it("only marks the reads stale while the page is hidden", async () => {
    const { provider, queryClient, wrapper, emit } = setup();
    renderHook(() => useResource<Row>("tasks", { live: true }), { wrapper });
    await flush();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => emit({ type: "changed" }));
    await flush(DEFAULT_LIVE_DEBOUNCE_MS + 10);
    expect(provider.getList).toHaveBeenCalledTimes(1);
    const query = queryClient.getQueryCache().findAll({ queryKey: ["tasks", "list"] })[0]!;
    expect(query.state.isInvalidated).toBe(true);
    visibility.mockRestore();
  });

  it("does nothing (and does not throw) with a provider that has no subscribe", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { provider, queryClient } = setup();
    delete (provider as Partial<DataProvider>).subscribe;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <GenesisProvider provider={provider} queryClient={queryClient}>
        {children}
      </GenesisProvider>
    );
    const { result } = renderHook(() => useResource<Row>("tasks", { live: true }), { wrapper });
    await flush();
    expect(result.current.list.data!.data).toHaveLength(2);
  });
});

describe("useOne — live", () => {
  it("refetches only for its own record (or a `changed`)", async () => {
    const { provider, wrapper, emit } = setup();
    renderHook(() => useOne<Row>("tasks", "t1", { live: true }), { wrapper });
    await flush();
    expect(vi.mocked(provider.subscribe!).mock.calls[0]![1]).toEqual({ id: "t1" });
    expect(provider.getOne).toHaveBeenCalledTimes(1);

    act(() => emit({ type: "updated", id: "t2" }));
    await flush(DEFAULT_LIVE_DEBOUNCE_MS + 10);
    expect(provider.getOne).toHaveBeenCalledTimes(1);

    act(() => emit({ type: "updated", id: "t1" }));
    await flush(DEFAULT_LIVE_DEBOUNCE_MS + 10);
    expect(provider.getOne).toHaveBeenCalledTimes(2);

    act(() => emit({ type: "changed" }));
    await flush(DEFAULT_LIVE_DEBOUNCE_MS + 10);
    expect(provider.getOne).toHaveBeenCalledTimes(3);
  });
});

describe("ResourcePage — live", () => {
  it("passes `live` through to the resource's list", async () => {
    localStorage.clear();
    const { provider, queryClient, emit } = setup();
    render(
      <GenesisProvider provider={provider} queryClient={queryClient}>
        <ResourcePage<Row> resource="tasks" title="Tasks" columns={["title"]} detail="none" live />
      </GenesisProvider>,
    );
    await flush();
    expect(provider.subscribe).toHaveBeenCalledWith("tasks", expect.anything(), expect.any(Function));
    const before = vi.mocked(provider.getList).mock.calls.length;
    act(() => emit({ type: "created", id: "t3" }));
    await flush(DEFAULT_LIVE_DEBOUNCE_MS + 10);
    expect(vi.mocked(provider.getList).mock.calls.length).toBe(before + 1);
  });

  it("does not subscribe without it", async () => {
    localStorage.clear();
    const { provider, queryClient } = setup();
    render(
      <GenesisProvider provider={provider} queryClient={queryClient}>
        <ResourcePage<Row> resource="tasks" title="Tasks" columns={["title"]} detail="none" />
      </GenesisProvider>,
    );
    await flush();
    expect(provider.subscribe).not.toHaveBeenCalled();
  });
});
