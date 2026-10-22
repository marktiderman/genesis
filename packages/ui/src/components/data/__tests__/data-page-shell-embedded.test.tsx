/**
 * DataPageShell inside a page — `emptyDescription` and `header="toolbar"`.
 *
 * A list embedded in a tab already sits under the page's heading. Before
 * `header="toolbar"` the only choices were a second `<h1>` (a broken page
 * outline) or ejecting the header and losing the create button and view
 * toggle with it — so the app replaced the header with its own.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { DataPageShell } from "../DataPageShell";
import { ResourcePage } from "../ResourcePage";

beforeEach(() => {
  localStorage.clear();
});

describe("DataPageShell — emptyDescription", () => {
  it("renders under the empty-state title", () => {
    render(
      <DataPageShell title="Staff" isEmpty emptyMessage="No staff yet" emptyDescription="Invite your first colleague.">
        <div />
      </DataPageShell>,
    );
    expect(screen.getByText("No staff yet")).toBeTruthy();
    expect(screen.getByText("Invite your first colleague.")).toBeTruthy();
  });

  it("is hidden while filters are active — 'no results' is the whole story", () => {
    render(
      <DataPageShell title="Staff" isEmpty hasActiveFilters emptyDescription="Invite your first colleague.">
        <div />
      </DataPageShell>,
    );
    expect(screen.queryByText("Invite your first colleague.")).toBeNull();
  });
});

describe('DataPageShell — header="toolbar"', () => {
  it("drops the title block and keeps the actions", () => {
    render(
      <DataPageShell
        title="Staff"
        header="toolbar"
        createAction={<button type="button">New staff</button>}
        viewMode="table"
        onViewModeChange={() => {}}
      >
        <div>rows</div>
      </DataPageShell>,
    );
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByText("Staff")).toBeNull();
    expect(screen.getByTestId("page-header-toolbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New staff" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "View mode" })).toBeTruthy();
  });

  it("still uses the title for generated copy", () => {
    render(
      <DataPageShell title="Staff" entityName="colleague" header="toolbar" hasError>
        <div />
      </DataPageShell>,
    );
    expect(screen.getByText("Failed to load colleagues. Please try again.")).toBeTruthy();
  });

  it("keeps the default page header otherwise", () => {
    render(
      <DataPageShell title="Staff">
        <div />
      </DataPageShell>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Staff" })).toBeTruthy();
  });
});

describe("ResourcePage — header / empty props", () => {
  it("forwards header, emptyMessage and emptyDescription to the shell", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage
          title="Staff"
          data={[]}
          total={0}
          header="toolbar"
          emptyMessage="No staff yet"
          emptyDescription="Invite your first colleague."
          onCreate={() => {}}
          createLabel="New staff"
        />
      </GenesisProvider>,
    );
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("button", { name: /New staff/ })).toBeTruthy();
    expect(screen.getByText("No staff yet")).toBeTruthy();
    expect(screen.getByText("Invite your first colleague.")).toBeTruthy();
  });
});
