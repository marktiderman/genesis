/**
 * ResourcePage `variant="embedded"`: a list inside another page gets a
 * toolbar header with only its actions, no filter row unless it has
 * something to filter by, and no page-level keyboard shortcuts. Explicit
 * props still win.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";

interface Row {
  [key: string]: unknown;
  id: string;
  name: string;
}
const rows: Row[] = [
  { id: "1", name: "Ada" },
  { id: "2", name: "Bo" },
];

beforeEach(() => localStorage.clear());

function renderPage(extra: Partial<ResourcePageProps<Row>> = {}) {
  return render(
    <GenesisProvider mock={{ datasets: {} }}>
      <ResourcePage<Row>
        data={rows}
        title="People"
        columns={["name"]}
        detail="none"
        onCreate={() => {}}
        createLabel="New person"
        {...extra}
      />
    </GenesisProvider>,
  );
}

const heading = () => screen.queryByRole("heading", { name: "People" });
const search = () => screen.queryByPlaceholderText(/search/i);

describe('ResourcePage variant="embedded"', () => {
  it("keeps the page's full header and filter row by default", () => {
    renderPage();
    expect(heading()).toBeTruthy();
    expect(search()).toBeTruthy();
  });

  it("shows only the actions: no title, no count, no filter row", () => {
    renderPage({ variant: "embedded" });
    expect(heading()).toBeNull();
    expect(search()).toBeNull();
    expect(screen.queryByText(/2 people|2 records/i)).toBeNull();
    expect(screen.getByRole("button", { name: /New person/ })).toBeTruthy();
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("offers the table/cards toggle only when there is a card layout", () => {
    const { unmount } = renderPage({ variant: "embedded" });
    expect(screen.queryByRole("button", { name: /grid view/i })).toBeNull();
    unmount();
    renderPage({ variant: "embedded", renderCard: (r) => <div>{r.name}</div> });
    expect(screen.getByRole("button", { name: /grid view/i })).toBeTruthy();
  });

  it("shows a filter row when it has something to filter by", () => {
    renderPage({ variant: "embedded", searchFields: ["name"] });
    expect(search()).toBeTruthy();
  });

  it("shows the filter row for saved views, and when the list is already filtered", () => {
    const { unmount } = renderPage({ variant: "embedded", savedViews: [{ id: "v1", name: "Mine", filters: {} }] });
    expect(screen.getByText(/views/i)).toBeTruthy();
    unmount();
    // A search arriving from the URL: the row is there to see it and clear it.
    renderPage({
      variant: "embedded",
      urlState: { searchParams: new URLSearchParams("q=ada"), setSearchParams: () => {} },
    });
    expect((search() as HTMLInputElement | null)?.value).toBe("ada");
  });

  it("doesn't show the filter row for a sort from a column header", () => {
    renderPage({ variant: "embedded", columns: [{ key: "name", header: "Name", sortable: true }] });
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    expect(search()).toBeNull();
  });

  it("keeps the full header, count included, with an explicit header=\"page\"", () => {
    renderPage({ variant: "embedded", header: "page" });
    expect(heading()).toBeTruthy();
    expect(screen.getByText(/2\b/)).toBeTruthy();
  });

  it("lets explicit props win over the preset", () => {
    renderPage({
      variant: "embedded",
      header: "page",
      slotProps: { shell: { headerOptions: { showCount: true } } },
    });
    expect(heading()).toBeTruthy();
  });

  it("turns page-level keyboard shortcuts off unless asked for", () => {
    const { unmount } = renderPage({ variant: "embedded", renderCard: (r) => <div>{r.name}</div>, defaultView: "grid" });
    fireEvent.keyDown(document.body, { key: "j" });
    expect(document.querySelector("[data-nav-item].ring-2")).toBeNull();
    unmount();
    renderPage({ renderCard: (r) => <div>{r.name}</div>, defaultView: "grid" });
    fireEvent.keyDown(document.body, { key: "j" });
    expect(document.querySelector("[data-nav-item].ring-2")).toBeTruthy();
  });
});
