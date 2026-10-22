// @feat:list-url-state
/**
 * ResourcePage `urlState` / useResourceUrlState: the open record, search,
 * sort and page live in the URL, so a link reopens the same view and Back
 * closes a record that was opened.
 */
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import type React from "react";
import { QueryClient } from "@tanstack/react-query";
import { DataReadError } from "@marktiderman/genesis-core/provider";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { ResourcePage } from "../ResourcePage";
import { useResourceUrlState } from "../../../hooks/use-resource-url-state";
import type { SearchParamsAdapter } from "../../../navigation";

interface Row {
  [key: string]: unknown;
  id: string;
  name: string;
}

const rows: Row[] = [
  { id: "1", name: "Ada" },
  { id: "2", name: "Bo" },
  { id: "3", name: "Cy" },
];

/** An in-memory adapter that records each write and whether it replaced. */
function memoryAdapter(initial = "") {
  const log: { url: string; replace: boolean }[] = [];
  let set: (next: URLSearchParams) => void = () => {};
  function useAdapter(): SearchParamsAdapter {
    const [sp, setSp] = useState(() => new URLSearchParams(initial));
    set = setSp;
    return {
      searchParams: sp,
      setSearchParams: (next, options) => {
        log.push({ url: next.toString(), replace: !!options?.replace });
        setSp(new URLSearchParams(next));
      },
    };
  }
  return { useAdapter, log, navigate: (q: string) => act(() => set(new URLSearchParams(q))) };
}

beforeEach(() => {
  localStorage.clear();
});

describe("useResourceUrlState", () => {
  it("reads id, page, sort and q, ignoring malformed values", () => {
    const { useAdapter } = memoryAdapter("id=7&page=3&sort=name:desc&q=ada");
    const { result } = renderHook(() => useResourceUrlState({ searchParams: useAdapter() }));
    expect(result.current).toMatchObject({ detailId: "7", page: 3, sort: { field: "name", order: "desc" }, q: "ada" });

    const bad = memoryAdapter("page=-2&sort=name");
    const { result: r2 } = renderHook(() => useResourceUrlState({ searchParams: bad.useAdapter() }));
    expect(r2.current).toMatchObject({ page: null, sort: null, q: "", detailId: null });
  });

  it("reads only a positive safe integer as the page", () => {
    const read = (query: string) => {
      const { useAdapter } = memoryAdapter(query);
      return renderHook(() => useResourceUrlState({ searchParams: useAdapter() })).result.current.page;
    };
    expect(read(`page=${"9".repeat(400)}`)).toBeNull(); // Number() gives Infinity
    expect(read(`page=${Number.MAX_SAFE_INTEGER + 1}`)).toBeNull();
    expect(read("page=0")).toBeNull();
    expect(read("page=1.5")).toBeNull();
    expect(read(`page=${Number.MAX_SAFE_INTEGER}`)).toBe(Number.MAX_SAFE_INTEGER);
    expect(read("page=1")).toBe(1);
  });

  it("pushes when opening a record and replaces when closing or writing state", () => {
    const { useAdapter, log } = memoryAdapter();
    const { result } = renderHook(() => useResourceUrlState({ searchParams: useAdapter() }));
    act(() => result.current.setDetailId("2"));
    act(() => result.current.setDetailId(null));
    act(() => result.current.write({ q: "bo", page: 2, sort: { field: "name", order: "asc" } }));
    act(() => result.current.write({ page: 1, q: "" }));
    expect(log).toEqual([
      { url: "id=2", replace: false },
      { url: "", replace: true },
      { url: "page=2&sort=name%3Aasc&q=bo", replace: true },
      { url: "sort=name%3Aasc", replace: true },
    ]);
  });

  it("uses renamed keys", () => {
    const { useAdapter } = memoryAdapter("person=5");
    const { result } = renderHook(() =>
      useResourceUrlState({ searchParams: useAdapter(), params: { detail: "person" } }),
    );
    expect(result.current.detailId).toBe("5");
  });
});

describe("ResourcePage urlState", () => {
  function Page({ adapter }: { adapter: () => SearchParamsAdapter }) {
    const searchParams = adapter();
    return (
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Row> data={rows} title="People" columns={["name"]} titleField="name" defaultView="table" urlState={searchParams} />
      </GenesisProvider>
    );
  }

  it("opens the record a link names", () => {
    const { useAdapter } = memoryAdapter("id=2");
    render(<Page adapter={useAdapter} />);
    expect(within(screen.getByRole("dialog")).getAllByText("Bo").length).toBeGreaterThan(0);
  });

  it("puts an opened record in the URL, and Back (the URL losing it) closes it", () => {
    const { useAdapter, log, navigate } = memoryAdapter();
    render(<Page adapter={useAdapter} />);
    fireEvent.click(screen.getByText("Cy"));
    expect(log.at(-1)).toEqual({ url: "id=3", replace: false });
    expect(screen.getByRole("dialog")).toBeTruthy();
    navigate("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("drops the id when the record is closed", () => {
    const { useAdapter, log } = memoryAdapter("id=1");
    render(<Page adapter={useAdapter} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(log.at(-1)).toEqual({ url: "", replace: true });
  });

  it("starts the search from q and writes typing back", () => {
    const { useAdapter, log } = memoryAdapter("q=bo");
    render(<Page adapter={useAdapter} />);
    const box = screen.getByPlaceholderText(/search/i) as HTMLInputElement;
    expect(box.value).toBe("bo");
    fireEvent.change(box, { target: { value: "cy" } });
    expect(log.at(-1)).toEqual({ url: "q=cy", replace: true });
  });

  const nameHeader = () => screen.getByRole("columnheader", { name: /name/i });
  const shownNames = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell").map((c) => c.textContent ?? "").join("|"))
      .map((t) => rows.find((row) => t.includes(row.name))?.name);

  it("writes a header sort to the URL", () => {
    const { useAdapter, log } = memoryAdapter();
    render(<Page adapter={useAdapter} />);
    fireEvent.click(within(nameHeader()).getByRole("button"));
    expect(log.at(-1)).toEqual({ url: "sort=name%3Aasc", replace: true });
    expect(nameHeader().getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(within(nameHeader()).getByRole("button"));
    expect(log.at(-1)).toEqual({ url: "sort=name%3Adesc", replace: true });
    expect(shownNames()).toEqual(["Cy", "Bo", "Ada"]);
    fireEvent.click(within(nameHeader()).getByRole("button"));
    expect(log.at(-1)).toEqual({ url: "", replace: true });
    expect(nameHeader().getAttribute("aria-sort")).toBeNull();
  });

  it("shows the URL's sort in the table header on load", () => {
    const { useAdapter } = memoryAdapter("sort=name:desc");
    render(<Page adapter={useAdapter} />);
    expect(nameHeader().getAttribute("aria-sort")).toBe("descending");
    expect(shownNames()).toEqual(["Cy", "Bo", "Ada"]);
  });
});

describe('ResourcePage urlState with pagination="server"', () => {
  const posts = Array.from({ length: 30 }, (_, i) => ({
    id: String(i + 1),
    title: `Post ${String(i + 1).padStart(2, "0")}`,
  }));

  function Posts({ adapter }: { adapter: () => SearchParamsAdapter }) {
    const searchParams = adapter();
    return (
      <GenesisProvider provider={createMockProvider({ posts })}>
        <ResourcePage
          resource="posts"
          title="Posts"
          columns={["title"]}
          searchFields={["title"]}
          pagination="server"
          detail="none"
          keyboardNavigation={false}
          urlState={searchParams}
        />
      </GenesisProvider>
    );
  }

  it("restores the page and search together, without the search resetting the page", async () => {
    const { useAdapter } = memoryAdapter("page=2&q=Post");
    render(<Posts adapter={useAdapter} />);
    await waitFor(() => expect(screen.getByText("Post 26")).toBeTruthy());
    expect(screen.getByTestId("resource-page-indicator").textContent).toBe("Page 2 of 2");
  });

  it("writes the page as it changes", async () => {
    const { useAdapter, log } = memoryAdapter();
    render(<Posts adapter={useAdapter} />);
    await waitFor(() => expect(screen.getByText("Post 01")).toBeTruthy());
    fireEvent.click(screen.getByTestId("resource-page-next"));
    await waitFor(() => expect(log.at(-1)).toEqual({ url: "page=2", replace: true }));
  });
});

describe("ResourcePage urlState follow-ups", () => {
  function Page({ adapter, ...extra }: { adapter: () => SearchParamsAdapter } & Partial<React.ComponentProps<typeof ResourcePage<Row>>>) {
    const searchParams = adapter();
    return (
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Row> data={rows} title="People" columns={["name"]} titleField="name" defaultView="table" urlState={searchParams} {...extra} />
      </GenesisProvider>
    );
  }

  it("shows a not-found state for a linked record that isn't there", () => {
    const { useAdapter } = memoryAdapter("id=99");
    render(<Page adapter={useAdapter} />);
    expect(screen.getByTestId("resource-page-link-missing")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getAllByText("Record not found").length).toBeGreaterThan(0);
  });

  it("doesn't call a linked record missing when data is one server-controlled page", () => {
    const { useAdapter } = memoryAdapter("id=99");
    render(<Page adapter={useAdapter} page={1} perPage={3} total={10} onPageChange={() => {}} />);
    expect(screen.queryByTestId("resource-page-link-missing")).toBeNull();
    expect(screen.queryByText("Record not found")).toBeNull();
  });

  it("orders by a URL sort on a field the table doesn't show without TanStack errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { useAdapter } = memoryAdapter("sort=missing:desc");
    function NoColumns() {
      const searchParams = useAdapter();
      return (
        <GenesisProvider mock={{ datasets: {} }}>
          <ResourcePage<Row>
            data={rows}
            title="People"
            titleField="name"
            defaultView="table"
            urlState={searchParams}
          />
        </GenesisProvider>
      );
    }
    render(<NoColumns />);
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
    expect(error.mock.calls.filter((c) => String(c[0]).includes("does not exist"))).toEqual([]);
    error.mockRestore();
  });

  it("ignores ?id= when there is no peek (detail none)", () => {
    const { useAdapter } = memoryAdapter("id=1");
    render(<Page adapter={useAdapter} detail="none" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("drops a URL sort that names no sortable column", () => {
    const { useAdapter, log } = memoryAdapter("sort=secret:asc");
    render(<Page adapter={useAdapter} />);
    expect(log.at(-1)?.url ?? "").not.toContain("sort=");
  });
});

describe('ResourcePage urlState: a linked record outside the loaded rows', () => {
  const posts = Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), title: `Post ${String(i + 1).padStart(2, "0")}` }));

  function Posts({ adapter, provider }: { adapter: () => SearchParamsAdapter; provider: ReturnType<typeof createMockProvider> }) {
    const searchParams = adapter();
    return (
      <GenesisProvider provider={provider}>
        <ResourcePage resource="posts" title="Posts" columns={["title"]} titleField="title" pagination="server" keyboardNavigation={false} urlState={searchParams} />
      </GenesisProvider>
    );
  }

  it("fetches it with getOne and opens it", async () => {
    const provider = createMockProvider({ posts });
    const { useAdapter } = memoryAdapter("id=30");
    render(<Posts adapter={useAdapter} provider={provider} />);
    await waitFor(() => expect(within(screen.getByRole("dialog")).getAllByText("Post 30").length).toBeGreaterThan(0));
  });

  it("says when the user can't read it", async () => {
    const base = createMockProvider({ posts });
    const provider = {
      ...base,
      getOne: () => Promise.reject(new DataReadError("forbidden", "You don't have access to this post.")),
    };
    const { useAdapter } = memoryAdapter("id=30");
    render(
      <GenesisProvider provider={provider} queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PostsWith adapter={useAdapter} />
      </GenesisProvider>,
    );
    await waitFor(() => expect(screen.getByText("You don't have access to this post.")).toBeTruthy());
  });

  function PostsWith({ adapter }: { adapter: () => SearchParamsAdapter }) {
    const searchParams = adapter();
    return <ResourcePage resource="posts" title="Posts" columns={["title"]} titleField="title" pagination="server" keyboardNavigation={false} urlState={searchParams} />;
  }
});
