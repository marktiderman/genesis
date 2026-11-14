// @feat:view-inbox @feat:native-components
/** NativeResourceView `type="inbox"`: the view's rows as InboxPage's, unread first in weight, a press opening the row. */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { defineResource, GenesisProvider, type DataProvider } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { NativeResourceView } from "..";

type Ticket = { id: string; subject: string; body: string; unread: boolean };

const tickets = defineResource<Ticket>()({
  name: "tickets",
  key: "id",
  labelField: "subject",
  fields: [
    { name: "id", type: "string", hasDefault: true },
    { name: "subject", type: "string" },
    { name: "body", type: "string" },
    { name: "unread", type: "boolean" },
  ],
});

const ROWS: Ticket[] = [
  { id: "t1", subject: "Can't sign in", body: "The code never arrives.", unread: true },
  { id: "t2", subject: "Invoice copy", body: "Please resend it.", unread: false },
];

const view = defineView(tickets, { inbox: { preview: "body", unread: "unread" } });

function wrap(p: DataProvider) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return ({ children }: { children: ReactNode }) => (
    <GenesisProvider provider={p} queryClient={queryClient}>
      {children}
    </GenesisProvider>
  );
}

describe("NativeResourceView inbox", () => {
  it("draws the rows as an inbox, with their preview, and opens one on press", async () => {
    const p = {
      getList: vi.fn(async () => ({ data: ROWS, total: ROWS.length })),
      getOne: vi.fn(async (_r: string, { id }: { id: string }) => ({ data: ROWS.find((r) => r.id === id) })),
      getMany: vi.fn(async () => ({ data: [] })),
      create: vi.fn(),
      update: vi.fn(),
      deleteOne: vi.fn(),
    } as unknown as DataProvider;
    const onRowPress = vi.fn();
    render(<NativeResourceView view={view} type="inbox" onRowPress={onRowPress} />, { wrapper: wrap(p) });
    expect(await screen.findByText("Can't sign in")).toBeTruthy();
    expect(screen.getByText("Please resend it.")).toBeTruthy();
    expect(screen.queryByTestId("native-resource-view-list")).toBeNull();
    fireEvent.click(screen.getByText("Invoice copy"));
    expect(onRowPress).toHaveBeenCalledWith(expect.objectContaining({ id: "t2" }));
  });
});
