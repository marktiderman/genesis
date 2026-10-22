/**
 * The pieces an app's data view needed and hand-rolled before:
 * typed px column widths, card click on DataGrid, a non-red
 * AlertDialogAction, a header without its title, and per-row edit rights
 * plus card-click-opens-detail on ResourcePage (Breakthrough's RecordTable).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableColumn } from "../DataTable";
import { DataGrid } from "../DataGrid";
import { GenesisProvider, createMockProvider } from "../../../provider";
import { ResourcePage } from "../ResourcePage";
import { PageHeader } from "../../layout/PageHeader";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogTitle } from "../../ui/alert-dialog";

interface Row {
  [key: string]: unknown;
  id: string;
  name: string;
  notes: string;
}

const rows: Row[] = [
  { id: "1", name: "Ada", notes: "first" },
  { id: "2", name: "Linus", notes: "second" },
];

beforeEach(() => {
  localStorage.clear();
});

describe("DataTable column widths", () => {
  const widthOf = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("colgroup col")).map((c) => (c as HTMLElement).style.width);

  it("gives a numeric width to the column through a <colgroup>, leaving the rest to share", () => {
    const columns: DataTableColumn<Row>[] = [
      { key: "name", header: "Name", width: 180 },
      { key: "notes", header: "Notes" },
    ];
    const { container } = render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    expect(widthOf(container)).toEqual(["180px", ""]);
  });

  it("reads a px string as pixels but leaves other strings to CSS", () => {
    const columns: DataTableColumn<Row>[] = [
      { key: "name", header: "Name", width: "120px" },
      { key: "notes", header: "Notes", width: "12rem" },
    ];
    const { container } = render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    expect(widthOf(container)).toEqual(["120px", ""]);
    // "12rem" stays a class name rather than becoming 12px.
    expect(Array.from(container.querySelectorAll("th")).some((th) => th.classList.contains("12rem"))).toBe(true);
  });

  it("truncates a long header and keeps the full text as its title", () => {
    const columns: DataTableColumn<Row>[] = [{ key: "name", header: "A very long column header", width: 60 }];
    render(<DataTable items={rows} columns={columns} getKey={(r) => r.id} />);
    const label = screen.getByTitle("A very long column header");
    expect(label.className).toContain("truncate");
  });
});

describe("DataGrid onItemClick", () => {
  function renderGrid(onItemClick = vi.fn()) {
    render(
      <DataGrid
        items={rows}
        viewMode="grid"
        staggerAnimation={false}
        getKey={(r) => r.id}
        onItemClick={onItemClick}
        getItemLabel={(r) => `Open ${r.name}`}
        renderCard={(r) => (
          <div>
            {r.name} <button type="button">Star</button>
          </div>
        )}
      />,
    );
    return onItemClick;
  }

  it("makes each card a labelled button that opens on click, Enter and Space", () => {
    const onItemClick = renderGrid();
    const card = screen.getByRole("button", { name: "Open Ada" });
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onItemClick).toHaveBeenCalledTimes(3);
    expect(onItemClick).toHaveBeenCalledWith(rows[0]);
  });

  it("leaves a button inside the card to its own click", () => {
    const onItemClick = renderGrid();
    const card = screen.getByRole("button", { name: "Open Linus" });
    fireEvent.click(within(card).getByRole("button", { name: "Star" }));
    expect(onItemClick).not.toHaveBeenCalled();
  });

  it("adds no button role without onItemClick", () => {
    render(<DataGrid items={rows} viewMode="grid" getKey={(r) => r.id} renderCard={(r) => <span>{r.name}</span>} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("AlertDialogAction variant", () => {
  const action = (variant?: "default" | "destructive") =>
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Publish?</AlertDialogTitle>
          <AlertDialogAction {...(variant ? { variant } : {})}>Go</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>,
    );

  it("stays red by default", () => {
    action();
    expect(screen.getByRole("button", { name: "Go" }).className).toContain("bg-destructive");
  });

  it("uses the primary colour for a non-destructive action", () => {
    action("default");
    const button = screen.getByRole("button", { name: "Go" });
    expect(button.className).toContain("bg-primary");
    expect(button.className).not.toContain("bg-destructive");
  });
});

describe("PageHeader showTitle", () => {
  it("drops the title block but keeps the actions", () => {
    render(
      <PageHeader
        title="Tasks"
        createAction={<button type="button">New task</button>}
        options={{ showTitle: false, configurable: false }}
      />,
    );
    expect(screen.queryByTestId("page-title")).toBeNull();
    expect(screen.getByRole("button", { name: "New task" })).toBeTruthy();
  });

  it("ignores a stored user override for showTitle", () => {
    localStorage.setItem("hdr", JSON.stringify({ showTitle: false }));
    render(<PageHeader title="Tasks" optionsStorageKey="hdr" options={{ configurable: false }} />);
    expect(screen.getByTestId("page-title").textContent).toBe("Tasks");
  });
});

describe("ResourcePage openOnCardClick and canEditItem", () => {
  function renderPage(extra: Partial<Parameters<typeof ResourcePage<Row>>[0]> = {}) {
    return render(
      <GenesisProvider mock={{ datasets: {} }}>
      <ResourcePage<Row>
        data={rows}
        title="People"
        columns={["name"]}
        titleField="name"
        defaultView="grid"
        renderCard={(r) => <div>{r.name}</div>}
        openOnCardClick
        onEdit={() => {}}
        onDelete={() => {}}
        {...extra}
      />
      </GenesisProvider>,
    );
  }

  it("opens the detail when a custom card is clicked", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Open Ada" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("hides Edit and Delete for a row the user can't change, and only that row", () => {
    renderPage({ canEditItem: (r) => r.id !== "1" });
    fireEvent.click(screen.getByRole("button", { name: "Open Ada" }));
    const ada = screen.getByRole("dialog");
    expect(within(ada).queryByRole("button", { name: /edit/i })).toBeNull();
    expect(within(ada).queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("names records with getTitle / getSubtitle in the card label and the detail", () => {
    renderPage({ getTitle: (r) => `${r.name}!`, getSubtitle: (r) => `Note: ${r.notes}` });
    fireEvent.click(screen.getByRole("button", { name: "Open Ada!" }));
    const detail = screen.getByRole("dialog");
    expect(within(detail).getByText("Ada!")).toBeTruthy();
    expect(within(detail).getByText("Note: first")).toBeTruthy();
  });

  it("keeps Edit for a row the user can change", () => {
    renderPage({ canEditItem: (r) => r.id !== "1" });
    fireEvent.click(screen.getByRole("button", { name: "Open Linus" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /edit/i })).toBeTruthy();
  });
});

describe("ResourcePage detail follows the current rows", () => {
  const page = (data: Row[]) => (
    <GenesisProvider mock={{ datasets: {} }}>
      <ResourcePage<Row> data={data} title="People" columns={["name", "notes"]} titleField="name" defaultView="table" />
    </GenesisProvider>
  );

  it("shows an edited record's new values without reopening", () => {
    const { rerender } = render(page(rows));
    fireEvent.click(screen.getByText("Ada"));
    rerender(page([{ ...rows[0]!, name: "Ada L." }, rows[1]!]));
    expect(within(screen.getByRole("dialog")).getAllByText("Ada L.").length).toBeGreaterThan(0);
  });

  it("keeps the last copy when the open record leaves the rows", () => {
    // Paging, sorting, search and filters drop rows that still exist; only a
    // confirmed delete closes the peek.
    const { rerender } = render(page(rows));
    fireEvent.click(screen.getByText("Ada"));
    rerender(page([rows[1]!]));
    expect(within(screen.getByRole("dialog")).getAllByText("Ada").length).toBeGreaterThan(0);
  });
});

describe("ResourcePage empty state", () => {
  it("shows the caller's title, description and action", () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Row>
          data={[]}
          title="Tasks"
          columns={["name"]}
          emptyMessage="No tasks yet"
          emptyDescription="Add one small, doable next step."
          emptyState={<button type="button">New task</button>}
        />
      </GenesisProvider>,
    );
    expect(screen.getByText("No tasks yet")).toBeTruthy();
    expect(screen.getByText("Add one small, doable next step.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New task" })).toBeTruthy();
  });
});

describe("ResourcePage resource= mode passes column layout through", () => {
  it("applies width, minWidth and defaultVisible when the page fetches its own rows", async () => {
    const { container } = render(
      <GenesisProvider provider={createMockProvider({ people: rows })}>
        <ResourcePage<Row>
          resource="people"
          title="People"
          detail="none"
          keyboardNavigation={false}
          columns={[
            { key: "name", header: "Name", width: 180, minWidth: 120 },
            { key: "notes", header: "Notes", defaultVisible: false },
          ]}
        />
      </GenesisProvider>,
    );
    await screen.findByText("Ada");
    expect(screen.queryByRole("columnheader", { name: /notes/i })).toBeNull();
    expect(screen.queryByText("first")).toBeNull();
    const widths = Array.from(container.querySelectorAll("colgroup col")).map(
      (c) => (c as HTMLElement).style.width,
    );
    expect(widths).toContain("180px");
  });
});

describe("ResourcePage detail for rows without an id", () => {
  // No `id` and no `getKey`: every row keys as "". The peek must show the
  // row that was clicked, not the first keyless row.
  const keyless = [
    { name: "Ada", notes: "first" },
    { name: "Linus", notes: "second" },
  ] as unknown as Row[];
  const page = (data: Row[]) => (
    <GenesisProvider mock={{ datasets: {} }}>
      <ResourcePage<Row> data={data} title="People" columns={["name", "notes"]} titleField="name" defaultView="table" />
    </GenesisProvider>
  );

  it("opens the clicked record, not the first one", () => {
    render(page(keyless));
    fireEvent.click(screen.getByText("Linus"));
    const detail = screen.getByRole("dialog");
    expect(within(detail).getAllByText("Linus").length).toBeGreaterThan(0);
    expect(within(detail).queryByText("Ada")).toBeNull();
  });

  it("keeps the clicked record across a refetch with new row objects", () => {
    const { rerender } = render(page(keyless));
    fireEvent.click(screen.getByText("Linus"));
    rerender(page(keyless.map((r) => ({ ...r }))));
    const detail = screen.getByRole("dialog");
    expect(within(detail).getAllByText("Linus").length).toBeGreaterThan(0);
    expect(within(detail).queryByText("Ada")).toBeNull();
  });
});
