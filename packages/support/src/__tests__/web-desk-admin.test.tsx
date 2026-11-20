// @feat:support-desks
// The help desk's management on the web: agents (setAgent), linking an email ticket to a login,
// the desk card's states and log, the desk being off, and an agent's mentions.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@marktiderman/genesis-ui";
import { awaitsVerification, createSupportClient, type AgentTicket, type SupportClient, type SupportDesk } from "..";
import { SupportAgentInbox, SupportAgentsAdmin, SupportDeskControls, SupportDeskSwitch, SupportLinkRequester, SupportMyMentions, SupportRequesterPanel } from "../web-chat";
import { fakeSupabase } from "./fake-supabase";
import { QueryProviders } from "./query-providers";

afterEach(cleanup);

const desk = (over: Partial<SupportDesk> = {}): SupportDesk => ({ tenantId: "app", label: null, isDefault: true, enabled: true, manage: false, openTickets: 0, ...over });
const stub = (over: Partial<SupportClient>) => over as SupportClient;
const ticket = (over: Partial<AgentTicket> = {}) => ({ id: "t1", tenantId: "acme", userId: "u9", platform: "ios", appVersion: "1.2.3", requesterEmail: null, channel: null, ...over }) as AgentTicket;
const show = (node: React.ReactNode) =>
  render(
    <QueryProviders>
      {node}
      <Toaster />
    </QueryProviders>,
  );

describe("the client's management calls", () => {
  it("links an email ticket to a login, and reads whether a fix awaits the person", async () => {
    const fake = fakeSupabase({ rpc: () => ({ data: null, error: null }) });
    await createSupportClient(fake.client).linkRequester!("t1", "u9");
    expect(fake.rpcs).toEqual([{ fn: "support_link_requester", args: { report: "t1", person: "u9" } }]);
    expect(awaitsVerification({ status: "addressed", verifiedAt: null })).toBe(true);
    expect(awaitsVerification({ status: "addressed", verifiedAt: "2026-11-20T00:00:00Z" })).toBe(false);
    expect(awaitsVerification({ status: "in_progress" })).toBe(false);
  });
});

/** Opens a genesis-ui Select from the keyboard and picks the option with these words. */
async function pick(trigger: HTMLElement, name: RegExp | string) {
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name }));
}

const manager = (over: Partial<SupportClient> = {}) =>
  stub({
    canManageAgents: vi.fn(async () => true),
    staffList: vi.fn(async () => [
      { id: "u1", name: "Ana", role: "admin" as const, removable: false },
      { id: "u2", name: "Bo", role: "agent" as const, removable: true },
    ]),
    searchPeople: vi.fn(async () => [{ personId: "p5", userId: "u5", name: "Cy", email: "cy@example.test" }]),
    setAgent: vi.fn(async () => undefined),
    ...over,
  });

describe("agents", () => {
  it("lists the desk's agents with their roles for whoever manages them", async () => {
    const client = manager();
    show(<SupportAgentsAdmin client={client} tenantId="acme" />);
    expect(screen.getByTestId("genesis-support-agents-loading")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("genesis-support-agents-list").textContent).toContain("Bo"));
    const list = screen.getByTestId("genesis-support-agents-list").textContent ?? "";
    expect(list).toContain("Admin");
    expect(list).toContain("Agent");
    expect(client.canManageAgents).toHaveBeenCalledWith({ tenantId: "acme" });
    expect(client.staffList).toHaveBeenCalledWith({ tenantId: "acme" });
  });

  it("adds someone found in the desk's tenant, as an admin", async () => {
    const client = manager();
    show(<SupportAgentsAdmin client={client} tenantId="acme" />);
    fireEvent.change(await screen.findByTestId("genesis-support-agents-search"), { target: { value: "cy" } });
    await waitFor(() => expect(client.searchPeople).toHaveBeenCalledWith({ tenantId: "acme", query: "cy" }));
    await pick(await screen.findByTestId("genesis-support-agents-pick"), /Cy/);
    await pick(screen.getByTestId("genesis-support-agents-role"), "Admin");
    fireEvent.click(screen.getByTestId("genesis-support-agents-add-send"));
    // The person record found in the tenant, which ticket_agents holds.
    await waitFor(() => expect(client.setAgent).toHaveBeenCalledWith("acme", "p5", "admin"));
    expect(await screen.findByText("Cy is now an agent")).toBeTruthy();
  });

  it("removes only a removable agent, after a confirm", async () => {
    const client = manager();
    show(<SupportAgentsAdmin client={client} tenantId="acme" />);
    await waitFor(() => expect(screen.getByTestId("genesis-support-agents-list").textContent).toContain("Bo"));
    // Ana manages the desk through the app: her row offers no Remove.
    expect((await screen.findByText("Ana")).closest("tr")?.querySelector("[data-testid=resource-row-menu]")).toBeNull();
    await removeRow("Bo");
    await waitFor(() => expect(client.setAgent).toHaveBeenCalledWith("acme", "u2", null));
    expect(client.setAgent).not.toHaveBeenCalledWith("acme", "u1", null);
  });

  it("works the app's own desk by a null tenant", async () => {
    const client = manager();
    show(<SupportAgentsAdmin client={client} tenantId={null} />);
    await waitFor(() => expect(screen.getByTestId("genesis-support-agents-list").textContent).toContain("Bo"));
    expect(client.canManageAgents).toHaveBeenCalledWith({ tenantId: null });
    expect(client.staffList).toHaveBeenCalledWith({ tenantId: null });
    await removeRow("Bo");
    await waitFor(() => expect(client.setAgent).toHaveBeenCalledWith(null, "u2", null));
  });

  it("tells someone who doesn't manage the desk, and says when that couldn't be checked", async () => {
    const no = manager({ canManageAgents: vi.fn(async () => false) });
    show(<SupportAgentsAdmin client={no} tenantId="acme" />);
    expect(await screen.findByTestId("genesis-support-agents-not-manager")).toBeTruthy();
    expect(no.staffList).not.toHaveBeenCalled();
    cleanup();
    show(<SupportAgentsAdmin client={manager({ canManageAgents: vi.fn(async () => Promise.reject(new Error("down"))) })} tenantId="acme" />);
    expect((await screen.findByTestId("genesis-support-agents-check-failed")).getAttribute("role")).toBe("alert");
  });

  it("lets whoever manages the desk make the person who wrote an agent", async () => {
    const setAgent = vi.fn(async () => undefined);
    const client = stub({
      reporters: vi.fn(async () => [{ id: "u9", name: "Bo", email: "bo@example.test" }]),
      requesterTenants: vi.fn(async () => [{ tenantId: "acme", label: "Acme", role: "member" }]),
      canManageAgents: vi.fn(async () => true),
      setAgent,
    });
    show(<SupportRequesterPanel client={client} ticket={ticket()} />);
    fireEvent.click(await screen.findByTestId("genesis-support-requester-make-agent"));
    await waitFor(() => expect(setAgent).toHaveBeenCalledWith("acme", "u9", "agent"));
    expect(await screen.findByText("They're now an agent of this help desk")).toBeTruthy();
  });

  it("says when who wrote couldn't be read", async () => {
    const client = stub({ reporters: vi.fn(async () => Promise.reject(new Error("down"))) });
    show(<SupportRequesterPanel client={client} ticket={ticket()} />);
    expect(screen.getByTestId("genesis-support-requester-loading")).toBeTruthy();
    expect((await screen.findByTestId("genesis-support-requester-failed")).getAttribute("role")).toBe("alert");
  });
});

/** Runs a view list row's action from its "More" menu, then confirms. */
async function removeRow(name: string) {
  const row = (await screen.findByText(name)).closest("tr");
  const menu = row?.querySelector<HTMLElement>("[data-testid=resource-row-menu]");
  if (!menu) throw new Error(`No row menu for ${name}`);
  fireEvent.pointerDown(menu, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
}

describe("linking an email ticket", () => {
  const email = ticket({ channel: "email", userId: null, requesterEmail: "bo@example.test" });

  it("finds the person in the ticket's tenant and links after a confirm that names both", async () => {
    const linkRequester = vi.fn(async () => undefined);
    const onLinked = vi.fn();
    const client = manager({ linkRequester, searchPeople: vi.fn(async () => [{ personId: "p9", userId: "u9", name: "Bo", email: "bo@acme.test" }]) });
    show(<SupportLinkRequester client={client} ticket={email} onLinked={onLinked} />);
    fireEvent.change(await screen.findByTestId("genesis-support-link-requester-search"), { target: { value: "bo" } });
    await waitFor(() => expect(client.searchPeople).toHaveBeenCalledWith({ tenantId: "acme", query: "bo" }));
    await pick(await screen.findByTestId("genesis-support-link-requester-pick"), /Bo/);
    fireEvent.click(screen.getByTestId("genesis-support-link-requester-send"));
    const confirm = await screen.findByTestId("genesis-support-link-requester-confirm");
    expect(confirm.textContent).toContain("bo@example.test");
    expect(confirm.textContent).toContain("Bo (bo@acme.test)");
    expect(linkRequester).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("genesis-support-link-requester-confirm-send"));
    // Linking takes the login.
    await waitFor(() => expect(linkRequester).toHaveBeenCalledWith("t1", "u9"));
    expect(onLinked).toHaveBeenCalledWith("t1");
  });

  it("shows nothing for a ticket with a login, or without a search", async () => {
    const { container } = show(
      <>
        <SupportLinkRequester client={manager({ linkRequester: vi.fn() })} ticket={ticket({ channel: "email" })} />
        <SupportLinkRequester client={manager({ linkRequester: vi.fn(), searchPeople: undefined })} ticket={email} />
      </>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector("[data-testid=genesis-support-link-requester]")).toBeNull();
  });

  it("is offered to any agent who handles the ticket, not only to whoever manages agents", async () => {
    show(<SupportLinkRequester client={manager({ linkRequester: vi.fn(), canManageAgents: vi.fn(async () => false) })} ticket={email} />);
    expect(await screen.findByTestId("genesis-support-link-requester-search")).toBeTruthy();
  });
});

describe("the desk card", () => {
  const atAcme = { tenantId: "acme", label: "Acme", isDefault: false, canEscalate: true, canReturn: false, returnsTo: null, returnsToLabel: null, lastMove: null };

  it("says when where the ticket is couldn't be read", async () => {
    show(<SupportDeskControls client={stub({ ticketDesk: vi.fn(async () => Promise.reject(new Error("down"))) })} ticket={ticket()} />);
    expect(screen.getByTestId("genesis-support-desk-loading")).toBeTruthy();
    expect((await screen.findByTestId("genesis-support-desk-failed")).getAttribute("role")).toBe("alert");
  });

  it("confirms a move with a toast", async () => {
    const escalateTicket = vi.fn(async () => undefined);
    const onMoved = vi.fn();
    show(<SupportDeskControls client={stub({ ticketDesk: vi.fn(async () => atAcme), deskMoveTargets: vi.fn(async () => [{ tenantId: "app", label: null, isDefault: true }]), escalateTicket })} ticket={ticket()} onMoved={onMoved} />);
    fireEvent.click(await screen.findByTestId("genesis-support-desk-escalate"));
    fireEvent.click(screen.getByTestId("genesis-support-desk-send"));
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith("t1"));
    expect(await screen.findByText("Sent to Support")).toBeTruthy();
  });

  it("opens the desk's log", async () => {
    const deskHistory = vi.fn(async () => [{ id: "1", tenantId: "acme", ticketId: null, toTenantId: null, action: "turned_on" as const, reason: null, actorId: "u1", actorName: "Ana", at: "2026-11-19T09:00:00Z" }]);
    show(<SupportDeskControls client={stub({ ticketDesk: vi.fn(async () => ({ ...atAcme, canEscalate: false })), deskMoveTargets: vi.fn(async () => []), deskHistory })} ticket={ticket()} />);
    fireEvent.click(await screen.findByTestId("genesis-support-desk-log-toggle"));
    await waitFor(() => expect(screen.getByTestId("genesis-support-desk-log").textContent).toContain("Ana turned the desk on"));
    expect(deskHistory).toHaveBeenCalledWith({ tenantId: "acme", limit: 20 });
  });

  it("confirms a switch with a toast", async () => {
    const setDesk = vi.fn(async () => undefined);
    show(<SupportDeskSwitch client={stub({ myDesks: vi.fn(async () => [desk({ tenantId: "acme", isDefault: false, enabled: false, manage: true })]), setDesk })} tenantId="acme" />);
    fireEvent.click(await screen.findByRole("switch"));
    await waitFor(() => expect(setDesk).toHaveBeenCalledWith("acme", true));
    expect(await screen.findByText("Questions now come to your help desk")).toBeTruthy();
  });
});

describe("a desk that is off", () => {
  const inbox = (open: number) =>
    show(
      <SupportAgentInbox
        client={stub({
          myDesks: vi.fn(async () => [desk({ tenantId: "acme", isDefault: false, enabled: false, manage: true, openTickets: open })]),
          agentTickets: vi.fn(async () => []),
          agentTicketCounts: vi.fn(async () => ({ mine: 0, unassigned: 0, all: 0 })),
        })}
        tenantId="acme"
        ticketId={null}
        onTicketChange={() => {}}
        resolveUser={() => ({ name: "Someone" }) as never}
      />,
    );

  it("says so over the conversations it still has", async () => {
    inbox(2);
    expect((await screen.findByTestId("genesis-support-agent-desk-is-off")).textContent).toContain("Your help desk is off");
    expect(screen.getByTestId("genesis-support-agent-inbox")).toBeTruthy();
  });

  it("has nothing to answer once it's empty", async () => {
    inbox(0);
    expect((await screen.findByTestId("genesis-support-agent-no-desk")).textContent).toContain("No help desk to answer");
    expect(screen.queryByTestId("genesis-support-agent-inbox")).toBeNull();
  });
});

describe("my mentions", () => {
  it("reads again for another login on the same client, and never shows the last one's", async () => {
    let user = "ana";
    const fake = fakeSupabase({
      userId: "ana",
      respond: (call) => (call.table === "ticket_mentions" ? { data: [{ id: `m-${user}`, report_id: `t-${user}`, message_id: "x", author_id: "u1", created_at: "2026-11-19T09:00:00Z" }], error: null } : undefined),
    });
    const client = createSupportClient(fake.client);
    const onOpen = vi.fn();
    show(<SupportMyMentions client={client} resolveUser={() => ({ name: "Kit" }) as never} onOpen={onOpen} />);
    expect(await screen.findByTestId("genesis-support-mention-m-ana")).toBeTruthy();
    user = "bo";
    act(() => fake.signIn("bo"));
    expect(await screen.findByTestId("genesis-support-mention-m-bo")).toBeTruthy();
    expect(screen.queryByTestId("genesis-support-mention-m-ana")).toBeNull();
  });

  it("says when the login can't be read, rather than loading for ever", async () => {
    const client = stub({ signedInId: vi.fn(async () => Promise.reject(new Error("down"))), agentMentions: vi.fn(async () => []) });
    show(<SupportMyMentions client={client} resolveUser={() => ({ name: "Kit" }) as never} onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("genesis-support-mentions-list").textContent).toContain("Couldn't load your mentions"));
    expect(client.agentMentions).not.toHaveBeenCalled();
  });

  it("lists where the agent was mentioned, each opening its ticket", async () => {
    const onOpen = vi.fn();
    const client = stub({ agentMentions: vi.fn(async () => [{ id: "m1", reportId: "t7", messageId: "x", authorId: "u1", createdAt: "2026-11-19T09:00:00Z" }]) });
    show(<SupportMyMentions client={client} resolveUser={() => ({ name: "Ana" }) as never} onOpen={onOpen} />);
    fireEvent.click(await screen.findByTestId("genesis-support-mention-m1"));
    expect(onOpen).toHaveBeenCalledWith("t7");
  });
});
