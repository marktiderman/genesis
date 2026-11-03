// @vitest-environment jsdom
/**
 * `useResource().update(id, data, { expectedVersion })`: "keep mine" after a conflict sends at the
 * version the conflict reported, through the resource's write path, so the version it commits is
 * what the next write of the row is checked against.
 */
import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { GenesisProvider } from "../../provider/context";
import type { DataProvider } from "../../provider/types";
import { useResource } from "../use-resource";

function setup() {
  // The list was read at version 1; someone else has since saved version 2.
  const row: Record<string, unknown> = { id: "t1", title: "T", stage: "todo", version: 1 };
  let version = 2;
  const update = vi.fn(async (_r: string, params: { id: string; data: Record<string, unknown>; expectedVersion?: string }) => {
    version += 1;
    Object.assign(row, params.data, { version });
    return { data: { ...row } };
  });
  const provider = {
    getList: vi.fn(async () => ({ data: [{ ...row }], total: 1 })),
    update,
    capabilities: async () => ({
      search: false,
      sort: false,
      filterOperators: [],
      bulkWrites: false,
      versionedWrites: true,
      compositeKeys: false,
      version: { field: "version", kind: "integer" as const },
    }),
  } as unknown as DataProvider;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={provider} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
  return { update, wrapper };
}

describe("useResource().update with expectedVersion", () => {
  it("sends the version given, not the cached row's", async () => {
    const { update, wrapper } = setup();
    const { result } = renderHook(() => useResource("tasks"), { wrapper });
    await vi.waitFor(() => expect(result.current.list.data?.data).toHaveLength(1));
    await act(async () => {
      await result.current.update("t1", { stage: "done" }, { expectedVersion: "2" });
    });
    expect(update).toHaveBeenLastCalledWith("tasks", expect.objectContaining({ id: "t1", expectedVersion: "2" }));
  });

  it("checks the next write against the version it committed, before any refetch", async () => {
    const { update, wrapper } = setup();
    const { result } = renderHook(() => useResource("tasks"), { wrapper });
    await vi.waitFor(() => expect(result.current.list.data?.data).toHaveLength(1));
    await act(async () => {
      await result.current.update("t1", { stage: "done" }, { expectedVersion: "2" });
      await result.current.update("t1", { stage: "doing" });
    });
    expect(update).toHaveBeenLastCalledWith("tasks", expect.objectContaining({ data: { stage: "doing" }, expectedVersion: "3" }));
  });

  it("without options, sends the cached row's version as before", async () => {
    const { update, wrapper } = setup();
    const { result } = renderHook(() => useResource("tasks"), { wrapper });
    await vi.waitFor(() => expect(result.current.list.data?.data).toHaveLength(1));
    await act(async () => {
      await result.current.update("t1", { stage: "done" });
    });
    expect(update).toHaveBeenLastCalledWith("tasks", expect.objectContaining({ expectedVersion: "1" }));
  });
});
