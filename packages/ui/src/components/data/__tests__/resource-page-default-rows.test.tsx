/**
 * ResourcePage's default list row and card (what a phone shows):
 * - the title is the page's (`getTitle`, else `titleField`), never the raw first column, and its
 *   column isn't repeated as a cell;
 * - a cell reads its column's `accessor` and `render`, as the table does, so a computed column
 *   isn't blank;
 * - the row is two lines: the title, then up to three other columns.
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";

interface Member {
  [key: string]: unknown;
  id: string;
  first: string;
  last: string;
  email: string;
  visits: number;
}

const members: Member[] = [
  { id: "3f2a9c1e-0b7d-4c55-9e1a-6d2f8b0c4a11", first: "Ada", last: "Lovelace", email: "ada@acme.example", visits: 3 },
];

beforeEach(() => localStorage.clear());

function renderMembers(defaultView: "list" | "grid", extra: Partial<ResourcePageProps<Member>> = {}) {
  return render(
    <GenesisProvider mock={{ datasets: { members } }}>
      <ResourcePage<Member>
        resource="members"
        title="Members"
        defaultView={defaultView}
        columns={[
          "id",
          "email",
          { key: "full_name", label: "Name", accessor: (m) => `${m.first} ${m.last}` },
          { key: "visits", label: "Visits", render: (_m, v) => <b data-testid="visits-cell">{String(v)} visits</b> },
        ]}
        titleField="email"
        {...extra}
      />
    </GenesisProvider>,
  );
}

describe("ResourcePage default list row", () => {
  it("titles the row by titleField, not the first column, and leaves the id out", async () => {
    renderMembers("list");
    const row = await screen.findByTestId("resource-list-row");
    expect(row.getAttribute("aria-label")).toBe("ada@acme.example");
    const title = row.querySelector(".line-clamp-2")!;
    expect(title.textContent).toBe("ada@acme.example");
    // The title column isn't a cell too; the id is a cell, never the title.
    expect(row.querySelector('[data-column="email"]')).toBeNull();
    expect(title.textContent).not.toContain(members[0]!.id);
  });

  it("renders a computed (accessor) column and a column's render", async () => {
    renderMembers("list");
    const row = await screen.findByTestId("resource-list-row");
    expect(row.querySelector('[data-column="full_name"]')!.textContent).toBe("Ada Lovelace");
    expect(within(row).getByTestId("visits-cell").textContent).toBe("3 visits");
  });

  it("shows up to three other columns on the second line", async () => {
    renderMembers("list", {
      columns: ["email", "id", { key: "full_name", accessor: (m) => `${m.first} ${m.last}` }, "first", "last", "visits"],
    });
    const row = await screen.findByTestId("resource-list-row");
    expect([...row.querySelectorAll("[data-column]")].map((el) => el.getAttribute("data-column"))).toEqual([
      "id",
      "full_name",
      "first",
    ]);
  });

  it("takes getTitle over titleField", async () => {
    renderMembers("list", { getTitle: (m) => `${m.first} ${m.last}` });
    const row = await screen.findByTestId("resource-list-row");
    expect(row.getAttribute("aria-label")).toBe("Ada Lovelace");
  });
});

describe("ResourcePage default card", () => {
  it("titles the card by titleField and renders computed columns", async () => {
    renderMembers("grid");
    const card = await screen.findByTestId("resource-card");
    expect(card.getAttribute("aria-label")).toBe("ada@acme.example");
    expect(card.textContent).toContain("Ada Lovelace");
    expect(within(card).getByTestId("visits-cell").textContent).toBe("3 visits");
    // The email is the title, once.
    expect(card.textContent!.split("ada@acme.example").length - 1).toBe(1);
  });
});
