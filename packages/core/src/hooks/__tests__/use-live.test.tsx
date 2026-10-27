// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataProviderRoot } from "../../provider/context";
import { createMockProvider } from "../../provider/mock-provider";
import type { DataProvider, ResourceChangeEvent } from "../../provider/types";
import { resourceKeys } from "../../query-keys";
import { useResource } from "../use-resource";

afterEach(cleanup);

describe("live: patch, then refetch only the lists the change could touch", () => {
  it("patches the row at once and leaves another person's list alone", async () => {
    let emit!: (event: ResourceChangeEvent) => void;
    const base = createMockProvider({ tasks: [{ id: "t1", person_id: "p1", title: "old" }] });
    const provider: DataProvider = {
      ...base,
      subscribe: (_resource, _params, callback) => {
        emit = callback;
        return () => {};
      },
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Another screen's cached list, filtered to someone else.
    const theirs = resourceKeys("tasks").list({ filters: [{ field: "person_id", operator: "eq", value: "p2" }] });
    client.setQueryData(theirs, { data: [], total: 0 });

    function Mine() {
      useResource("tasks", { live: { debounceMs: 0 }, defaultFilters: [{ field: "person_id", operator: "eq", value: "p1" }] });
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <DataProviderRoot provider={provider}>
          <Mine />
        </DataProviderRoot>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(emit).toBeTypeOf("function"));
    const mine = client.getQueryCache().findAll({ queryKey: resourceKeys("tasks").lists }).find((q) => q.queryKey !== theirs && JSON.stringify(q.queryKey).includes('"p1"'))!;
    await waitFor(() => expect(mine.state.data).toBeTruthy());

    act(() => emit({ type: "updated", id: "t1", record: { id: "t1", person_id: "p1", title: "new" } }));
    // Patched before any refetch.
    expect((mine.state.data as { data: { title: string }[] }).data[0]!.title).toBe("new");
    await waitFor(() => expect(mine.state.isInvalidated || mine.state.dataUpdateCount > 1).toBe(true));
    expect(client.getQueryState(theirs)?.isInvalidated).toBe(false);

    // An event without a row (a delete) refetches everything under the resource.
    act(() => emit({ type: "deleted", id: "t9" }));
    await waitFor(() => expect(client.getQueryState(theirs)?.isInvalidated).toBe(true));
  });

  it("resyncs on an interval, for changes realtime can't deliver (a row binned out of view)", async () => {
    const base = createMockProvider({ tasks: [{ id: "t1", person_id: "p1" }] });
    const provider: DataProvider = { ...base, subscribe: () => () => {} };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, "invalidateQueries");
    function Live({ resyncMs }: { resyncMs: number }) {
      useResource("tasks", { live: { resyncMs } });
      return null;
    }
    const view = render(
      <QueryClientProvider client={client}>
        <DataProviderRoot provider={provider}>
          <Live resyncMs={40} />
        </DataProviderRoot>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["tasks"], refetchType: "active" })));
    view.unmount();
    // 0 turns it off.
    spy.mockClear();
    render(
      <QueryClientProvider client={client}>
        <DataProviderRoot provider={provider}>
          <Live resyncMs={0} />
        </DataProviderRoot>
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 120));
    expect(spy.mock.calls.some(([arg]) => (arg as { refetchType?: string })?.refetchType === "active")).toBe(false);
  });
});
