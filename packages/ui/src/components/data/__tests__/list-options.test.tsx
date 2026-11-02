/**
 * List options, all opt-in except the overflow fix:
 * - DataTable cells keep what they draw inside their column (fixed layout): a long value in a
 *   rendered column never prints over the next one. On by default.
 * - DataTable `minWidth` ("auto": the sized columns plus room for each flexible one).
 * - `sizeColumns` (ResourceViewDefaultsProvider): column widths by what each shows.
 * - `compactWhenShort`: a short embedded list drops its search, Columns bar and pager.
 * - `pagerJumps`: first and last page buttons and "Page n of m".
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { DataTable, type DataTableColumn } from "../DataTable";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";
import { ResourceView, ResourceViewDefaultsProvider } from "../resource-view";

type Person = { id: string; name: string; email: string };
const people: Person[] = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  name: `Person ${String(i + 1).padStart(2, "0")}`,
  email: `someone.with.a.very.long.address.${i}@a-long-domain-name.example`,
}));
const columns: DataTableColumn<Person>[] = [
  { key: "name", header: "Name" },
  { key: "email", header: "Email", width: 122, render: (p) => <a href={`mailto:${p.email}`}>{p.email}</a> },
];

beforeEach(() => localStorage.clear());

const cellOf = (text: string) => screen.getByText(text).closest("td")!;

describe("DataTable cells", () => {
  it("keep a long value in a rendered column inside its narrow column", () => {
    render(<DataTable items={people.slice(0, 1)} columns={columns} getKey={(p) => p.id} />);
    const email = cellOf(people[0]!.email);
    // The column is 122px; the address is far wider. Clipped at the cell, never drawn over Name.
    expect(email.className).toContain("overflow-hidden");
    // The ellipsis and one line stay clipCells' (opt-in).
    expect(email.className).not.toContain("text-ellipsis");
    expect(document.querySelectorAll("col")[1]!.getAttribute("style")).toContain("width: 122px");
  });

  it("clipCells adds the ellipsis on one line", () => {
    render(<DataTable items={people.slice(0, 1)} columns={columns} getKey={(p) => p.id} clipCells />);
    expect(cellOf(people[0]!.email).className).toContain("text-ellipsis");
  });
});

describe("DataTable minWidth", () => {
  it("has none by default", () => {
    render(<DataTable items={people.slice(0, 1)} columns={columns} getKey={(p) => p.id} />);
    expect(screen.getByRole("table").style.minWidth).toBe("");
  });

  it('"auto" is each sized column plus 200px for each flexible one; a number is itself', () => {
    const { unmount } = render(<DataTable items={people.slice(0, 1)} columns={columns} getKey={(p) => p.id} minWidth="auto" />);
    expect(screen.getByRole("table").style.minWidth).toBe("322px");
    unmount();
    render(<DataTable items={people.slice(0, 1)} columns={columns} getKey={(p) => p.id} minWidth={640} />);
    expect(screen.getByRole("table").style.minWidth).toBe("640px");
  });
});

describe("DataTable pagerJumps", () => {
  const table = (extra: { pagerJumps?: boolean } = {}) => (
    <DataTable items={people} columns={columns} getKey={(p) => p.id} pagination pageSize={5} {...extra} />
  );

  it("keeps arrows and n / m by default", () => {
    render(table());
    expect(screen.getByText("1 / 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Last page" })).toBeNull();
  });

  it("adds first and last, and says Page n of m", () => {
    render(table({ pagerJumps: true }));
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Last page" }));
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "First page" }));
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
  });
});

function renderPeople(extra: Partial<ResourcePageProps<Person>> = {}, rows: Person[] = people) {
  return render(
    <GenesisProvider provider={createMockProvider({ people: rows })}>
      <ResourcePage<Person>
        resource="people"
        title="People"
        columns={["name", "email"]}
        searchFields={["name"]}
        detail="none"
        keyboardNavigation={false}
        variant="embedded"
        columnVisibility
        {...extra}
      />
    </GenesisProvider>,
  );
}

describe("ResourcePage compactWhenShort", () => {
  it("keeps the search on a short embedded list by default", async () => {
    renderPeople({}, people.slice(0, 4));
    await screen.findByText("Person 01");
    expect(screen.queryByPlaceholderText(/search/i)).toBeTruthy();
  });

  it("drops search, Columns and pager on an embedded list of ten rows or fewer", async () => {
    renderPeople({ compactWhenShort: true }, people.slice(0, 4));
    await screen.findByText("Person 01");
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /columns/i })).toBeNull();
    expect(screen.queryByText(/1 \/ 1/)).toBeNull();
  });

  it("keeps them past ten rows", async () => {
    renderPeople({ compactWhenShort: true });
    await screen.findByText("Person 01");
    expect(screen.queryByPlaceholderText(/search/i)).toBeTruthy();
  });
});

describe("ResourcePage pagerJumps (server pager)", () => {
  it("adds first and last page buttons only when asked", async () => {
    const { unmount } = renderPeople({ pagination: "server", resourceOptions: { defaultPerPage: 5 }, variant: "page" });
    await screen.findByText("Person 01");
    expect(screen.queryByTestId("resource-page-last")).toBeNull();
    expect(screen.getByTestId("resource-page-prev").textContent).toContain("Previous");
    unmount();
    renderPeople({ pagination: "server", resourceOptions: { defaultPerPage: 5 }, variant: "page", pagerJumps: true });
    await screen.findByText("Person 01");
    fireEvent.click(screen.getByTestId("resource-page-last"));
    await waitFor(() => expect(screen.getByTestId("resource-page-indicator").textContent).toBe("Page 3 of 3"));
    fireEvent.click(screen.getByRole("button", { name: "First page" }));
    await waitFor(() => expect(screen.getByTestId("resource-page-indicator").textContent).toBe("Page 1 of 3"));
    expect(screen.getByRole("button", { name: "Next page" })).toBeTruthy();
  });
});

describe("sizeColumns", () => {
  type Task = { id: string; title: string; status: "open" | "done"; points: number; owner: string };
  const tasks = defineResource<Task>()({
    name: "tasks",
    key: "id",
    labelField: "title",
    fields: [
      { name: "id", type: "string", hasDefault: true },
      { name: "title", type: "string" },
      { name: "status", type: "string", enumValues: ["open", "done"] },
      { name: "points", type: "number" },
      { name: "owner", type: "string" },
    ],
  });
  const view = defineView(tasks, { columns: { default: ["title", "status", "points", "owner"] } });
  const wrap = (children: ReactNode) => (
    <GenesisProvider provider={createMockProvider({ tasks: [{ id: "t1", title: "Write it", status: "open", points: 3, owner: "Ann" }] })}>
      {children}
    </GenesisProvider>
  );
  const widths = () => Array.from(document.querySelectorAll("colgroup col")).map((c) => (c as HTMLElement).style.width);

  it("leaves columns to share the width by default", async () => {
    render(wrap(<ResourceView view={view} mode="table" detail="none" />));
    await screen.findByText("Write it");
    expect(widths().every((w) => w === "")).toBe(true);
    expect(screen.getByRole("table").style.minWidth).toBe("");
  });

  it("sizes every column but the name by what it shows, and keeps room for them all", async () => {
    render(
      wrap(
        <ResourceViewDefaultsProvider sizeColumns>
          <ResourceView view={view} mode="table" detail="none" />
        </ResourceViewDefaultsProvider>,
      ),
    );
    await screen.findByText("Write it");
    const table = screen.getByRole("table");
    const cols = within(table.querySelector("colgroup")!.parentElement!).getAllByRole("columnheader").map((h) => h.textContent);
    expect(cols.slice(0, 4)).toEqual(["Title", "Status", "Points", "Owner"]);
    const [title, status, points, owner] = widths();
    expect(title).toBe("");
    expect(status).toBe("130px");
    expect(points).toBe("96px");
    expect(owner).toBe("140px");
    expect(table.style.minWidth).toBe(`${200 + 130 + 96 + 140}px`);
  });
});
