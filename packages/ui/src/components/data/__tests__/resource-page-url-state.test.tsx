// @feat:list-url-state
/**
 * ResourcePage `urlState` / useResourceUrlState: the open record, search,
 * sort and page live in the URL, so a link reopens the same view and Back
 * closes a record that was opened.
 */
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

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
