/**
 * ResourcePage's default list row and card (what a phone shows):
 * - the title is the page's (`getTitle`, else `titleField`), never the raw first column, and its
 *   column isn't repeated as a cell;
 * - a cell reads its column's `accessor` and `render`, as the table does, so a computed column
 *   isn't blank;
 * - the row is two lines: the title, then up to three other columns.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";
import { Dialog, DialogContent, DialogTitle } from "../../ui/dialog";
import type { ReactNode } from "react";

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
          { key: "full_name", header: "Name", accessor: (m) => `${m.first} ${m.last}` },
          { key: "visits", header: "Visits", render: (_m, v) => <b data-testid="visits-cell">{String(v)} visits</b> },
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
    expect(within(row).getByTestId("resource-list-row-open").getAttribute("aria-label")).toContain("ada@acme.example");
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
    expect(row.querySelector(".line-clamp-2")!.textContent).toBe("Ada Lovelace");
    expect(within(row).getByTestId("resource-list-row-open").getAttribute("aria-label")).toContain("Ada Lovelace");
  });
});

describe("ResourcePage default card", () => {
  it("titles the card by titleField and renders computed columns", async () => {
    renderMembers("grid");
    const card = await screen.findByTestId("resource-card");
    expect(within(card).getByTestId("resource-card-open").textContent).toBe("ada@acme.example");
    expect(card.textContent).toContain("Ada Lovelace");
    expect(within(card).getByTestId("visits-cell").textContent).toBe("3 visits");
    // The email is the title, once.
    expect(card.textContent!.split("ada@acme.example").length - 1).toBe(1);
  });
});

describe("a list row keeps the cells the screen drew itself (keepInList)", () => {
  function renderKept(onRestore = vi.fn(), onNavigate = vi.fn()) {
    render(
      <GenesisProvider mock={{ datasets: { members } }}>
        <ResourcePage<Member>
          resource="members"
          title="Members"
          defaultView="list"
          titleField="email"
          detail="route"
          onNavigate={onNavigate}
          columns={[
            { key: "email", header: "Email", keepInList: true, render: (m) => <a href={`/members/${m.id}`} data-testid="title-link">{m.email}</a> },
            "first",
            "last",
            { key: "full_name", header: "Name", accessor: (m) => `${m.first} ${m.last}` },
            { key: "restore", header: "", keepInList: true, render: () => <button type="button" data-testid="restore" onClick={onRestore}>Restore</button> },
          ]}
        />
      </GenesisProvider>,
    );
    return { onRestore, onNavigate };
  }

  it("draws a kept title column's cell as the row's title, once", async () => {
    renderKept();
    const row = await screen.findByTestId("resource-list-row");
    expect(within(row).getByTestId("title-link").getAttribute("href")).toBe(`/members/${members[0]!.id}`);
    expect(within(row).getAllByText("ada@acme.example")).toHaveLength(1);
  });

  it("shows a kept action beside the first three columns, though it is the fifth", async () => {
    renderKept();
    const row = await screen.findByTestId("resource-list-row");
    expect(within(row).getByTestId("restore")).toBeTruthy();
    expect(row.querySelector('[data-column="full_name"]')).not.toBeNull();
  });

  it("isn't a button itself, so its controls stay reachable, and opens from its own Open button", async () => {
    const { onNavigate } = renderKept();
    const row = await screen.findByTestId("resource-list-row");
    expect(row.getAttribute("role")).toBeNull();
    expect(row.getAttribute("tabindex")).toBeNull();
    const open = within(row).getByTestId("resource-list-row-open");
    expect(open.getAttribute("aria-label")).toContain("ada@acme.example");
    fireEvent.click(open);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("runs a kept control's own click without opening the row", async () => {
    const { onRestore, onNavigate } = renderKept();
    const row = await screen.findByTestId("resource-list-row");
    fireEvent.click(within(row).getByTestId("restore"));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
    // Enter on the control isn't taken over by the row.
    const enter = fireEvent.keyDown(within(row).getByTestId("restore"), { key: "Enter" });
    expect(enter).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();
    // A click on the row's plain text still opens it.
    fireEvent.click(row.querySelector('[data-column="full_name"]')!);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("a list row with a link a cell draws (no keepInList)", () => {
  function renderLinked(detail: "route" | "none", onNavigate = vi.fn()) {
    render(
      <GenesisProvider mock={{ datasets: { members } }}>
        <ResourcePage<Member>
          resource="members"
          title="Members"
          defaultView="list"
          titleField="first"
          detail={detail}
          onNavigate={onNavigate}
          columns={["first", { key: "email", header: "Email", render: (m) => <a href={`mailto:${m.email}`} data-testid="mail">{m.email}</a> }]}
        />
      </GenesisProvider>,
    );
    return onNavigate;
  }

  it("isn't a button around the link, and a click on the link never opens the row", async () => {
    const onNavigate = renderLinked("route");
    const row = await screen.findByTestId("resource-list-row");
    expect(row.getAttribute("role")).toBeNull();
    fireEvent.click(within(row).getByTestId("mail"));
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByTestId("resource-list-row-open"));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("with nothing to open, has no Open button and doesn't look clickable", async () => {
    renderLinked("none");
    const row = await screen.findByTestId("resource-list-row");
    expect(within(row).queryByTestId("resource-list-row-open")).toBeNull();
    expect(row.className).not.toContain("cursor-pointer");
  });
});

describe("a list row ignores clicks that aren't its own", () => {
  function renderWith(cell: (m: Member) => ReactNode, onNavigate = vi.fn()) {
    render(
      <GenesisProvider mock={{ datasets: { members } }}>
        <ResourcePage<Member>
          resource="members"
          title="Members"
          defaultView="list"
          titleField="first"
          detail="route"
          onNavigate={onNavigate}
          columns={["first", { key: "act", header: "", keepInList: true, render: cell }]}
        />
      </GenesisProvider>,
    );
    return onNavigate;
  }

  it("never opens from a click inside a dialog a cell opened (a portal)", async () => {
    const onNavigate = renderWith(() => (
      <Dialog open>
        <DialogContent>
          <DialogTitle>Sure?</DialogTitle>
          <button type="button" data-testid="confirm">Confirm</button>
        </DialogContent>
      </Dialog>
    ));
    await screen.findByTestId("resource-list-row");
    fireEvent.click(await screen.findByTestId("confirm"));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("leaves a slider (or any ARIA control) its own clicks", async () => {
    const onNavigate = renderWith(() => <div role="slider" aria-valuenow={1} tabIndex={0} data-testid="slider" />);
    const row = await screen.findByTestId("resource-list-row");
    fireEvent.click(within(row).getByTestId("slider"));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
