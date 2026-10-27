// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataProviderRoot } from "../../provider/context";
import { createMockProvider } from "../../provider/mock-provider";
import { defineQueryKeys, resourceKeys } from "../../query-keys";
import { useInfiniteResource } from "../use-infinite-resource";
import { useOne } from "../use-one";
import { useResource } from "../use-resource";
import { ViewerScope, useOptionalViewerScope, useViewerScope } from "../viewer-scope";

afterEach(cleanup);

function setup(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const provider = createMockProvider({ tasks: [{ id: "t1", title: "Ann's task" }] });
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>
      <DataProviderRoot provider={provider}>{children}</DataProviderRoot>
    </QueryClientProvider>
  );
  return { client, wrap };
}

const cachedKeys = (client: QueryClient) => client.getQueryCache().findAll().map((q) => JSON.stringify(q.queryKey));

describe("resourceKeys are the keys the hooks cache under", () => {
  it("useOne", async () => {
    const { client, wrap } = setup();
    function One() {
      useOne("tasks", "t1", { select: "id,title" });
      return null;
    }
    render(wrap(<One />));
    await waitFor(() => expect(cachedKeys(client)).toContain(JSON.stringify(resourceKeys("tasks").detail("t1", "id,title"))));
  });

  it("useResource", async () => {
    const { client, wrap } = setup();
    function List() {
      useResource("tasks");
      return null;
    }
    render(wrap(<List />));
    await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: resourceKeys("tasks").lists })).toHaveLength(1));
    const [query] = client.getQueryCache().findAll({ queryKey: resourceKeys("tasks").lists });
    const params = (query!.queryKey as unknown[])[2] as never;
    expect(query!.queryKey).toEqual(resourceKeys("tasks").list(params));
  });

  it("useInfiniteResource", async () => {
    const { client, wrap } = setup();
    function Pages() {
      useInfiniteResource("tasks");
      return null;
    }
    render(wrap(<Pages />));
    await waitFor(() =>
      expect(client.getQueryCache().findAll({ queryKey: [...resourceKeys("tasks").all, "infinite"] })).toHaveLength(1),
    );
  });
});

describe("useInfiniteResource and an uncounted or estimated total", () => {
  /** A provider with 25 rows that reports `total` as given, 10 per page. */
  function pagedProvider(total: number, totalIsEstimate?: boolean) {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `t${i}` }));
    return {
      ...createMockProvider({}),
      async getList(_r: string, params: { pagination?: { page: number; perPage: number } }) {
        const { page = 1, perPage = 10 } = params.pagination ?? {};
        return { data: rows.slice((page - 1) * perPage, page * perPage), total, ...(totalIsEstimate ? { totalIsEstimate } : {}) };
      },
    } as never;
  }

  async function loadAll(provider: never) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let api!: ReturnType<typeof useInfiniteResource>;
    function Pages() {
      api = useInfiniteResource("tasks", { perPage: 10 });
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <DataProviderRoot provider={provider}>
          <Pages />
        </DataProviderRoot>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(api.rows.length).toBe(10));
    for (let i = 0; i < 5 && api.hasNextPage; i++) {
      const before = api.rows.length;
      act(() => api.fetchNextPage());
      await waitFor(() => expect(api.rows.length > before || !api.hasNextPage).toBe(true));
    }
    // Let a final page settle before reading hasNextPage.
    await waitFor(() => expect(api.isFetchingNextPage).toBe(false));
    return api;
  }

  it("count none (total -1) keeps paging until a short page", async () => {
    const api = await loadAll(pagedProvider(-1));
    expect(api.rows.length).toBe(25);
    expect(api.hasNextPage).toBe(false);
  });

  it("an estimate that undercounts doesn't stop it early", async () => {
    const api = await loadAll(pagedProvider(12, true));
    expect(api.rows.length).toBe(25);
  });

  it("an exact total still stops at the total", async () => {
    const api = await loadAll(pagedProvider(20));
    expect(api.rows.length).toBe(20);
    expect(api.hasNextPage).toBe(false);
  });
});

describe("useInfiniteResource maxPages over a cursor that pages both ways", () => {
  it("drops pages from the front past maxPages, and loads them back going up", async () => {
    // 50 rows, cursors are row offsets: next and prev like the Supabase provider's.
    const all = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}` }));
    const provider = {
      ...createMockProvider({}),
      async getList(_r: string, params: { pagination?: { perPage: number; cursor?: string | null } }) {
        const per = params.pagination!.perPage;
        const at = params.pagination!.cursor ? Number(params.pagination!.cursor) : 0;
        const data = all.slice(at, at + per);
        return {
          data,
          total: at === 0 ? 50 : -1,
          nextCursor: at + per < all.length ? String(at + per) : null,
          prevCursor: at > 0 ? String(Math.max(0, at - per)) : null,
        };
      },
    } as never;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let api!: ReturnType<typeof useInfiniteResource>;
    function Feed() {
      api = useInfiniteResource("rows", { perPage: 10, maxPages: 2 });
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <DataProviderRoot provider={provider}>
          <Feed />
        </DataProviderRoot>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(api.rows.length).toBe(10));
    for (const expectFirst of ["r0", "r10"]) {
      act(() => api.fetchNextPage());
      await waitFor(() => expect(api.isFetchingNextPage).toBe(false));
      expect(api.rows[0]!.id).toBe(expectFirst);
    }
    // Three pages read, two kept: the first page was dropped, and its count is kept.
    expect(api.rows.map((r) => r.id).slice(0, 1)).toEqual(["r10"]);
    expect(api.rows).toHaveLength(20);
    expect(api.total).toBe(50);
    expect(api.hasPreviousPage).toBe(true);
    // Going back loads it again (and drops the last).
    act(() => api.fetchPreviousPage());
    await waitFor(() => expect(api.rows[0]!.id).toBe("r0"));
    expect(api.rows).toHaveLength(20);
    expect(api.total).toBe(50);
  });
});

describe("useInfiniteResource maxPages with offset paging", () => {
  it("drops nothing: offset pages can't be loaded back", async () => {
    const all = Array.from({ length: 30 }, (_, i) => ({ id: `o${i}` }));
    const provider = {
      ...createMockProvider({}),
      async getList(_r: string, params: { pagination?: { page: number; perPage: number } }) {
        const { page = 1, perPage = 10 } = params.pagination ?? {};
        return { data: all.slice((page - 1) * perPage, page * perPage), total: 30, totalIsEstimate: true };
      },
    } as never;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let api!: ReturnType<typeof useInfiniteResource>;
    function Feed() {
      api = useInfiniteResource("rows", { perPage: 10, maxPages: 2 });
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <DataProviderRoot provider={provider}>
          <Feed />
        </DataProviderRoot>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(api.rows.length).toBe(10));
    for (let i = 0; i < 2; i++) {
      const before = api.rows.length;
      act(() => api.fetchNextPage());
      await waitFor(() => expect(api.rows.length).toBeGreaterThan(before));
    }
    expect(api.rows).toHaveLength(30);
    expect(api.rows[0]!.id).toBe("o0");
    expect(api.totalIsEstimate).toBe(true);
    expect(api.hasPreviousPage).toBe(false);
  });
});

describe("useInfiniteResource keepPreviousData and the count", () => {
  it("a failed new search doesn't keep the old search's count", async () => {
    let fail = false;
    const provider = {
      ...createMockProvider({}),
      async getList() {
        if (fail) throw new Error("search failed");
        return { data: [{ id: "a" }], total: 50 };
      },
    } as never;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let api!: ReturnType<typeof useInfiniteResource>;
    function Feed() {
      api = useInfiniteResource("rows", { perPage: 10, keepPreviousData: true, searchFields: ["title"] });
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <DataProviderRoot provider={provider}>
          <Feed />
        </DataProviderRoot>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(api.total).toBe(50));
    fail = true;
    act(() => api.setSearch("zzz"));
    await waitFor(() => expect(api.query.isError).toBe(true));
    expect(api.total).toBeUndefined();
  });
});

describe("ViewerScope", () => {
  /** Shows whose data the cache holds under a key with no viewer in it (like a resource key). */
  function Whoami({ who }: { who: string }) {
    const q = useQuery({ queryKey: ["whoami"], queryFn: async () => who });
    return <p>{q.data ?? "loading"}</p>;
  }

  it("renders nothing for the children while the session loads", () => {
    const { wrap } = setup();
    render(wrap(<ViewerScope viewer={undefined} fallback={<p>starting</p>}><Whoami who="ann" /></ViewerScope>));
    expect(screen.getByText("starting")).toBeTruthy();
    expect(screen.queryByText("ann")).toBeNull();
  });

  it("never shows one viewer's cached data to the next", async () => {
    const { client, wrap } = setup();
    const view = (viewer: string | null, who: string) => wrap(<ViewerScope viewer={viewer}><Whoami who={who} /></ViewerScope>);
    const { rerender } = render(view("ann", "ann"));
    await screen.findByText("ann");
    rerender(view("bob", "bob"));
    // Bob's screen mounts fresh: it never renders Ann's cached value.
    expect(screen.queryByText("ann")).toBeNull();
    await screen.findByText("bob");
    expect(client.getQueryData(["whoami"])).toBe("bob");
  });

  it("signing out empties the cache too", async () => {
    const { client, wrap } = setup();
    const { rerender } = render(wrap(<ViewerScope viewer="ann"><Whoami who="ann" /></ViewerScope>));
    await screen.findByText("ann");
    rerender(wrap(<ViewerScope viewer={null}><p>signed out</p></ViewerScope>));
    await screen.findByText("signed out");
    expect(client.getQueryData(["whoami"])).toBeUndefined();
  });

  it("a fetch the new viewer's screen starts is never stranded", async () => {
    const { wrap } = setup();
    const view = (viewer: string, who: string) =>
      wrap(<ViewerScope viewer={viewer}><Whoami key={viewer} who={who} /></ViewerScope>);
    const { rerender } = render(view("ann", "ann"));
    await screen.findByText("ann");
    act(() => rerender(view("bob", "bob")));
    await screen.findByText("bob");
  });

  it("empties a restored cache for a different first viewer, keeps it for the one it was saved for", async () => {
    const restored = () => {
      const { client, wrap } = setup();
      client.setQueryData(["whoami"], "ann (restored)");
      return { client, wrap };
    };
    const other = restored();
    render(other.wrap(<ViewerScope viewer="bob" persistedViewer="ann"><p>bob home</p></ViewerScope>));
    await screen.findByText("bob home");
    expect(other.client.getQueryData(["whoami"])).toBeUndefined();
    cleanup();

    const same = restored();
    render(same.wrap(<ViewerScope viewer="ann" persistedViewer="ann"><p>ann home</p></ViewerScope>));
    await screen.findByText("ann home");
    expect(same.client.getQueryData(["whoami"])).toBe("ann (restored)");
  });

  it("passes the viewer and scope down, and a new scope re-renders readers without remounting them", async () => {
    const { wrap } = setup();
    const mounts: string[] = [];
    function Where() {
      const { viewer, scope } = useViewerScope();
      const [id] = useState(() => {
        mounts.push("mount");
        return Math.random();
      });
      return <p data-id={id}>{`${viewer}@${scope.orgId ?? "-"}`}</p>;
    }
    const view = (orgId: string) => wrap(<ViewerScope viewer="ann" scope={{ orgId }}><Where /></ViewerScope>);
    const { rerender } = render(view("p1"));
    await screen.findByText("ann@p1");
    rerender(view("p2"));
    await screen.findByText("ann@p2");
    expect(mounts).toEqual(["mount"]);
  });

  it("gives the scope's clock as scopeTimeZone: the valid zone passed, else the viewer's", async () => {
    const { wrap } = setup();
    function Clock() {
      const { timeZone, scopeTimeZone } = useViewerScope();
      return <p>{`${timeZone}|${scopeTimeZone}`}</p>;
    }
    const at = (scopeTimeZone?: string) =>
      wrap(
        <ViewerScope viewer="ann" timeZone="America/Los_Angeles" scopeTimeZone={scopeTimeZone}>
          <Clock />
        </ViewerScope>,
      );
    const { rerender } = render(at("Asia/Tokyo"));
    await screen.findByText("America/Los_Angeles|Asia/Tokyo");
    rerender(at(undefined));
    await screen.findByText("America/Los_Angeles|America/Los_Angeles");
    rerender(at("Not/AZone"));
    await screen.findByText("America/Los_Angeles|America/Los_Angeles");
  });

  it("useViewerScope needs a ViewerScope; useOptionalViewerScope is null without one", () => {
    const { wrap } = setup();
    function Optional() {
      return <p>{useOptionalViewerScope() === null ? "none" : "some"}</p>;
    }
    render(wrap(<Optional />));
    expect(screen.getByText("none")).toBeTruthy();
    function Required() {
      useViewerScope();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(wrap(<Required />))).toThrow(/needs a <ViewerScope>/);
    spy.mockRestore();
  });

  it("gives today on the viewer's clock, and query keys take it as their day", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    try {
      vi.setSystemTime(new Date("2026-10-27T03:30:00Z")); // still the 26th in Chicago
      const { wrap } = setup();
      const seen: string[] = [];
      function Today() {
        const ctx = useViewerScope();
        seen.push(`${ctx.timeZone} ${ctx.day} ${JSON.stringify(defineQueryKeys("x", { q: () => ({}) }).for(ctx).q()[2])}`);
        return <p>{ctx.day}</p>;
      }
      render(wrap(<ViewerScope viewer="ann" timeZone="America/Chicago"><Today /></ViewerScope>));
      await screen.findByText("2026-10-26");
      expect(seen.at(-1)).toBe('America/Chicago 2026-10-26 {"viewer":"ann","day":"2026-10-26"}');
      // Past midnight in Chicago, the next check rolls the day over.
      vi.setSystemTime(new Date("2026-10-27T05:30:00Z"));
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByText("2026-10-27")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
