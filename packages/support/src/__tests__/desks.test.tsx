// @feat:support-desks
// Desks (migration 0029): the client's calls, the pure pickers, and the web cards and switch.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseDesk, createSupportClient, deskTenant, pickerDesks, workedDesks, type AgentTicket, type SupportClient, type SupportDesk, type TicketDesk } from "..";
import { SupportAgentInbox, SupportDeskControls, SupportDeskPicker, SupportDeskSwitch, SupportRequesterPanel, lastMoveLabel } from "../web-chat";
import { resolveSupportCopy } from "../copy";
import { fakeSupabase } from "./fake-supabase";

afterEach(cleanup);

const desk = (over: Partial<SupportDesk> = {}): SupportDesk => ({ tenantId: "app", label: null, isDefault: true, enabled: true, manage: false, openTickets: 0, ...over });
const acme = desk({ tenantId: "acme", label: "Acme", isDefault: false, enabled: true, manage: true, openTickets: 2 });
const north = desk({ tenantId: "north", label: "Northside", isDefault: false, enabled: false, manage: true, openTickets: 0 });

describe("the client's desk calls", () => {
  const rows: Record<string, unknown> = {
    support_my_desks: [{ tenant_id: "acme", label: "Acme", is_default: false, enabled: true, manage: true, open_tickets: 3 }],
    support_ticket_desk: [
      {
        tenant_id: "app",
        label: null,
        is_default: true,
        can_escalate: false,
        can_return: true,
        returns_to: "acme",
        returns_to_label: "Acme",
        last_action: "escalated",
        last_from: "acme",
        last_to: "app",
        last_by: "u1",
        last_by_name: "Ana",
        last_reason: "refund",
        last_at: "2026-11-19T10:00:00Z",
      },
    ],
    support_desk_move_targets: [{ tenant_id: "acme", label: "Acme", is_default: false }],
    support_desk_history: [{ id: 7, tenant_id: "acme", ticket_id: null, to_tenant: null, action: "turned_on", reason: null, actor: "u1", actor_name: "Ana", at: "2026-11-19T09:00:00Z" }],
  };
  const make = () => {
    const fake = fakeSupabase({ rpc: (fn) => ({ data: rows[fn] ?? null, error: null }) });
    return { fake, client: createSupportClient(fake.client) };
  };

  it("reads the desks the person works", async () => {
    const { client } = make();
    expect(await client.myDesks!()).toEqual([{ tenantId: "acme", label: "Acme", isDefault: false, enabled: true, manage: true, openTickets: 3 }]);
  });

  it("reads where a ticket is and its last move", async () => {
    const { client } = make();
    expect(await client.ticketDesk!("t1")).toMatchObject({
      isDefault: true,
      canReturn: true,
      returnsTo: "acme",
      lastMove: { action: "escalated", from: "acme", to: "app", byName: "Ana", reason: "refund" },
    });
  });

  it("switches, escalates, returns and moves through the functions", async () => {
    const { fake, client } = make();
    await client.setDesk!("acme", true, "ours now");
    await client.escalateTicket!("t1");
    await client.returnTicket!("t1", "done");
    await client.moveTicket!("t1", "north", null);
    expect(fake.rpcs).toEqual([
      { fn: "support_set_desk", args: { tenant: "acme", enabled: true, reason: "ours now" } },
      { fn: "support_escalate_ticket", args: { ticket: "t1", reason: null } },
      { fn: "support_return_ticket", args: { ticket: "t1", reason: "done" } },
      { fn: "support_move_ticket", args: { ticket: "t1", to_tenant: "north", reason: null } },
    ]);
  });

  it("reads move targets and a desk's history", async () => {
    const { client } = make();
    expect(await client.deskMoveTargets!("t1")).toEqual([{ tenantId: "acme", label: "Acme", isDefault: false }]);
    expect(await client.deskHistory!({ tenantId: "acme" })).toEqual([
      { id: "7", tenantId: "acme", ticketId: null, toTenantId: null, action: "turned_on", reason: null, actorId: "u1", actorName: "Ana", at: "2026-11-19T09:00:00Z" },
    ]);
  });
});

describe("picking a desk", () => {
  it("keeps desks with work to do", () => {
    expect(workedDesks([desk(), acme, north]).map((d) => d.tenantId)).toEqual(["app", "acme"]);
  });

  it("opens the desk asked for, else the app's own, else the first", () => {
    expect(chooseDesk([desk(), acme, north], "north")?.tenantId).toBe("north");
    expect(chooseDesk([desk(), acme], null)?.tenantId).toBe("app");
    expect(chooseDesk([acme], undefined)?.tenantId).toBe("acme");
    expect(chooseDesk([north], undefined)).toBeUndefined();
  });

  it("offers the worked desks and the one open now", () => {
    expect(pickerDesks([desk(), acme, north], north).map((d) => d.tenantId)).toEqual(["app", "acme", "north"]);
  });

  it("names the app's own desk's tenant null", () => {
    expect(deskTenant(desk())).toBeNull();
    expect(deskTenant(acme)).toBe("acme");
  });

  it("says what the last move was", () => {
    const copy = resolveSupportCopy();
    const moved: TicketDesk = {
      tenantId: "app",
      label: null,
      isDefault: true,
      canEscalate: false,
      canReturn: true,
      returnsTo: "acme",
      returnsToLabel: "Acme",
      lastMove: { action: "escalated", from: "acme", to: "app", byId: "u1", byName: "Ana", reason: null, at: "2026-11-19T10:00:00Z" },
    };
    const names = (id: string) => (id === "acme" ? "Acme" : "Support");
    expect(lastMoveLabel(moved, copy, names)).toBe("Sent up to Support by Ana from Acme.");
    expect(lastMoveLabel({ ...moved, lastMove: null }, copy, names)).toBeNull();
  });
});

const ticket = { id: "t1", userId: "u9", platform: "ios", appVersion: "1.2.3", requesterEmail: null } as unknown as AgentTicket;

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

function stub(over: Partial<SupportClient>): SupportClient {
  return over as SupportClient;
}

describe("the web desk cards", () => {
  it("names who wrote, their email and their tenants", async () => {
    const client = stub({
      reporters: vi.fn(async () => [{ id: "u9", name: "Bo", email: "bo@example.test" }]),
      requesterTenants: vi.fn(async () => [{ tenantId: "acme", label: "Acme", role: "admin" }, { tenantId: "north", label: "Northside", role: "Client" }]),
    });
    wrap(<SupportRequesterPanel client={client} ticket={ticket} />);
    expect((await screen.findByText("bo@example.test")).getAttribute("href")).toBe("mailto:bo@example.test");
    expect((await screen.findByTestId("genesis-support-requester-tenants")).textContent).toContain("Acme");
    expect(screen.getByTestId("genesis-support-requester-tenants").textContent).toBe("Acme · AdminNorthside · Client");
    expect(screen.getByText("Bo")).toBeTruthy();
  });

  it("sends a desk's ticket up to the app's desk, with a reason", async () => {
    const escalateTicket = vi.fn(async () => undefined);
    const onMoved = vi.fn();
    const client = stub({
      ticketDesk: vi.fn(async () => ({ tenantId: "acme", label: "Acme", isDefault: false, canEscalate: true, canReturn: false, returnsTo: null, returnsToLabel: null, lastMove: null })),
      deskMoveTargets: vi.fn(async () => [{ tenantId: "app", label: null, isDefault: true }]),
      escalateTicket,
    });
    wrap(<SupportDeskControls client={client} ticket={ticket} onMoved={onMoved} />);
    fireEvent.click(await screen.findByTestId("genesis-support-desk-escalate"));
    fireEvent.change(screen.getByTestId("genesis-support-desk-reason"), { target: { value: "needs a refund" } });
    fireEvent.click(screen.getByTestId("genesis-support-desk-send"));
    await waitFor(() => expect(escalateTicket).toHaveBeenCalledWith("t1", "needs a refund"));
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith("t1"));
  });

  it("hands an escalated ticket back, and says where it came from", async () => {
    const returnTicket = vi.fn(async () => undefined);
    const client = stub({
      ticketDesk: vi.fn(async () => ({
        tenantId: "app",
        label: null,
        isDefault: true,
        canEscalate: false,
        canReturn: true,
        returnsTo: "acme",
        returnsToLabel: "Acme",
        lastMove: { action: "escalated" as const, from: "acme", to: "app", byId: "u1", byName: "Ana", reason: "refund", at: "2026-11-19T10:00:00Z" },
      })),
      deskMoveTargets: vi.fn(async () => [{ tenantId: "acme", label: "Acme", isDefault: false }]),
      returnTicket,
    });
    wrap(<SupportDeskControls client={client} ticket={ticket} />);
    expect((await screen.findByTestId("genesis-support-desk-last")).textContent).toContain("Sent up to Support by Ana from Acme.");
    fireEvent.click(screen.getByTestId("genesis-support-desk-return"));
    fireEvent.click(screen.getByTestId("genesis-support-desk-send"));
    await waitFor(() => expect(returnTicket).toHaveBeenCalledWith("t1", null));
  });

  it("shows nothing for a ticket that never moved and can't", async () => {
    const ticketDesk = vi.fn(async () => ({ tenantId: "app", label: null, isDefault: true, canEscalate: false, canReturn: false, returnsTo: null, returnsToLabel: null, lastMove: null }));
    const client = stub({ ticketDesk, deskMoveTargets: vi.fn(async () => []) });
    const { container } = wrap(<SupportDeskControls client={client} ticket={ticket} />);
    await waitFor(() => expect(ticketDesk).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });

  it("offers a picker only to someone who works more than one desk", async () => {
    const one = stub({ myDesks: vi.fn(async () => [desk()]) });
    const { container } = wrap(<SupportDeskPicker client={one} onChange={() => {}} />);
    await waitFor(() => expect(one.myDesks).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
    cleanup();
    const two = stub({ myDesks: vi.fn(async () => [desk(), acme]) });
    wrap(<SupportDeskPicker client={two} onChange={() => {}} />);
    expect((await screen.findByTestId("genesis-support-desk-picker")).textContent).toContain("Support");
  });

  it("lets a tenant's admin switch its desk", async () => {
    const setDesk = vi.fn(async () => undefined);
    const onChanged = vi.fn();
    const client = stub({ myDesks: vi.fn(async () => [desk(), north]), setDesk });
    wrap(<SupportDeskSwitch client={client} tenantId="north" onChanged={onChanged} />);
    fireEvent.click(await screen.findByTestId("genesis-support-desk-switch-toggle"));
    await waitFor(() => expect(setDesk).toHaveBeenCalledWith("north", true));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(true));
  });

  it("shows the switch disabled to an agent who doesn't manage the desk", async () => {
    const client = stub({ myDesks: vi.fn(async () => [{ ...north, manage: false }]), setDesk: vi.fn() });
    wrap(<SupportDeskSwitch client={client} tenantId="north" />);
    expect((await screen.findByTestId("genesis-support-desk-switch-toggle")).hasAttribute("disabled")).toBe(true);
  });
});

describe("desks' settings", () => {
  it("shows no desk card, picker or switch with support.desks off", async () => {
    const off = { "support.desks": false };
    const client = stub({
      myDesks: vi.fn(async () => [desk(), acme]),
      ticketDesk: vi.fn(async () => ({ tenantId: "acme", label: "Acme", isDefault: false, canEscalate: true, canReturn: false, returnsTo: null, returnsToLabel: null, lastMove: null })),
      deskMoveTargets: vi.fn(async () => []),
    });
    const { container } = wrap(
      <>
        <SupportDeskControls client={client} ticket={ticket} settings={off} />
        <SupportDeskPicker client={client} onChange={() => {}} settings={off} />
        <SupportDeskSwitch client={client} tenantId="acme" settings={off} />
      </>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
    expect(client.myDesks).not.toHaveBeenCalled();
    expect(client.ticketDesk).not.toHaveBeenCalled();
  });
});

describe("the agent desk's setting", () => {
  it("says the agent desk is off, and reads nothing, with support.agentDesk off", () => {
    const agentTickets = vi.fn(async () => []);
    const client = stub({ agentTickets });
    wrap(<SupportAgentInbox client={client} tenantId={null} ticketId={null} onTicketChange={() => {}} resolveUser={() => ({ name: "Someone" }) as never} settings={{ "support.agentDesk": false }} />);
    expect(screen.getByText("The agent desk is off")).toBeTruthy();
    expect(agentTickets).not.toHaveBeenCalled();
  });
});

describe("CodeRabbit follow-ups on the desk cards", () => {
  it("keeps two clients' desks apart in one QueryClient", async () => {
    const a = stub({ myDesks: vi.fn(async () => [desk(), acme]) });
    const b = stub({ myDesks: vi.fn(async () => [desk(), north]) });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SupportDeskPicker client={a} onChange={() => {}} />
        <SupportDeskPicker client={b} onChange={() => {}} value="north" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(b.myDesks).toHaveBeenCalled());
    expect(a.myDesks).toHaveBeenCalled();
  });

  it("offers no action the client can't do", async () => {
    const client = stub({
      ticketDesk: vi.fn(async () => ({ tenantId: "acme", label: "Acme", isDefault: false, canEscalate: true, canReturn: false, returnsTo: null, returnsToLabel: null, lastMove: null })),
      deskMoveTargets: vi.fn(async () => [{ tenantId: "app", label: null, isDefault: true }]),
    });
    const { container } = wrap(<SupportDeskControls client={client} ticket={ticket} />);
    await waitFor(() => expect(client.ticketDesk).toHaveBeenCalled());
    expect(screen.queryByTestId("genesis-support-desk-escalate")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("closes an open dialog when the ticket changes", async () => {
    const escalateTicket = vi.fn(async () => undefined);
    const client = stub({
      ticketDesk: vi.fn(async () => ({ tenantId: "acme", label: "Acme", isDefault: false, canEscalate: true, canReturn: false, returnsTo: null, returnsToLabel: null, lastMove: null })),
      deskMoveTargets: vi.fn(async () => []),
      escalateTicket,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={qc}><SupportDeskControls client={client} ticket={ticket} /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("genesis-support-desk-escalate"));
    expect(screen.getByTestId("genesis-support-desk-dialog")).toBeTruthy();
    const other = { ...ticket, id: "t2" } as AgentTicket;
    view.rerender(<QueryClientProvider client={qc}><SupportDeskControls client={client} ticket={other} /></QueryClientProvider>);
    expect(screen.queryByTestId("genesis-support-desk-dialog")).toBeNull();
    expect(escalateTicket).not.toHaveBeenCalled();
  });
});
