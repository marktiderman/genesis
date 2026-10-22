/**
 * genesis-core's `mutationMode` on `useResource` and `useResourceForm`
 * (pessimistic / optimistic / undoable), driven through a real React tree
 * with fake timers.
 *
 * - optimistic: the cache changes before the provider answers, and is put
 *   back (with the error reported) when the write fails;
 * - undoable: nothing is sent until the delay ends; undo discards the write,
 *   also after the hook unmounted; a provider that serves `undo` gets the
 *   write at once and undoes it by audit id;
 * - writes on one record compose; pending patches survive refetches and new
 *   list keys; page unload sends with keepalive.
 */
import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GenesisProvider,
  DataWriteError,
  pendingWriteCount,
  useResource,
  useResourceForm,
  type DataProvider,
  type ListResult,
  type UndoableWrite,
} from "@marktiderman/genesis-core";

type Row = { id: string; title: string };
const LIST_KEY = ["tasks", "list", { pagination: { page: 1, perPage: 25 } }];
const DETAIL_KEY = ["tasks", "detail", "t1", undefined];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(extra: Partial<DataProvider> = {}) {
  const provider: DataProvider = {
    getList: vi.fn(async () => ({ data: [], total: 0 })),
    getOne: vi.fn(async () => ({ data: { id: "t1", title: "Write" } })),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(async (_r, { data }) => ({ data: { id: "new", ...(data as object) } })) as DataProvider["create"],
    update: vi.fn(async (_r, { id, data }) => ({ data: { id, ...(data as object) } })) as DataProvider["update"],
    deleteOne: vi.fn(async (_r, { id }) => ({ data: { id } })),
    ...extra,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  queryClient.setQueryData<ListResult<Row>>(LIST_KEY, {
    data: [
      { id: "t1", title: "Write" },
      { id: "t2", title: "Read" },
    ],
    total: 2,
  });
  queryClient.setQueryData<Row>(DETAIL_KEY, { id: "t1", title: "Write" });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
  const list = () => queryClient.getQueryData<ListResult<Row>>(LIST_KEY)!;
  const detail = () => queryClient.getQueryData<Row>(DETAIL_KEY);
  return { provider, queryClient, wrapper, list, detail };
}

/** Lets pending promises (and React updates) run. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(async () => {
  // Pending writes outlive their hooks (they belong to the QueryClient's
  // registry): let any still waiting go out, so none leaks into the next test.
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useResource — pessimistic (default)", () => {
  it("leaves the cache alone until the provider answers", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper, list } = setup({ update: vi.fn(() => answer.promise) as DataProvider["update"] });
    const { result } = renderHook(() => useResource<Row>("tasks", { enabled: false }), { wrapper });
    let done = false;
    act(() => {
      void result.current.update("t1", { title: "Edited" }).then(() => {
        done = true;
      });
    });
    await flush();
    expect(list().data[0]!.title).toBe("Write");
    expect(done).toBe(false);
    answer.resolve({ data: { id: "t1", title: "Edited" } });
    await flush();
    expect(done).toBe(true);
  });
});

describe("useResource — optimistic", () => {
  it("patches the list and detail caches before the provider answers", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper, list, detail, provider } = setup({
      update: vi.fn(() => answer.promise) as DataProvider["update"],
    });
    const onUpdateSuccess = vi.fn();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "optimistic", onUpdateSuccess }),
      { wrapper },
    );
    let returned: Row | undefined;
    await act(async () => {
      returned = await result.current.update("t1", { title: "Edited" });
    });
    // Resolved at once, with the cached row merged.
    expect(returned).toEqual({ id: "t1", title: "Edited" });
    expect(list().data[0]).toEqual({ id: "t1", title: "Edited" });
    expect(list().data[1]).toEqual({ id: "t2", title: "Read" });
    expect(detail()).toEqual({ id: "t1", title: "Edited" });
    expect(provider.update).toHaveBeenCalledTimes(1);
    expect(onUpdateSuccess).not.toHaveBeenCalled();
    answer.resolve({ data: { id: "t1", title: "Edited" } });
    await flush();
    expect(onUpdateSuccess).toHaveBeenCalledWith({ id: "t1", title: "Edited" });
  });

  it("rolls the cache back and reports the error when the write fails", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper, list, detail, queryClient } = setup({
      update: vi.fn(() => answer.promise) as DataProvider["update"],
    });
    const onError = vi.fn();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "optimistic", onError }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    expect(list().data[0]!.title).toBe("Edited");
    expect(pendingWriteCount(queryClient, "tasks")).toBe(1);
    answer.reject(new DataWriteError("forbidden", "You can't change this record."));
    await flush();
    expect(list().data[0]).toEqual({ id: "t1", title: "Write" });
    expect(detail()).toEqual({ id: "t1", title: "Write" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toBe("You can't change this record.");
    expect(pendingWriteCount(queryClient, "tasks")).toBe(0);
  });

  it("a rollback puts back only its own row, not another pending write's", async () => {
    const first = deferred<{ data: Row }>();
    const second = deferred<{ data: Row }>();
    const update = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { wrapper, list } = setup({ update: update as DataProvider["update"] });
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "optimistic", onError: () => {} }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "One" });
      await result.current.update("t2", { title: "Two" });
    });
    first.reject(new Error("nope"));
    await flush();
    expect(list().data).toEqual([
      { id: "t1", title: "Write" },
      { id: "t2", title: "Two" },
    ]);
    second.resolve({ data: { id: "t2", title: "Two" } });
    await flush();
  });

  it("removes a deleted row (and its count) at once, and restores it on failure", async () => {
    const answer = deferred<{ data: { id: string } }>();
    const { wrapper, list } = setup({ deleteOne: vi.fn(() => answer.promise) });
    const onError = vi.fn();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "optimistic", onError }),
      { wrapper },
    );
    await act(async () => {
      await result.current.remove("t1");
    });
    expect(list()).toEqual({ data: [{ id: "t2", title: "Read" }], total: 1 });
    answer.reject(new Error("offline"));
    await flush();
    expect(list()).toEqual({
      data: [
        { id: "t1", title: "Write" },
        { id: "t2", title: "Read" },
      ],
      total: 2,
    });
    expect(onError).toHaveBeenCalled();
  });

  it("a write that never settles does not hold back later refetches (low 9)", async () => {
    const never = deferred<{ data: Row }>();
    const update = vi
      .fn()
      .mockImplementationOnce(() => never.promise)
      .mockImplementationOnce(async () => ({ data: { id: "t2", title: "Two" } }));
    const { wrapper, queryClient, list } = setup({ update: update as DataProvider["update"] });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "optimistic" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "One" });
      await result.current.update("t2", { title: "Two" });
    });
    await flush();
    const tasksInvalidations = () =>
      invalidate.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === '["tasks"]').length;
    // The second write committed and refetched, although the first never answers.
    expect(tasksInvalidations()).toBe(1);
    expect(pendingWriteCount(queryClient, "tasks")).toBe(1);
    // ...and the first one's patch is still shown.
    expect(list().data[0]!.title).toBe("One");
    // (Settle it, so no write is left pending for the next test.)
    never.resolve({ data: { id: "t1", title: "One" } });
    await flush();
  });
});

describe("useResource — undoable", () => {
  it("sends nothing until the delay ends, then commits", async () => {
    const { wrapper, list, provider } = setup();
    const onUndoable = vi.fn();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onUndoable }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    expect(list().data[0]!.title).toBe("Edited");
    expect(onUndoable).toHaveBeenCalledTimes(1);
    const write = onUndoable.mock.calls[0]![0] as UndoableWrite;
    expect(write).toMatchObject({ resource: "tasks", kind: "update", id: "t1", strategy: "delay", delayMs: 5000 });
    await flush(4999);
    expect(provider.update).not.toHaveBeenCalled();
    await flush(1);
    expect(provider.update).toHaveBeenCalledWith("tasks", { id: "t1", data: { title: "Edited" } });
    // Too late: the write was sent.
    let undone: boolean | undefined;
    await act(async () => {
      undone = await write.undo();
    });
    expect(undone).toBe(false);
  });

  it("undo cancels the write and restores the cache", async () => {
    const { wrapper, list, detail, provider, queryClient } = setup();
    let write: UndoableWrite | undefined;
    const { result } = renderHook(
      () =>
        useResource<Row>("tasks", {
          enabled: false,
          mutationMode: "undoable",
          undoDelayMs: 3000,
          onUndoable: (w) => {
            write = w;
          },
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    expect(detail()!.title).toBe("Edited");
    let undone: boolean | undefined;
    await act(async () => {
      undone = await write!.undo();
    });
    expect(undone).toBe(true);
    expect(list().data[0]).toEqual({ id: "t1", title: "Write" });
    expect(detail()).toEqual({ id: "t1", title: "Write" });
    await flush(10_000);
    expect(provider.update).not.toHaveBeenCalled();
    expect(pendingWriteCount(queryClient, "tasks")).toBe(0);
    // A second undo, or a late commit, does nothing.
    await act(async () => {
      await write!.undo();
      write!.commit();
    });
    expect(provider.update).not.toHaveBeenCalled();
  });

  it("undo cancels a delete", async () => {
    const { wrapper, list, provider } = setup();
    let write: UndoableWrite | undefined;
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => (write = w) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.remove("t2");
    });
    expect(list().total).toBe(1);
    await act(async () => {
      await write!.undo();
    });
    expect(list().total).toBe(2);
    expect(list().data.map((r) => r.id)).toEqual(["t1", "t2"]);
    await flush(6000);
    expect(provider.deleteOne).not.toHaveBeenCalled();
  });

  it("keeps waiting when the hook unmounts, so the undo still works (medium 2)", async () => {
    const { wrapper, provider, list } = setup();
    let write: UndoableWrite | undefined;
    const { result, unmount } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => (write = w) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    unmount();
    await flush();
    expect(provider.update).not.toHaveBeenCalled();
    let undone: boolean | undefined;
    await act(async () => {
      undone = await write!.undo();
    });
    expect(undone).toBe(true);
    expect(list().data[0]!.title).toBe("Write");
    await flush(10_000);
    expect(provider.update).not.toHaveBeenCalled();
  });

  it("sends after the delay when the hook unmounted and nobody undid it", async () => {
    const { wrapper, provider } = setup();
    const { result, unmount } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    unmount();
    await flush(5000);
    expect(provider.update).toHaveBeenCalledTimes(1);
    await flush(10_000);
    expect(provider.update).toHaveBeenCalledTimes(1);
  });

  it("commits waiting writes before the page unloads, with keepalive, and holds the page (medium 4)", async () => {
    const { wrapper, provider } = setup();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    await flush();
    expect(provider.update).toHaveBeenCalledTimes(1);
    expect(provider.update).toHaveBeenCalledWith("tasks", { id: "t1", data: { title: "Edited" }, keepalive: true });
    // This provider does not promise keepalive, so the page asks to stay.
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not prompt on unload when the provider keeps writes alive (medium 4)", async () => {
    const { wrapper, provider } = setup({
      capabilities: async () => ({
        search: false,
        sort: false,
        filterOperators: [],
        bulkWrites: false,
        versionedWrites: false,
        compositeKeys: false,
        keepaliveWrites: true,
      }),
    });
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.remove("t2");
    });
    await flush();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(provider.deleteOne).toHaveBeenCalledWith("tasks", { id: "t2", keepalive: true });
    expect(event.defaultPrevented).toBe(false);
    await flush();
  });

  it("does not prompt on unload when nothing is pending (medium 4)", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => void w.undo() }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    await flush();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("sends waiting writes on pagehide (mobile tab kills, bfcache)", async () => {
    const { wrapper, provider } = setup();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    window.dispatchEvent(new Event("pagehide"));
    await flush();
    expect(provider.update).toHaveBeenCalledWith("tasks", { id: "t1", data: { title: "Edited" }, keepalive: true });
  });

  it("rolls back and reports when the delayed write fails", async () => {
    const { wrapper, list } = setup({
      update: vi.fn(async () => {
        throw new DataWriteError("gone", "This record no longer exists.");
      }),
    });
    const onError = vi.fn();
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onError }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    await flush(5000);
    expect(list().data[0]!.title).toBe("Write");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("with a provider that serves undo: sends at once, and undoes by audit id", async () => {
    const undo = vi.fn(async () => ({}));
    const { wrapper, provider } = setup({
      capabilities: async () => ({
        search: false,
        sort: false,
        filterOperators: [],
        bulkWrites: false,
        versionedWrites: false,
        compositeKeys: false,
        undo: true,
      }),
      update: vi.fn(async (_r, { id, data }) => ({
        data: { id, ...(data as object) },
        audit: {
          id: "audit-7",
          occurredAt: "2026-10-22T00:00:00Z",
          actor: null,
          resource: "tasks",
          key: { id },
          action: "update" as const,
          before: null,
          after: null,
        },
      })) as DataProvider["update"],
      undo,
    });
    let write: UndoableWrite | undefined;
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => (write = w) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    await flush();
    expect(provider.update).toHaveBeenCalledTimes(1);
    expect(write).toMatchObject({ strategy: "provider", kind: "update", id: "t1" });
    await act(async () => {
      await write!.undo();
      await write!.undo();
    });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledWith("tasks", { auditId: "audit-7" });
  });
});

describe("useResourceForm — mutation modes", () => {
  const fields = [{ key: "title", type: "text" as const }];

  it("optimistic: calls onSuccess at once with the merged record, and patches the cache", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper, list } = setup({ update: vi.fn(() => answer.promise) as DataProvider["update"] });
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "Write" },
          fields,
          mutationMode: "optimistic",
          onSuccess,
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.handleSave({ title: "Edited" });
    });
    expect(onSuccess).toHaveBeenCalledWith({ id: "t1", title: "Edited" });
    expect(list().data[0]!.title).toBe("Edited");
    answer.resolve({ data: { id: "t1", title: "Edited" } });
    await flush();
  });

  it("optimistic: a failed save rolls back and reaches onError and the form", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper, list } = setup({ update: vi.fn(() => answer.promise) as DataProvider["update"] });
    const onError = vi.fn();
    const { result } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "Write" },
          fields,
          mutationMode: "optimistic",
          onError,
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.handleSave({ title: "Taken" });
    });
    answer.reject(
      new DataWriteError("invalid", "Title is already in use.", { fields: { title: "This value is already in use." } }),
    );
    await flush();
    expect(list().data[0]!.title).toBe("Write");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.form.formState.errors.title?.message).toBe("This value is already in use.");
    expect(result.current.form.formState.errors.root?.message).toBe("Title is already in use.");
  });

  it("undoable: a create waits, and undo means it is never sent", async () => {
    const { wrapper, provider } = setup();
    let write: UndoableWrite | undefined;
    const onSuccess = vi.fn();
    const { result } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "create",
          fields,
          prefillFromUrl: false,
          mutationMode: "undoable",
          onUndoable: (w) => (write = w),
          onSuccess,
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.handleSave({ title: "New" });
    });
    expect(onSuccess).toHaveBeenCalledWith({ title: "New" });
    expect(write).toMatchObject({ kind: "create", strategy: "delay" });
    expect(write!.id).toBeUndefined();
    await act(async () => {
      await write!.undo();
    });
    await flush(10_000);
    expect(provider.create).not.toHaveBeenCalled();
  });

  it("undoable: a form that unmounts on success can still be undone (medium 2)", async () => {
    const { wrapper, provider, list } = setup();
    let write: UndoableWrite | undefined;
    const { result, unmount } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "Write" },
          fields,
          mutationMode: "undoable",
          onUndoable: (w) => (write = w),
        }),
      { wrapper },
    );
    await act(async () => {
      await result.current.handleSave({ title: "Edited" });
    });
    unmount();
    await flush();
    expect(provider.update).not.toHaveBeenCalled();
    let undone: boolean | undefined;
    await act(async () => {
      undone = await write!.undo();
    });
    expect(undone).toBe(true);
    expect(list().data[0]!.title).toBe("Write");
    await flush(10_000);
    expect(provider.update).not.toHaveBeenCalled();
  });

  it("a save that fails after the form was hidden only reaches onError (low 6)", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper } = setup({ update: vi.fn(() => answer.promise) as DataProvider["update"] });
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      ({ visible }: { visible: boolean }) =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "Write" },
          fields,
          warnWhenUnsaved: true,
          mutationMode: "optimistic",
          onError,
          visible,
        }),
      { wrapper, initialProps: { visible: true } },
    );
    await act(async () => {
      await result.current.handleSave({ title: "Taken" });
    });
    expect(result.current.isDirty).toBe(false);
    rerender({ visible: false });
    answer.reject(
      new DataWriteError("invalid", "Title is already in use.", { fields: { title: "This value is already in use." } }),
    );
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.form.formState.errors.title).toBeUndefined();
    expect(result.current.form.formState.errors.root).toBeUndefined();
    expect(result.current.isDirty).toBe(false);
  });

  it("a save that fails after the form moved on (reset to other values) only reaches onError (low 6)", async () => {
    const answer = deferred<{ data: Row }>();
    const { wrapper } = setup({ update: vi.fn(() => answer.promise) as DataProvider["update"] });
    const onError = vi.fn();
    const { result } = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "Write" },
          fields,
          mutationMode: "optimistic",
          onError,
        }),
      { wrapper },
    );
    // As a rendered input would (the form unregisters fields it does not render).
    act(() => {
      result.current.form.register("title");
    });
    await act(async () => {
      await result.current.handleSave({ title: "Taken" });
    });
    act(() => {
      result.current.form.setValue("title", "Another record");
    });
    answer.reject(new DataWriteError("invalid", "Nope.", { fields: { title: "Bad." } }));
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.form.formState.errors.title).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Review fast-follows (#106): pending writes on the same record, refetches
// and new list keys during the undo window.
// ---------------------------------------------------------------------------

type NotedRow = Row & { notes?: string };

describe("undoable — later writes on the same record (medium 1)", () => {
  const formFields = [
    { key: "title", type: "text" as const },
    { key: "notes", type: "text" as const },
  ];

  it("undoing an earlier edit puts its values back in a later pending edit that kept them", async () => {
    const { wrapper, provider, list, detail } = setup();
    const writes: UndoableWrite[] = [];
    const onUndoable = (w: UndoableWrite) => void writes.push(w);
    // Form A changes the title.
    const a = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "Write" },
          fields: formFields,
          mutationMode: "undoable",
          onUndoable,
        }),
      { wrapper },
    );
    await act(async () => {
      await a.result.current.handleSave({ id: "t1", title: "X" });
    });
    a.unmount();
    // Form B opens from the patched cache (title X) and changes only notes.
    const opened = list().data[0] as NotedRow;
    expect(opened.title).toBe("X");
    const b = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: opened,
          fields: formFields,
          mutationMode: "undoable",
          onUndoable,
        }),
      { wrapper },
    );
    await act(async () => {
      await b.result.current.handleSave({ ...opened, notes: "N" });
    });
    b.unmount();
    expect(list().data[0]).toEqual({ id: "t1", title: "X", notes: "N" });

    // Undo A: B's pending patch stays, and the title goes back.
    await act(async () => {
      expect(await writes[0]!.undo()).toBe(true);
    });
    expect(list().data[0]).toEqual({ id: "t1", title: "Write", notes: "N" });
    expect(detail()).toEqual({ id: "t1", title: "Write", notes: "N" });

    // B is sent with the title it was shown before A, never A's value.
    await flush(5000);
    expect(provider.update).toHaveBeenCalledTimes(1);
    expect(provider.update).toHaveBeenCalledWith("tasks", {
      id: "t1",
      data: { id: "t1", title: "Write", notes: "N" },
    });
  });

  it("a later edit that changed the same field keeps its own value", async () => {
    const { wrapper, provider, list } = setup();
    const writes: UndoableWrite[] = [];
    const { result } = renderHook(
      () => useResource<NotedRow>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => void writes.push(w) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "X" });
      await result.current.update("t1", { title: "Y", notes: "N" });
    });
    await act(async () => {
      await writes[0]!.undo();
    });
    expect(list().data[0]).toEqual({ id: "t1", title: "Y", notes: "N" });
    await flush(5000);
    expect(provider.update).toHaveBeenCalledWith("tasks", { id: "t1", data: { title: "Y", notes: "N" } });
    // Then undoing nothing else: the row is what B sent.
  });

  it("undoing the later edit after the earlier one was undone restores the original row", async () => {
    const { wrapper, list } = setup();
    const writes: UndoableWrite[] = [];
    const { result } = renderHook(
      () => useResource<NotedRow>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => void writes.push(w) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "X" });
      await result.current.update("t1", { title: "Y" });
    });
    await act(async () => {
      await writes[0]!.undo();
      await writes[1]!.undo();
    });
    expect(list().data[0]).toEqual({ id: "t1", title: "Write" });
  });

  it("a later edit whose values are not row-shaped is dropped and reported, never sent", async () => {
    const { wrapper, provider } = setup({
      toFormValues: (_resource, record) => ({ ...record, title_input: record.title }),
    });
    const writes: UndoableWrite[] = [];
    const onError = vi.fn();
    const first = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => void writes.push(w) }),
      { wrapper },
    );
    await act(async () => {
      await first.result.current.update("t1", { title: "X" });
    });
    const form = renderHook(
      () =>
        useResourceForm({
          resource: "tasks",
          action: "edit",
          id: "t1",
          initialData: { id: "t1", title: "X" },
          fields: [{ key: "title_input", type: "text" as const }],
          mutationMode: "undoable",
          onUndoable: (w) => void writes.push(w),
          onError,
        }),
      { wrapper },
    );
    await act(async () => {
      await form.result.current.handleSave({ title_input: "X", id: "t1" });
    });
    await act(async () => {
      await writes[0]!.undo();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0].message).toMatch(/not saved/);
    // The dropped write's own undo says it will not be sent.
    await act(async () => {
      expect(await writes[1]!.undo()).toBe(true);
    });
    await flush(10_000);
    expect(provider.update).not.toHaveBeenCalled();
  });

  it("sending a later edit first sends the earlier one, in order; the earlier can then not be undone", async () => {
    const { wrapper, provider } = setup();
    const writes: UndoableWrite[] = [];
    const { result } = renderHook(
      () => useResource<NotedRow>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => void writes.push(w) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "X" });
      await result.current.update("t1", { notes: "N" });
    });
    act(() => writes[1]!.commit());
    await flush();
    expect((provider.update as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1].data)).toEqual([
      { title: "X" },
      { notes: "N" },
    ]);
    await act(async () => {
      expect(await writes[0]!.undo()).toBe(false);
    });
  });

  it("a later write waits for the earlier one on the same record to answer", async () => {
    const first = deferred<{ data: Row }>();
    const update = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async (_r: string, { id, data }: { id: string; data: object }) => ({ data: { id, ...data } }));
    const { wrapper } = setup({ update: update as DataProvider["update"] });
    const { result } = renderHook(
      () => useResource<NotedRow>("tasks", { enabled: false, mutationMode: "optimistic", onError: () => {} }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "X" });
      await result.current.update("t1", { notes: "N" });
    });
    await flush();
    expect(update).toHaveBeenCalledTimes(1);
    first.resolve({ data: { id: "t1", title: "X" } });
    await flush();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("an earlier write that fails puts its values back in a queued later write", async () => {
    const first = deferred<{ data: Row }>();
    const update = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async (_r: string, { id, data }: { id: string; data: object }) => ({ data: { id, ...data } }));
    const { wrapper, list } = setup({ update: update as DataProvider["update"] });
    const onError = vi.fn();
    const { result } = renderHook(
      () => useResource<NotedRow>("tasks", { enabled: false, mutationMode: "optimistic", onError }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "X" });
      // Built from the patched row, as a form would.
      await result.current.update("t1", { ...(list().data[0] as NotedRow), notes: "N" });
    });
    first.reject(new Error("refused"));
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[1]![1].data).toEqual({ id: "t1", title: "Write", notes: "N" });
  });
});

describe("pending patches survive refetches and new list keys (medium 3, low 5)", () => {
  const PAGE_2 = ["tasks", "list", { pagination: { page: 2, perPage: 25 } }];
  const serverRows = () => ({
    data: [
      { id: "t1", title: "Write" },
      { id: "t2", title: "Read" },
    ],
    total: 2,
  });

  it("a deleted row stays gone when a new list key is fetched during the undo window", async () => {
    const { wrapper, queryClient, provider } = setup({ getList: vi.fn(async () => serverRows()) });
    let write: UndoableWrite | undefined;
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable", onUndoable: (w) => (write = w) }),
      { wrapper },
    );
    await act(async () => {
      await result.current.remove("t1");
    });
    await act(async () => {
      await queryClient.fetchQuery({ queryKey: PAGE_2, queryFn: () => provider.getList("tasks", {}) });
    });
    expect(queryClient.getQueryData<ListResult<Row>>(PAGE_2)).toEqual({ data: [{ id: "t2", title: "Read" }], total: 1 });
    // Undo brings it back there too.
    await act(async () => {
      await write!.undo();
    });
    expect(queryClient.getQueryData<ListResult<Row>>(PAGE_2)!.data.map((r) => r.id)).toEqual(["t1", "t2"]);
  });

  it("a refetch of the same key keeps a pending delete and a pending edit", async () => {
    const { wrapper, queryClient, provider, list } = setup({ getList: vi.fn(async () => serverRows()) });
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.remove("t2");
      await result.current.update("t1", { title: "Edited" });
    });
    await act(async () => {
      await queryClient.fetchQuery({ queryKey: LIST_KEY, queryFn: () => provider.getList("tasks", {}), staleTime: 0 });
    });
    expect(list()).toEqual({ data: [{ id: "t1", title: "Edited" }], total: 1 });
  });

  it("does not cancel a list fetch already in flight; its answer gets the patch (low 5)", async () => {
    const answer = deferred<ListResult<Row>>();
    const { wrapper, queryClient } = setup();
    let fetched: ListResult<Row> | undefined;
    void queryClient
      .fetchQuery({ queryKey: PAGE_2, queryFn: () => answer.promise })
      .then((value) => (fetched = value));
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    answer.resolve(serverRows());
    await flush();
    // Not cancelled: the fetch resolved with its data.
    expect(fetched).toBeDefined();
    expect(queryClient.getQueryData<ListResult<Row>>(PAGE_2)!.data[0]).toEqual({ id: "t1", title: "Edited" });
  });

  it("once the write is sent, its patch is no longer re-applied", async () => {
    const getList = vi.fn(async () => serverRows());
    const { wrapper, queryClient, provider, list } = setup({ getList });
    const { result } = renderHook(
      () => useResource<Row>("tasks", { enabled: false, mutationMode: "undoable" }),
      { wrapper },
    );
    await act(async () => {
      await result.current.update("t1", { title: "Edited" });
    });
    await flush(5000);
    expect(provider.update).toHaveBeenCalledTimes(1);
    await act(async () => {
      await queryClient.fetchQuery({ queryKey: LIST_KEY, queryFn: () => provider.getList("tasks", {}), staleTime: 0 });
    });
    // The server's answer wins now.
    expect(list().data[0]).toEqual({ id: "t1", title: "Write" });
  });
});
