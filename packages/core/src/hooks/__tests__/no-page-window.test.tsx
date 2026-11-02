// @vitest-environment happy-dom
/**
 * Writes and page-leave hooks where `window` has no listener methods: React Native, whose global
 * object is `window` and which Hermes gives no `addEventListener`. Each used to throw
 * "undefined is not a function" there; on the web they still listen for the page going away.
 */
import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataProvider } from "../../provider/types";
import { resourceKeys } from "../../query-keys";
import { executeWrite, pendingWriteCount, type MutationMode } from "../mutation-mode";
import { pageWindow } from "../page-window";
import { useDraft } from "../use-draft";
import { useUnsavedChangesGuard } from "../use-unsaved-changes-guard";

const listenerMethods = ["addEventListener", "removeEventListener"] as const;
// The test DOM's own methods, put back after each test.
const ownMethods = listenerMethods.map((name) => [name, Object.getOwnPropertyDescriptor(window, name)] as const);
function restoreListenerMethods() {
  for (const [name, descriptor] of ownMethods) {
    if (descriptor) Object.defineProperty(window, name, descriptor);
    else delete (window as unknown as Record<string, unknown>)[name];
  }
}

/** The phone's `window`: there, with no listener methods. */
function asOnThePhone() {
  for (const name of listenerMethods) {
    Object.defineProperty(window, name, { configurable: true, writable: true, value: undefined });
  }
}

afterEach(() => {
  restoreListenerMethods();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ROWS = [
  { id: "t1", title: "One" },
  { id: "t2", title: "Two" },
];

/** A delete of t1 through the engine, the way useResource's remove sends one. */
async function deleteT1(mode: MutationMode) {
  const client = new QueryClient();
  client.setQueryData(resourceKeys("tasks").list({}), { data: ROWS, total: ROWS.length });
  const deleteOne = vi.fn(async () => ({ data: { id: "t1" } }));
  const committed = vi.fn();
  const failedLater = vi.fn();
  const outcome = await executeWrite<void>({
    queryClient: client,
    provider: { deleteOne } as unknown as DataProvider,
    resource: "tasks",
    kind: "delete",
    id: "t1",
    mode,
    undoDelayMs: 1000,
    send: async () => {
      await deleteOne();
      return { record: undefined };
    },
    committed,
    failedLater,
  });
  const listed = () =>
    client.getQueryData<{ data: { id: string }[] }>(resourceKeys("tasks").list({}))?.data.map((r) => r.id);
  return { client, outcome, deleteOne, committed, failedLater, listed };
}

describe("pageWindow", () => {
  it("is the window in a browser, and nothing where window has no listener methods", () => {
    expect(pageWindow()).toBe(window);
    asOnThePhone();
    expect(pageWindow()).toBeUndefined();
  });
});

describe("a delete where window has no listener methods", () => {
  it("optimistic: leaves the list at once, then reaches the provider", async () => {
    asOnThePhone();
    const { client, outcome, deleteOne, committed, failedLater, listed } = await deleteT1("optimistic");
    expect(outcome).toEqual({ status: "applied" });
    expect(listed()).toEqual(["t2"]);
    await vi.waitFor(() => expect(committed).toHaveBeenCalledTimes(1));
    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(failedLater).not.toHaveBeenCalled();
    expect(pendingWriteCount(client, "tasks")).toBe(0);
  });

  it("undoable: leaves the list at once, then reaches the provider after the delay", async () => {
    vi.useFakeTimers();
    asOnThePhone();
    const { client, outcome, deleteOne, committed, failedLater, listed } = await deleteT1("undoable");
    expect(outcome).toEqual({ status: "applied" });
    expect(listed()).toEqual(["t2"]);
    expect(deleteOne).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(failedLater).not.toHaveBeenCalled();
    expect(pendingWriteCount(client, "tasks")).toBe(0);
  });

  it("pessimistic: reaches the provider", async () => {
    asOnThePhone();
    const { outcome, deleteOne, committed } = await deleteT1("pessimistic");
    expect(outcome).toEqual({ status: "committed", record: undefined });
    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(committed).toHaveBeenCalledTimes(1);
  });
});

describe("on the web, a waiting write still listens for the page going away", () => {
  it("adds beforeunload and pagehide while a write waits, and takes them off after", async () => {
    vi.useFakeTimers();
    const [add, remove] = listenerMethods.map((name) => {
      const own = window[name].bind(window) as (...args: unknown[]) => void;
      const spy = vi.fn((...args: unknown[]) => own(...args));
      Object.defineProperty(window, name, { configurable: true, writable: true, value: spy });
      return spy;
    }) as [ReturnType<typeof vi.fn>, ReturnType<typeof vi.fn>];
    const { deleteOne } = await deleteT1("undoable");
    expect(add.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["beforeunload", "pagehide"]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(deleteOne).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["beforeunload", "pagehide"]));
  });
});

describe("page-leave hooks where window has no listener methods", () => {
  it("useUnsavedChangesGuard mounts dirty and unmounts without throwing", () => {
    asOnThePhone();
    const { result, unmount } = renderHook(() => useUnsavedChangesGuard({ when: true, confirm: () => false }));
    expect(result.current.confirmLeave()).toBe(false);
    unmount();
  });

  it("useDraft mounts and unmounts without throwing", () => {
    asOnThePhone();
    const { unmount } = renderHook(() =>
      useDraft<Record<string, unknown>, { id: string }>({
        seed: { row: null, value: {} },
        create: async () => ({ id: "d1" }),
        update: async (row) => row,
        toValue: () => ({}),
      }),
    );
    unmount();
  });
});
