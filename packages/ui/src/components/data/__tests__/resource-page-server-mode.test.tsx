/**
 * ResourcePage — server-controlled list mode and the level-2 / level-3
 * passthroughs.
 *
 * The regression this locks out: a server-paginated list handed page N of a
 * result set had that page re-searched, re-sorted and re-paginated
 * client-side, so the page showed a filtered slice of a slice. That
 * double-work is why a server-paginated dashboard could not adopt
 * ResourcePage at all, so the assertions here are about what ResourcePage
 * does NOT do to `data` as much as what it renders.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";

interface Post {
  [key: string]: unknown;
  id: string;
  title: string;
}

/** Deliberately NOT in alphabetical order — a client-side sort would move these. */
const serverPage: Post[] = [
  { id: "3", title: "Zulu" },
  { id: "1", title: "Alpha" },
  { id: "2", title: "Mike" },
];

beforeEach(() => {
  localStorage.clear();
});

function renderServerPage(extra: Partial<ResourcePageProps<Post>> = {}) {
  return render(
    <GenesisProvider mock={{ datasets: {} }}>
      <ResourcePage<Post>
        title="Posts"
        data={serverPage}
        total={97}
        columns={["title"]}
        detail="none"
        page={2}
        perPage={3}
        onPageChange={() => {}}
        {...extra}
      />
    </GenesisProvider>,
  );
}

/** Row titles in DOM order, from the table body. */
function renderedTitles(): string[] {
  return Array.from(document.querySelectorAll("tbody tr")).map(
    (row) => row.textContent?.trim() ?? "",
  );
}

describe("ResourcePage — server-controlled mode", () => {
  it("renders the server's rows in the server's order", async () => {
    renderServerPage();
    await waitFor(() => expect(renderedTitles().length).toBe(3));
    expect(renderedTitles()).toEqual(["Zulu", "Alpha", "Mike"]);
  });

  it("does not re-filter the server's rows when the user types a search", async () => {
    const onSearchChange = vi.fn();
    renderServerPage({ onSearchChange, searchFields: ["title"] });
    await waitFor(() => expect(renderedTitles().length).toBe(3));

    const input = document.querySelector(
      'input[type="text"], input:not([type])',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Alpha" } });

    // The server is told, and every row it already sent stays on screen —
    // client-side mode would have dropped two of the three.
    expect(onSearchChange).toHaveBeenCalledWith("Alpha");
    await waitFor(() =>
      expect(renderedTitles()).toEqual(["Zulu", "Alpha", "Mike"]),
    );
  });

  it("resets to page 1 when the search changes", async () => {
    const onPageChange = vi.fn();
    renderServerPage({ onSearchChange: () => {}, onPageChange });
    await waitFor(() => expect(renderedTitles().length).toBe(3));

    const input = document.querySelector(
      'input[type="text"], input:not([type])',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "x" } });

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("withdraws the table's client-side header sort so it cannot reorder one page", async () => {
    renderServerPage({ onSortChange: () => {} });
    await waitFor(() => expect(renderedTitles().length).toBe(3));

    const header = screen.getByText("Title");
    fireEvent.click(header);
    // Unchanged: a header click sorts nothing, because sorting is the
    // server's job and it only holds one page.
    expect(renderedTitles()).toEqual(["Zulu", "Alpha", "Mike"]);
  });

  it("reports the server's total, not the length of the page it was handed", async () => {
    renderServerPage();
    expect((await screen.findByTestId("resource-page-range")).textContent).toBe(
      "Showing 4-6 of 97",
    );
    expect(screen.getByTestId("resource-page-indicator").textContent).toBe(
      "Page 2 of 33",
    );
  });

  it("gets the short final page's range and page count right", async () => {
    // total = 97, real server page size = 25, but the last page only has 22
    // rows. `page.data.length` (22) must NOT be used as the pagination
    // divisor — that previously produced totalPages = ceil(97/22) = 5
    // (should be 4), a wrong range, and a Next button that stayed enabled
    // on the actual last page. With `perPage` supplied explicitly this is
    // no longer inferred from the short page at all.
    const shortFinalPage: Post[] = Array.from({ length: 22 }, (_, i) => ({
      id: String(i),
      title: `Row ${i}`,
    }));
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={shortFinalPage}
          total={97}
          columns={["title"]}
          detail="none"
          page={4}
          perPage={25}
          onPageChange={() => {}}
        />
      </GenesisProvider>,
    );
    expect((await screen.findByTestId("resource-page-range")).textContent).toBe(
      "Showing 76-97 of 97",
    );
    const indicator = screen.getByTestId("resource-page-indicator");
    expect(indicator.textContent).toBe("Page 4 of 4");
    const next = screen.getByTestId("resource-page-next") as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it("renders an error instead of a pager when onPageChange is supplied without perPage", async () => {
    renderServerPage({ perPage: undefined });
    expect(
      await screen.findByTestId("resource-page-pagination-error"),
    ).toBeTruthy();
    expect(screen.queryByTestId("resource-page-pagination")).toBeNull();
  });

  it("resets to page 1 when a status filter changes", async () => {
    const onPageChange = vi.fn();
    renderServerPage({
      page: 3,
      onFiltersChange: () => {},
      onPageChange,
      statusFilter: { field: "status", options: ["draft"] },
    });
    await waitFor(() => expect(renderedTitles().length).toBe(3));

    fireEvent.click(await screen.findByText("draft"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("pages forward and back through onPageChange", async () => {
    const onPageChange = vi.fn();
    renderServerPage({ onPageChange });

    fireEvent.click(await screen.findByTestId("resource-page-next"));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByTestId("resource-page-prev"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("disables Previous on the first page and Next on the last", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={serverPage}
          total={3}
          columns={["title"]}
          detail="none"
          page={1}
          perPage={3}
          onPageChange={() => {}}
        />
      </GenesisProvider>,
    );
    const prev = (await screen.findByTestId(
      "resource-page-prev",
    )) as HTMLButtonElement;
    const next = screen.getByTestId("resource-page-next") as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });

  it("renders no pager when onPageChange is absent — a dead control is worse than none", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={serverPage}
          total={97}
          columns={["title"]}
          detail="none"
          onSearchChange={() => {}}
        />
      </GenesisProvider>,
    );
    await waitFor(() => expect(renderedTitles().length).toBe(3));
    expect(screen.queryByTestId("resource-page-pagination")).toBeNull();
  });

  it("tells the server when Clear all is used", async () => {
    // "Clear all" is only offered once a chip filter is active, so the test
    // engages one. Without the callbacks below, clearing would empty the
    // controls and leave the same server rows on screen — a silent no-op.
    const onSearchChange = vi.fn();
    const onSortChange = vi.fn();
    const onPageChange = vi.fn();
    renderServerPage({
      onSearchChange,
      onSortChange,
      onPageChange,
      statusFilter: { field: "status", options: ["draft"] },
    });
    await waitFor(() => expect(renderedTitles().length).toBe(3));

    fireEvent.click(await screen.findByText("draft"));
    onPageChange.mockClear();

    fireEvent.click(await screen.findByText("Clear all"));
    expect(onSearchChange).toHaveBeenCalledWith("");
    expect(onSortChange).toHaveBeenCalledWith(null);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});

describe("ResourcePage — client-side mode is unchanged", () => {
  it("still filters and sorts client-side when no controlled prop is given", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={serverPage}
          total={3}
          columns={["title"]}
          detail="none"
          searchFields={["title"]}
        />
      </GenesisProvider>,
    );
    await waitFor(() => expect(renderedTitles().length).toBe(3));

    const input = document.querySelector(
      'input[type="text"], input:not([type])',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Alpha" } });

    await waitFor(() => expect(renderedTitles()).toEqual(["Alpha"]));
    expect(screen.queryByTestId("resource-page-pagination")).toBeNull();
  });
});

describe("ResourcePage — level-2 / level-3 passthroughs", () => {
  it("passes savedViews through to DataFilters", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={serverPage}
          total={3}
          columns={["title"]}
          detail="none"
          savedViews={[{ id: "v1", name: "My saved view", filters: {} }]}
          canSaveViews
          onLoadView={() => {}}
        />
      </GenesisProvider>,
    );
    // The views control only renders when savedViews / canSaveViews arrive.
    expect(await screen.findByText("Views")).toBeTruthy();
  });

  it("turns the column-visibility control off at the instance level", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={serverPage}
          total={3}
          columns={["title"]}
          detail="none"
          columnVisibility={false}
        />
      </GenesisProvider>,
    );
    await waitFor(() => expect(renderedTitles().length).toBe(3));
    expect(screen.queryByText("Columns")).toBeNull();
  });

  it("offers the column-visibility control by default", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={serverPage}
          total={3}
          columns={["title"]}
          detail="none"
        />
      </GenesisProvider>,
    );
    expect(await screen.findByText("Columns")).toBeTruthy();
  });

  it("lets an explicit perPage beat the stored per-user page size", async () => {
    localStorage.setItem(
      "genesis-settings-posts-page",
      JSON.stringify({ pageSize: 10, density: "comfortable" }),
    );
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={serverPage}
          total={97}
          columns={["title"]}
          detail="none"
          viewSettingsKey="posts-page"
          page={1}
          perPage={3}
          onPageChange={() => {}}
        />
      </GenesisProvider>,
    );
    // 97 / 3 = 33 pages. Had the stored 10 won, it would read 10.
    expect(
      (await screen.findByTestId("resource-page-indicator")).textContent,
    ).toBe("Page 1 of 33");
  });

  it("calls onPerPageChange when the header's view-settings page-size control changes", async () => {
    const onPerPageChange = vi.fn();
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={serverPage}
          total={97}
          columns={["title"]}
          detail="none"
          page={1}
          perPage={3}
          onPageChange={() => {}}
          onPerPageChange={onPerPageChange}
        />
      </GenesisProvider>,
    );
    await waitFor(() => expect(renderedTitles().length).toBe(3));

    fireEvent.click(screen.getByTestId("view-settings-trigger"));
    fireEvent.click(await screen.findByTestId("view-settings-page-size"));
    fireEvent.click(await screen.findByText("50 items"));

    // The control is wired to handlePageSizeChange, which forwards the
    // picked size to the caller — without this it would silently update
    // the persisted per-user setting and never tell the server.
    expect(onPerPageChange).toHaveBeenCalledWith(50);
  });
});
