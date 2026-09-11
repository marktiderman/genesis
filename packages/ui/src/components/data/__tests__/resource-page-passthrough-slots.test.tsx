/**
 * ResourcePage — the two passthrough slots that let a hand-assembled page
 * stop being hand-assembled: `filters` (extra multi-select comboboxes, handed
 * to DataFilters) and `renderTable` (own the table, keep the page).
 *
 * Both exist for the same reason: a consumer had ONE thing ResourcePage did
 * not offer and so rebuilt the whole DataPageShell + DataFilters + table
 * stack by hand to get it. The assertions below are therefore as much about
 * what still works alongside the override — header, counts, filters row — as
 * about the override itself.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Tag } from "lucide-react";

import { GenesisProvider } from "../../../provider";
import { ResourcePage } from "../ResourcePage";

interface Post {
  [key: string]: unknown;
  id: string;
  title: string;
}

const rows: Post[] = [
  { id: "1", title: "Alpha" },
  { id: "2", title: "Mike" },
];

beforeEach(() => {
  localStorage.clear();
});

describe("ResourcePage — filters passthrough", () => {
  it("renders a DataFilterConfig combobox handed in via `filters`", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={rows}
          total={2}
          columns={["title"]}
          detail="none"
          filters={[
            {
              key: "subject",
              label: "Subject",
              icon: Tag,
              options: [
                { value: "math", label: "Math" },
                { value: "art", label: "Art" },
              ],
              selected: [],
              onChange: () => {},
            },
          ]}
        />
      </GenesisProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("All Subject")).toBeTruthy(),
    );
  });

  it("renders no extra combobox when `filters` is omitted — the default is unchanged", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={rows}
          total={2}
          columns={["title"]}
          detail="none"
        />
      </GenesisProvider>,
    );

    await waitFor(() =>
      expect(document.querySelectorAll("tbody tr").length).toBe(2),
    );
    expect(screen.queryByText("All Subject")).toBeNull();
  });
});

describe("ResourcePage — renderTable passthrough", () => {
  it("renders the caller's table instead of the built-in DataTable", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={rows}
          total={2}
          columns={["title"]}
          detail="none"
          renderTable={(items) => (
            <div data-testid="custom-table">
              {items.map((item) => (
                <div key={item.id}>custom:{item.title}</div>
              ))}
            </div>
          )}
        />
      </GenesisProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("custom-table")).toBeTruthy(),
    );
    expect(screen.getByText("custom:Alpha")).toBeTruthy();
    // The built-in table is gone, not merely hidden behind the custom one.
    expect(document.querySelectorAll("tbody tr").length).toBe(0);
  });

  it("hands `renderTable` the rows for the current view", async () => {
    const seen: Post[][] = [];
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={rows}
          total={97}
          columns={["title"]}
          detail="none"
          page={2}
          perPage={2}
          onPageChange={() => {}}
          renderTable={(items) => {
            seen.push(items);
            return <div data-testid="custom-table">{items.length}</div>;
          }}
        />
      </GenesisProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("custom-table")).toBeTruthy(),
    );
    // Exactly the server page, untouched — not re-sliced by perPage a
    // second time and not re-sorted.
    expect(seen.at(-1)).toEqual(rows);
  });

  it("still renders the page chrome around a custom table", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={rows}
          total={97}
          columns={["title"]}
          detail="none"
          page={2}
          perPage={2}
          onPageChange={() => {}}
          renderTable={() => <div data-testid="custom-table" />}
        />
      </GenesisProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("custom-table")).toBeTruthy(),
    );
    expect(screen.getByTestId("resource-page-pagination")).toBeTruthy();
    expect(screen.getByText("Posts")).toBeTruthy();
  });

  it("falls back to the built-in DataTable when `renderTable` is omitted", async () => {
    render(
      <GenesisProvider mock={{ datasets: {} }}>
        <ResourcePage<Post>
          title="Posts"
          data={rows}
          total={2}
          columns={["title"]}
          detail="none"
        />
      </GenesisProvider>,
    );

    await waitFor(() =>
      expect(document.querySelectorAll("tbody tr").length).toBe(2),
    );
    expect(screen.queryByTestId("custom-table")).toBeNull();
  });
});
