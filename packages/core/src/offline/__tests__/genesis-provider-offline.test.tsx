// @vitest-environment happy-dom
// @feat:data-offline
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useResource } from "../../hooks/use-resource";
import { ViewerScope } from "../../hooks/viewer-scope";
import { GenesisProvider } from "../../provider/context";
import type { DataProvider } from "../../provider/types";
import { memoryLocalCache } from "../memory";
import { persistOffline } from "../persist";
import { cacheScope, type LocalCache } from "../types";

function Titles() {
  const { list } = useResource<{ id: number; title: string }>("tasks");
  return <ul>{list.data?.data.map((t) => <li key={t.id}>{t.title}</li>)}</ul>;
}

function app(cache: LocalCache, getList: DataProvider["getList"], scope: string | null | undefined = cacheScope("ana"), viewer?: string) {
  const provider = { getList, getOne: vi.fn(), getMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteOne: vi.fn() } as unknown as DataProvider;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const persist = persistOffline({ cache, resources: ["tasks"], buster: "v1", throttleMs: 0 });
  return render(
    <GenesisProvider provider={provider} queryClient={client} persist={persist} persistScope={scope}>
      {viewer === undefined ? <Titles /> : (
        <ViewerScope viewer={viewer}>
          <Titles />
        </ViewerScope>
      )}
    </GenesisProvider>,
  );
}

/** Ana's list, saved on the device by an earlier start. */
async function savedForAna(cache: LocalCache) {
  const first = app(cache, vi.fn(async () => ({ data: [{ id: 1, title: "One" }], total: 1 })) as DataProvider["getList"]);
  expect(await screen.findByText("One")).toBeTruthy();
  await new Promise((r) => setTimeout(r, 20));
  first.unmount();
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

  it("leaves the device alone while it isn't known who's signed in, and wipes it once nobody is", async () => {
    const cache = memoryLocalCache();
    await savedForAna(cache);
    const never = vi.fn(() => new Promise(() => {})) as unknown as DataProvider["getList"];
    const loading = app(cache, never, undefined);
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.readQueries(cacheScope("ana"))).not.toEqual([]);
    loading.unmount();
    app(cache, never, null);
    await waitFor(async () => expect(await cache.readQueries(cacheScope("ana"))).toEqual([]));
  });

  it("deletes the last person's reads when the next start is someone else's", async () => {
    const cache = memoryLocalCache();
    await savedForAna(cache);
    const never = vi.fn(() => new Promise(() => {})) as unknown as DataProvider["getList"];
    app(cache, never, cacheScope("ben"));
    await waitFor(async () => expect(await cache.readQueries(cacheScope("ana"))).toEqual([]));
    expect(await cache.readRows(cacheScope("ana"), "tasks", ["1"])).toEqual([]);
  });

  it("a ViewerScope inside keeps the reads restored for its viewer", async () => {
    const cache = memoryLocalCache();
    await savedForAna(cache);
    const never = vi.fn(() => new Promise(() => {})) as unknown as DataProvider["getList"];
    app(cache, never, cacheScope("ana"), "ana");
    expect(await screen.findByText("One")).toBeTruthy();
  });

  it("saves the first read after the session loads, so the next start opens it from the device", async () => {
    const cache = memoryLocalCache();
    const provider = { getList: vi.fn(async () => ({ data: [{ id: 1, title: "First load" }], total: 1 })), getOne: vi.fn(), getMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteOne: vi.fn() } as unknown as DataProvider;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const persist = persistOffline({ cache, resources: ["tasks"], buster: "v1", throttleMs: 0 });
    const tree = (scope: string | null | undefined) => (
      <GenesisProvider provider={provider} queryClient={client} persist={persist} persistScope={scope}>
        <Titles />
      </GenesisProvider>
    );
    // The session is still loading: the screen reads anyway.
    const view = render(tree(undefined));
    expect(await screen.findByText("First load")).toBeTruthy();
    // Then it turns out to be Ana's.
    view.rerender(tree(cacheScope("ana")));
    await waitFor(async () => expect((await cache.readQueries(cacheScope("ana"))).length).toBeGreaterThan(1));
    view.unmount();

    // Next start: the network never answers, and the list opens from the device.
    const never = vi.fn(() => new Promise(() => {})) as unknown as DataProvider["getList"];
    app(cache, never);
    expect(await screen.findByText("First load")).toBeTruthy();
  });

  it("never carries one session's reads into the next person's, through a loading session in between", async () => {
    const cache = memoryLocalCache();
    const provider = { getList: vi.fn(async () => ({ data: [{ id: 1, title: "Ana's task" }], total: 1 })), getOne: vi.fn(), getMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteOne: vi.fn() } as unknown as DataProvider;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const persist = persistOffline({ cache, resources: ["tasks"], buster: "v1", throttleMs: 0 });
    const tree = (scope: string | null | undefined) => (
      <GenesisProvider provider={provider} queryClient={client} persist={persist} persistScope={scope}>
        <Titles />
      </GenesisProvider>
    );
    const view = render(tree(cacheScope("ana")));
    expect(await screen.findByText("Ana's task")).toBeTruthy();
    // The session reloads, and turns out to be Ben's; the app hasn't emptied the client.
    view.rerender(tree(undefined));
    view.rerender(tree(cacheScope("ben")));
    await new Promise((r) => setTimeout(r, 30));
    expect(await cache.readRows(cacheScope("ben"), "tasks", ["1"])).toEqual([]);
  });
});
