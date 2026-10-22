/**
 * ResourcePage — reaching every row in `resource` mode.
 *
 * The defect: `resource` mode called `useResource` with its default page of
 * 25 rows and rendered no server pager, so row 26 onward was unreachable and
 * nothing on screen said so. Two ways out, both locked here:
 *
 * - `pagination="client"` (default) fetches up to `clientRowLimit` rows and
 *   keeps every client-side behaviour; past the limit it SAYS so instead of
 *   truncating silently.
 * - `pagination="server"` pages through the provider: the pager, search,
 *   sort and status chips all become queries.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";

interface Post {
  [key: string]: unknown;
  id: string;
  title: string;
  status: string;
}

const posts: Post[] = Array.from({ length: 30 }, (_, i) => ({
  id: String(i + 1),
  title: `Post ${String(i + 1).padStart(2, "0")}`,
  status: i % 2 === 0 ? "draft" : "live",
}));

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderPosts(
  extra: Partial<ResourcePageProps<Post>> = {},
  provider = createMockProvider({ posts }),
) {
  return render(
    <GenesisProvider provider={provider}>
      <ResourcePage<Post>
        resource="posts"
        title="Posts"
        columns={["title", "status"]}
        detail="none"
        keyboardNavigation={false}
        {...extra}
      />
    </GenesisProvider>,
  );
}

const bodyRows = () => document.querySelectorAll("tbody tr");

describe('ResourcePage — pagination="client" (default)', () => {
  it("fetches past the old 25-row page, so every row is reachable", async () => {
    const provider = createMockProvider({ posts });
    const getList = vi.spyOn(provider, "getList");
    renderPosts({}, provider);

    // Row 30 is reachable through client search — it was never fetched before.
    await waitFor(() => expect(bodyRows().length).toBeGreaterThan(0));
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "Post 30" },
    });
    await waitFor(() => expect(screen.getByText("Post 30")).toBeTruthy());
    expect(getList.mock.calls[0]?.[1]?.pagination?.perPage).toBe(1000);
    expect(screen.queryByTestId("resource-page-truncated")).toBeNull();
  });

  it("says how many rows it shows when the resource outgrows clientRowLimit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderPosts({ clientRowLimit: 10 });

    const notice = await screen.findByTestId("resource-page-truncated");
    expect(notice.textContent).toBe("Showing the first 10 of 30 records.");
    expect(notice.getAttribute("role")).toBe("status");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pagination="server"'));
  });

  it("lets an explicit resourceOptions.defaultPerPage win", async () => {
    const provider = createMockProvider({ posts });
    const getList = vi.spyOn(provider, "getList");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderPosts({ resourceOptions: { defaultPerPage: 5 } }, provider);
    await waitFor(() => expect(getList).toHaveBeenCalled());
    expect(getList.mock.calls[0]?.[1]?.pagination?.perPage).toBe(5);
  });
});

describe('ResourcePage — pagination="server"', () => {
  it("renders the pager and pages through the provider", async () => {
    renderPosts({ pagination: "server" });

    await waitFor(() => expect(bodyRows().length).toBe(25));
    expect(screen.getByTestId("resource-page-range").textContent).toBe(
      "Showing 1-25 of 30",
    );
    expect(screen.getByTestId("resource-page-indicator").textContent).toBe(
      "Page 1 of 2",
    );

    fireEvent.click(screen.getByTestId("resource-page-next"));
    await waitFor(() => expect(screen.getByText("Post 26")).toBeTruthy());
    expect(bodyRows().length).toBe(5);
    expect(screen.getByTestId("resource-page-range").textContent).toBe(
      "Showing 26-30 of 30",
    );
    expect(
      (screen.getByTestId("resource-page-next") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("keeps the current page on screen while the next one loads", async () => {
    renderPosts(
      { pagination: "server" },
      createMockProvider({ posts }, { delay: 80 }),
    );
    await waitFor(() => expect(bodyRows().length).toBe(25));

    fireEvent.click(screen.getByTestId("resource-page-next"));
    // No skeleton flash between pages: the old rows stay, marked busy.
    expect(document.querySelector('[data-testid="page-loader"]')).toBeNull();
    expect(bodyRows().length).toBe(25);
    await waitFor(() =>
      expect(
        screen.getByTestId("resource-page-pagination").getAttribute("aria-busy"),
      ).toBe("true"),
    );
    await waitFor(() => expect(screen.getByText("Post 26")).toBeTruthy());
    expect(
      screen.getByTestId("resource-page-pagination").getAttribute("aria-busy"),
    ).toBeNull();
  });

  it("does not re-page the server's page in the table", async () => {
    renderPosts({ pagination: "server" });
    await waitFor(() => expect(bodyRows().length).toBe(25));
    // DataTable's own "1 / 2" pager would slice the slice.
    expect(screen.queryByText("1 / 2")).toBeNull();
  });

  it("sends search to the provider, debounced, and returns to page 1", async () => {
    const provider = createMockProvider({ posts });
    const getList = vi.spyOn(provider, "getList");
    renderPosts({ pagination: "server", searchFields: ["title"] }, provider);
    await waitFor(() => expect(bodyRows().length).toBe(25));
    fireEvent.click(screen.getByTestId("resource-page-next"));
    await waitFor(() => expect(screen.getByText("Post 26")).toBeTruthy());

    const before = getList.mock.calls.length;
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: "Post 0" } });
    fireEvent.change(input, { target: { value: "Post 07" } });

    await waitFor(() => expect(bodyRows().length).toBe(1));
    expect(screen.getByText("Post 07")).toBeTruthy();
    const searched = getList.mock.calls
      .slice(before)
      .map((c) => c[1]?.search?.query)
      .filter(Boolean);
    // One query for the settled text — not one per keystroke, and no
    // page-1 fetch of the OLD query before it.
    expect(searched).toEqual(["Post 07"]);
    expect(
      getList.mock.calls.slice(before).filter((c) => !c[1]?.search),
    ).toEqual([]);
    const last = getList.mock.calls.at(-1)?.[1];
    expect(last?.pagination?.page).toBe(1);
    expect(last?.search).toEqual({ query: "Post 07", fields: ["title"] });
  });

  it("hides the search box when no searchFields tell the provider what to match", async () => {
    renderPosts({ pagination: "server" });
    await waitFor(() => expect(bodyRows().length).toBe(25));
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
  });

  it("sends a status chip to the provider as an `in` filter", async () => {
    const provider = createMockProvider({ posts });
    const getList = vi.spyOn(provider, "getList");
    renderPosts(
      {
        pagination: "server",
        statusFilter: { field: "status", options: ["draft", "live"] },
      },
      provider,
    );
    await waitFor(() => expect(bodyRows().length).toBe(25));

    fireEvent.click(screen.getByRole("button", { name: /draft/i }));
    await waitFor(() => expect(bodyRows().length).toBe(15));
    expect(getList.mock.calls.at(-1)?.[1]?.filters).toEqual([
      { field: "status", operator: "in", value: ["draft"] },
    ]);
  });

  it("steps back to the last page when its only row is deleted", async () => {
    renderPosts(
      { pagination: "server", detail: "panel", allowDelete: true },
      createMockProvider({ posts: posts.slice(0, 26) }),
    );
    await waitFor(() => expect(bodyRows().length).toBe(25));
    fireEvent.click(screen.getByTestId("resource-page-next"));
    fireEvent.click(await screen.findByText("Post 26"));
    fireEvent.click(await screen.findByTestId("detail-panel-delete"));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    // Not stranded on an empty page 2 with no pager.
    await waitFor(() => expect(bodyRows().length).toBe(25));
    expect(screen.getByTestId("resource-page-indicator").textContent).toBe(
      "Page 1 of 1",
    );
  });

  it("keeps resourceOptions.defaultSort on mount", async () => {
    const provider = createMockProvider({ posts });
    const getList = vi.spyOn(provider, "getList");
    renderPosts(
      {
        pagination: "server",
        resourceOptions: { defaultSort: { field: "title", order: "desc" } },
      },
      provider,
    );
    await waitFor(() => expect(screen.getByText("Post 30")).toBeTruthy());
    await act(async () => {});
    for (const call of getList.mock.calls) {
      expect(call[1]?.sort).toEqual({ field: "title", order: "desc" });
    }
  });
});
