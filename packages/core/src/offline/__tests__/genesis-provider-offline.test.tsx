// @vitest-environment happy-dom
// @feat:data-offline
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useResource } from "../../hooks/use-resource";
import { GenesisProvider } from "../../provider/context";
import type { DataProvider } from "../../provider/types";
import { memoryLocalCache } from "../memory";
import { persistOffline } from "../persist";
import { cacheScope, type LocalCache } from "../types";

function Titles() {
  const { list } = useResource<{ id: number; title: string }>("tasks");
  return <ul>{list.data?.data.map((t) => <li key={t.id}>{t.title}</li>)}</ul>;
}

function app(cache: LocalCache, getList: DataProvider["getList"], scope: string | null = cacheScope("ana")) {
  const provider = { getList, getOne: vi.fn(), getMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteOne: vi.fn() } as unknown as DataProvider;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const persist = persistOffline({ cache, resources: ["tasks"], buster: "v1", throttleMs: 0 });
  return render(
    <GenesisProvider provider={provider} queryClient={client} persist={persist} persistScope={scope}>
      <Titles />
    </GenesisProvider>,
  );
}

describe("GenesisProvider with persist", () => {
  it("opens a list from the device before the network answers, then shows the fresh read", async () => {
    const cache = memoryLocalCache();
    const first = app(cache, vi.fn(async () => ({ data: [{ id: 1, title: "One" }], total: 1 })) as DataProvider["getList"]);
    expect(await screen.findByText("One")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20)); // the save
    first.unmount();

    // Next start: the network is slow.
    let answer: (v: unknown) => void = () => {};
    const slow = vi.fn(() => new Promise((r) => (answer = r))) as unknown as DataProvider["getList"];
    app(cache, slow);
    expect(await screen.findByText("One")).toBeTruthy();
    await waitFor(() => expect(slow).toHaveBeenCalled());
    answer({ data: [{ id: 1, title: "One, renamed" }], total: 1 });
    expect(await screen.findByText("One, renamed")).toBeTruthy();
  });

  it("restores nothing for someone else, and nothing while signed out", async () => {
    const cache = memoryLocalCache();
    const first = app(cache, vi.fn(async () => ({ data: [{ id: 1, title: "One" }], total: 1 })) as DataProvider["getList"]);
    expect(await screen.findByText("One")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    first.unmount();

    const never = vi.fn(() => new Promise(() => {})) as unknown as DataProvider["getList"];
    const ben = app(cache, never, cacheScope("ben"));
    await waitFor(() => expect(never).toHaveBeenCalled());
    expect(screen.queryByText("One")).toBeNull();
    ben.unmount();
    app(cache, never, null);
    await waitFor(() => expect(never).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("One")).toBeNull();
  });

  it("doesn't hold the first render on a slow device read", async () => {
    const stuck: LocalCache = { ...memoryLocalCache(), readQueries: () => new Promise(() => {}) };
    app(stuck, vi.fn(async () => ({ data: [{ id: 1, title: "From the network" }], total: 1 })) as DataProvider["getList"]);
    expect(await screen.findByText("From the network", {}, { timeout: 2000 })).toBeTruthy();
  });

  it("signing out deletes the person's reads from the device, and a restore still reading shows nothing", async () => {
    const cache = memoryLocalCache();
    const first = app(cache, vi.fn(async () => ({ data: [{ id: 1, title: "One" }], total: 1 })) as DataProvider["getList"]);
    expect(await screen.findByText("One")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    first.unmount();

    // Next start: the device is slow to answer, and the person signs out meanwhile.
    let release: () => void = () => {};
    let reading = false;
    const slow: LocalCache = {
      ...cache,
      readQueries: async (scope) => {
        reading = true;
        await new Promise<void>((r) => (release = r));
        return cache.readQueries(scope);
      },
    };
    const provider = { getList: vi.fn(() => new Promise(() => {})), getOne: vi.fn(), getMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteOne: vi.fn() } as unknown as DataProvider;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const persist = persistOffline({ cache: slow, resources: ["tasks"], buster: "v1", throttleMs: 0 });
    const tree = (scope: string | null) => (
      <GenesisProvider provider={provider} queryClient={client} persist={persist} persistScope={scope}>
        <Titles />
      </GenesisProvider>
    );
    const view = render(tree(cacheScope("ana")));
    await waitFor(() => expect(reading).toBe(true));
    view.rerender(tree(null));
    client.clear();
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("One")).toBeNull();
    await waitFor(async () => expect(await cache.readQueries(cacheScope("ana"))).toEqual([]));
  });
});
