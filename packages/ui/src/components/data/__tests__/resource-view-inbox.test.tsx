// @feat:view-inbox
/**
 * The inbox view type: a view as a three-pane inbox. The rail draws its segments with their
 * counts, the list its rows (unread in bold), the reading pane the open record with its Edit and
 * Delete, a key no row has falls back to "Not available", narrow screens go Back, and a peek from
 * a list keeps the list's own edit and delete.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider, type FilterParam, type ListParams } from "@marktiderman/genesis-core";
import { defineRecordView, defineView, type AnyRecordView } from "@marktiderman/genesis-core/resource-view";
import { ResourceView } from "../resource-view";
import { recordPeekSlot } from "../resource-view/RecordPeek";

type Ticket = { id: string; subject: string; body: string; requester: string; status: "open" | "solved"; unread: boolean; updated_at: string };

const tickets = defineResource<Ticket>()({
  name: "tickets",
  key: "id",
  labelField: "subject",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "subject", type: "string" },
    { name: "body", type: "string" },
    { name: "requester", type: "string" },
    { name: "status", type: "string", enumValues: ["open", "solved"] },
    { name: "unread", type: "boolean" },
    { name: "updated_at", type: "datetime" },
  ],
});

const ROWS: Ticket[] = [
  { id: "t1", subject: "Can't sign in", body: "The code never arrives.", requester: "Ada Acme", status: "open", unread: true, updated_at: "2026-11-13T09:00:00Z" },
  { id: "t2", subject: "Invoice copy", body: "Please resend October's.", requester: "Bo Sample", status: "open", unread: false, updated_at: "2026-11-12T09:00:00Z" },
  { id: "t3", subject: "Thanks!", body: "All sorted.", requester: "Cy Acme", status: "solved", unread: false, updated_at: "2026-11-11T09:00:00Z" },
];

const matches = (row: Ticket, f: FilterParam) => {
  const v = row[f.field as keyof Ticket] as unknown;
  if (f.operator === "eq") return v === f.value;
  if (f.operator === "in") return (f.value as unknown[]).includes(v);
  return true;
};

function provider(extra: Partial<DataProvider> = {}) {
  return {
    getList: vi.fn(async (_r: string, params: ListParams) => {
      const data = ROWS.filter((row) => (params.filters ?? []).every((f) => matches(row, f)));
      return { data, total: data.length };
    }),
    getOne: vi.fn(async (_r: string, { id }: { id: string }) => {
      const row = ROWS.find((r) => r.id === id);
      if (!row) throw new Error("not found");
      return { data: row };
    }),
    getMany: vi.fn(async () => ({ data: [] })),
    create: vi.fn(),
    update: vi.fn(),
    deleteOne: vi.fn(async () => ({ data: null })),
    ...extra,
  } as unknown as DataProvider;
}

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

const view = defineView(tickets, {
  segments: [
    { id: "open", label: "Open", where: { status: "open" }, count: true },
    { id: "solved", label: "Solved", where: { status: "solved" }, count: true },
  ],
  inbox: { preview: "body", time: "updated_at", from: "requester", unread: "unread", badge: "status" },
});

afterEach(() => vi.restoreAllMocks());

describe("<ResourceView type=\"inbox\">", () => {
  it("draws the segments with their counts, the rows with unread in bold, and nothing open", async () => {
    render(<ResourceView view={view} type="inbox" />, { wrapper: wrap(provider()) });
    expect(await screen.findByText("Can't sign in")).toBeTruthy();
    // The first segment: only open tickets.
    expect(screen.queryByText("Thanks!")).toBeNull();
    const rail = screen.getAllByTestId("resource-inbox-views")[0]!;
    await waitFor(() => expect(within(rail).getByTestId("resource-inbox-views-segment:open").textContent).toContain("2"));
    expect(within(rail).getByTestId("resource-inbox-views-segment:solved").textContent).toContain("1");
    expect(screen.getByTestId("resource-inbox-list-row-t1-unread")).toBeTruthy();
    expect(screen.queryByTestId("resource-inbox-list-row-t2-unread")).toBeNull();
    expect(screen.getByTestId("resource-inbox-nothing")).toBeTruthy();
    fireEvent.click(within(rail).getByTestId("resource-inbox-views-segment:solved"));
    expect(await screen.findByText("Thanks!")).toBeTruthy();
  });

  it("opens a row in the reading pane, with Edit and Delete, and tells the app its key", async () => {
    const onSelectedChange = vi.fn();
    const onEdit = vi.fn();
    render(<ResourceView view={view} type="inbox" onEdit={onEdit} inbox={{ onSelectedChange }} />, { wrapper: wrap(provider()) });
    fireEvent.click(await screen.findByTestId("resource-inbox-list-row-t2"));
    expect(onSelectedChange).toHaveBeenCalledWith("t2");
    const reading = await screen.findByTestId("resource-inbox-reading");
    expect(within(reading).getByText("Please resend October's.")).toBeTruthy();
    fireEvent.click(within(reading).getByTestId("resource-inbox-record-edit"));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }));
    expect(within(reading).getByTestId("resource-inbox-record-delete")).toBeTruthy();
  });

  it("takes the app's reading pane, and a key no row has shows Not available", async () => {
    const { rerender } = render(<ResourceView view={view} type="inbox" inbox={{ selected: "t1", renderReading: (row) => <p>thread of {String(row.subject)}</p> }} />, { wrapper: wrap(provider()) });
    expect(await screen.findByText("thread of Can't sign in")).toBeTruthy();
    rerender(<ResourceView view={view} type="inbox" inbox={{ selected: "gone", renderReading: (row) => <p>thread of {String(row.subject)}</p> }} />);
    expect(await screen.findByTestId("resource-inbox-gone")).toBeTruthy();
  });

  it("goes Back to the list on a narrow screen, and runs the view's markRead on an unread row", async () => {
    const runAction = vi.fn(async () => ({ data: null }));
    const marking = defineView(tickets, {
      inbox: { unread: "unread" },
      actions: [{ name: "markRead", label: "Mark read" }],
    });
    function Screen() {
      const [selected, setSelected] = useState<string | null>(null);
      return <ResourceView view={marking} type="inbox" inbox={{ selected, onSelectedChange: setSelected }} />;
    }
    render(<Screen />, { wrapper: wrap(provider({ runAction })) });
    fireEvent.click(await screen.findByTestId("resource-inbox-list-row-t1"));
    await waitFor(() => expect(runAction).toHaveBeenCalledWith("tickets", { id: "t1", action: "markRead" }));
    fireEvent.click(await screen.findByTestId("resource-inbox-layout-back"));
    expect(await screen.findByTestId("resource-inbox-nothing")).toBeTruthy();
  });

  it("moves with j and k", async () => {
    render(<ResourceView view={view} type="inbox" />, { wrapper: wrap(provider()) });
    await screen.findByText("Invoice copy");
    const layout = screen.getByTestId("resource-inbox-layout");
    fireEvent.keyDown(layout, { key: "j" });
    expect(await screen.findByTestId("resource-inbox-reading")).toBeTruthy();
    expect(within(screen.getByTestId("resource-inbox-reading")).getByText("The code never arrives.")).toBeTruthy();
    fireEvent.keyDown(layout, { key: "j" });
    await waitFor(() => expect(within(screen.getByTestId("resource-inbox-reading")).getByText("Please resend October's.")).toBeTruthy());
  });
});

describe("the inbox among a view's types", () => {
  it("is offered by the switcher, and its list runs the view's bulk actions", async () => {
    const runAction = vi.fn(async () => ({ data: null }));
    const both = defineView(tickets, {
      inbox: { unread: "unread" },
      types: ["table", "inbox"],
      actions: [{ name: "solve", label: "Solve", bulk: true, can: (t) => (t.status === "solved" ? "It's solved already." : true) }],
    });
    render(<ResourceView view={both} />, { wrapper: wrap(provider({ runAction })) });
    fireEvent.click(await screen.findByTestId("view-type-inbox"));
    await screen.findByTestId("resource-inbox");
    fireEvent.click(await screen.findByTestId("resource-inbox-list-row-t1-check"));
    fireEvent.click(screen.getByTestId("resource-inbox-list-row-t3-check"), { shiftKey: true });
    fireEvent.click(await screen.findByTestId("bulk-solve"));
    // t1 and t2 allow it; t3 is solved and skipped.
    await waitFor(() => expect(runAction).toHaveBeenCalledTimes(2));
    expect(runAction).toHaveBeenCalledWith("tickets", { id: "t2", action: "solve" });
  });
});

describe("recordPeekSlot", () => {
  it("keeps the list's own Edit and Delete", () => {
    const record = defineRecordView(view, { template: "document", sections: [] }) as unknown as AnyRecordView;
    const Peek = recordPeekSlot(record as never);
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<Peek item={ROWS[0] as never} open onClose={() => undefined} onEdit={onEdit} onDelete={onDelete} />, { wrapper: wrap(provider()) });
    fireEvent.click(screen.getByTestId("record-peek-page-edit"));
    fireEvent.click(screen.getByTestId("record-peek-page-delete"));
    expect(onEdit).toHaveBeenCalledWith(ROWS[0]);
    expect(onDelete).toHaveBeenCalledWith(ROWS[0]);
  });
});
