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
      return <p data-id={id}>{`${viewer}@${scope.practiceId ?? "-"}`}</p>;
    }
    const view = (practiceId: string) => wrap(<ViewerScope viewer="ann" scope={{ practiceId }}><Where /></ViewerScope>);
    const { rerender } = render(view("p1"));
    await screen.findByText("ann@p1");
    rerender(view("p2"));
    await screen.findByText("ann@p2");
    expect(mounts).toEqual(["mount"]);
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
