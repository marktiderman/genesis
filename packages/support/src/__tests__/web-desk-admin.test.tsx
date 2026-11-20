// @feat:support-desks
// The help desk's management on the web: agents (setAgent), linking an email ticket to a login,
// the desk card's states and log, the desk being off, and an agent's mentions.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@marktiderman/genesis-ui";
import { awaitsVerification, createSupportClient, type AgentTicket, type SupportClient, type SupportDesk } from "..";
import { SupportAgentInbox, SupportAgentsAdmin, SupportDeskControls, SupportDeskSwitch, SupportLinkRequester, SupportMyMentions, SupportRequesterPanel } from "../web-chat";
import { fakeSupabase } from "./fake-supabase";
import { GenesisTestProviders } from "./genesis-wrapper";

afterEach(cleanup);

const desk = (over: Partial<SupportDesk> = {}): SupportDesk => ({ tenantId: "app", label: null, isDefault: true, enabled: true, manage: false, openTickets: 0, ...over });
const stub = (over: Partial<SupportClient>) => over as SupportClient;
const ticket = (over: Partial<AgentTicket> = {}) => ({ id: "t1", tenantId: "acme", userId: "u9", platform: "ios", appVersion: "1.2.3", requesterEmail: null, channel: null, ...over }) as AgentTicket;
const show = (node: React.ReactNode) =>
  render(
    <GenesisTestProviders>
      {node}
      <Toaster />
    </GenesisTestProviders>,
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

describe("agents", () => {
  it("lists a desk's agents for its admin, and finds people to add by name", async () => {
    const setAgent = vi.fn(async () => undefined);
    const findPeople = vi.fn(async () => [{ id: "u5", name: "Cy" }]);
    const client = stub({
      myDesks: vi.fn(async () => [desk({ tenantId: "acme", label: "Acme", isDefault: false, manage: true })]),
      staffList: vi.fn(async () => [{ id: "u1", name: "Ana" }]),
      setAgent,
    });
    show(<SupportAgentsAdmin client={client} tenantId="acme" findPeople={findPeople} />);
    await waitFor(() => expect(screen.getByTestId("genesis-support-agents-list").textContent).toContain("Ana"));
    fireEvent.change(screen.getByTestId("genesis-support-agents-search"), { target: { value: "Cy" } });
    await waitFor(() => expect(findPeople).toHaveBeenCalledWith("Cy"));
    expect(await screen.findByTestId("genesis-support-agents-pick")).toBeTruthy();
    expect(client.staffList).toHaveBeenCalledWith({ tenantId: "acme" });
  });

  it("shows nothing to someone who doesn't run the desk", async () => {
    const client = stub({ myDesks: vi.fn(async () => [desk({ tenantId: "acme", isDefault: false, manage: false })]), staffList: vi.fn(async () => []), setAgent: vi.fn() });
    const { container } = show(<SupportAgentsAdmin client={client} tenantId="acme" />);
    await waitFor(() => expect(client.myDesks).toHaveBeenCalled());
    expect(container.querySelector("[data-testid=genesis-support-agents]")).toBeNull();
    expect(client.staffList).not.toHaveBeenCalled();
  });

  it("lets the desk's admin make the person who wrote an agent", async () => {
    const setAgent = vi.fn(async () => undefined);
    const client = stub({
      reporters: vi.fn(async () => [{ id: "u9", name: "Bo", email: "bo@example.test" }]),
      requesterTenants: vi.fn(async () => [{ tenantId: "acme", label: "Acme", role: "member" }]),
      myDesks: vi.fn(async () => [desk({ tenantId: "acme", isDefault: false, manage: true })]),
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

describe("linking an email ticket", () => {
  it("finds the person and links the ticket to their login", async () => {
    const linkRequester = vi.fn(async () => undefined);
    const onLinked = vi.fn();
    const client = stub({ linkRequester });
    show(<SupportLinkRequester client={client} ticket={ticket({ channel: "email", userId: null, requesterEmail: "bo@example.test" })} findPeople={async () => [{ id: "u9", name: "Bo" }]} onLinked={onLinked} />);
    fireEvent.change(screen.getByTestId("genesis-support-link-requester-search"), { target: { value: "bo" } });
    expect(await screen.findByTestId("genesis-support-link-requester-pick")).toBeTruthy();
    expect((screen.getByTestId("genesis-support-link-requester-send") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows nothing for a ticket with a login, or without a way to find people", () => {
    const client = stub({ linkRequester: vi.fn() });
    const { container } = show(
      <>
        <SupportLinkRequester client={client} ticket={ticket({ channel: "email" })} findPeople={async () => []} />
        <SupportLinkRequester client={client} ticket={ticket({ channel: "email", userId: null })} />
      </>,
    );
    expect(container.querySelector("[data-testid=genesis-support-link-requester]")).toBeNull();
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
  it("lists where the agent was mentioned, each opening its ticket", async () => {
    const onOpen = vi.fn();
    const client = stub({ agentMentions: vi.fn(async () => [{ id: "m1", reportId: "t7", messageId: "x", authorId: "u1", createdAt: "2026-11-19T09:00:00Z" }]) });
    show(<SupportMyMentions client={client} resolveUser={() => ({ name: "Ana" }) as never} onOpen={onOpen} />);
    fireEvent.click(await screen.findByTestId("genesis-support-mention-m1"));
    expect(onOpen).toHaveBeenCalledWith("t7");
  });
});
