// @feat:support-helpdesk
// The agent inbox: the client's read path, and SupportAgentInbox on genesis-ui's inbox layouts.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupportClient, SupportError, type AgentTicket, type SupportClient, type SupportReply } from "..";
import { SupportAgentInbox } from "../web-chat";
import { fakeSupabase } from "./fake-supabase";

afterEach(cleanup);

const row = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  tenant_id: "ta",
  user_id: "u1",
  type: "question",
  title: "Export is broken",
  message: "It does nothing",
  status: "open",
  created_at: "2026-11-03T10:00:00Z",
  updated_at: "2026-11-03T10:00:00Z",
  conversation_id: "c1",
  assignee_id: null,
  activity_at: "2026-11-03T11:00:00Z",
  preview: "Still broken",
  agent_unread: true,
  ...over,
});

describe("the client's read path", () => {
  it("reads a queue through the function, and maps the agent's fields", async () => {
    const { client, rpcs } = fakeSupabase({ rpc: () => ({ data: [row({ last_staff_reply_at: "2026-11-03T12:00:00Z" })], error: null }) });
    const [ticket] = await createSupportClient(client).agentTickets!({ tenantId: "ta", view: "unassigned", before: { id: "t0", activityAt: "2026-11-04T00:00:00Z" }, limit: 10 });
    expect(rpcs[0]).toEqual({
      fn: "support_agent_tickets",
      args: { tenant: "ta", inbox_view: "unassigned", before_at: "2026-11-04T00:00:00Z", before_id: "t0", max_rows: 10 },
    });
    expect(ticket).toMatchObject({ id: "t1", tenantId: "ta", conversationId: "c1", assigneeId: null, preview: "Still broken", unread: true });
  });

  it("says unread from the agent's side, not the person's", async () => {
    const { client } = fakeSupabase({ rpc: () => ({ data: [row({ agent_unread: false })], error: null }) });
    const [ticket] = await createSupportClient(client).agentTickets!();
    expect(ticket?.unread).toBe(false);
  });

  it("passes a refusal on with its code", async () => {
    const { client } = fakeSupabase({ rpc: () => ({ data: null, error: { message: "only an agent", code: "42501" } }) });
    await expect(createSupportClient(client).agentTickets!()).rejects.toMatchObject({ code: "42501" });
  });

  it("marks the ticket itself read too when asked, for a conversation with no messages", async () => {
    const { client, rpcs } = fakeSupabase({ rpc: (fn) => (fn === "support_chat_conversation" ? { data: "c1", error: null } : { data: null, error: null }) });
    const chat = { markRead: vi.fn(async () => 0) };
    const support = createSupportClient(client, { chat: chat as never });
    await support.markRead("t1");
    expect(rpcs.map((r) => r.fn)).not.toContain("support_mark_read");
    await support.markRead("t1", { ticket: true });
    expect(chat.markRead).toHaveBeenCalledTimes(2);
    expect(rpcs.map((r) => r.fn)).toContain("support_mark_read");
  });

  it("takes a file's URL from signing when it has a path, never from what the message carries", async () => {
    const { client } = fakeSupabase({ rpc: (fn) => (fn === "support_chat_conversation" ? { data: "c1", error: null } : { data: null, error: null }) });
    const file = { kind: "image", mime: "image/png", name: "a.png", width: null, height: null, durationMs: null };
    const chat = {
      messages: vi.fn(async () => ({
        hasEarlier: false,
        messages: [
          {
            id: "m",
            seq: 1,
            senderId: "u1",
            senderRole: "member",
            kind: "text",
            body: "See",
            visibility: "everyone",
            createdAt: "2026-11-03T10:00:00Z",
            deletedAt: null,
            attachments: [
              { ...file, id: "signed", path: "ok/a.png", url: null },
              { ...file, id: "unsigned", path: "nope", url: "https://elsewhere.test/a.png" },
              { ...file, id: "outside", path: null, url: "https://elsewhere.test/b.png" },
            ],
          },
        ],
      })),
      fileUrls: vi.fn(async () => ({ "ok/a.png": "https://signed.test/a.png" })),
    };
    const [reply] = await createSupportClient(client, { chat: chat as never }).replies("t1");
    const byId = Object.fromEntries((reply?.attachments ?? []).map((a) => [a.id, a]));
    expect(byId["signed"]).toMatchObject({ url: "https://signed.test/a.png", stored: true });
    expect(byId["unsigned"]).toMatchObject({ url: null, stored: false });
    expect(byId["outside"]).toMatchObject({ url: "https://elsewhere.test/b.png", stored: false });
  });

  it("reads one ticket and the counts", async () => {
    const { client, rpcs } = fakeSupabase({
      rpc: (fn) => (fn === "support_agent_ticket_counts" ? { data: [{ inbox_view: "mine", tickets: 1 }, { inbox_view: "unassigned", tickets: 2 }, { inbox_view: "all", tickets: 3 }], error: null } : { data: [], error: null }),
    });
    const support = createSupportClient(client);
    expect(await support.agentTicket!("t1", { tenantId: "ta" })).toBeNull();
    expect(rpcs[0]).toEqual({ fn: "support_agent_tickets", args: { tenant: "ta", only_id: "t1" } });
    expect(await support.agentTicketCounts!()).toEqual({ mine: 1, unassigned: 2, all: 3 });
  });
});

const ticket = (over: Partial<AgentTicket> = {}): AgentTicket => ({
  id: "t1",
  tenantId: "ta",
  type: "question",
  title: "Export is broken",
  message: "It does nothing",
  status: "open",
  featureId: null,
  route: "/reports",
  appVersion: "1.2.3",
  createdAt: "2026-11-03T10:00:00Z",
  updatedAt: "2026-11-03T10:00:00Z",
  lastStaffReplyAt: null,
  lastUserReplyAt: null,
  userReadAt: null,
  staffReadAt: null,
  unread: true,
  userId: "u1",
  severity: "high",
  channel: null,
  requesterEmail: null,
  requesterName: null,
  platform: null,
  device: {},
  conversationId: "c1",
  assigneeId: null,
  activityAt: "2026-11-03T11:00:00Z",
  preview: "Still broken",
  ...over,
});

const reply = (over: Partial<SupportReply>): SupportReply => ({ id: "r", reportId: "t1", body: "", fromStaff: false, mine: false, createdAt: "2026-11-03T10:00:00Z", ...over });

function fakeClient(over: Partial<SupportClient> = {}) {
  return {
    agentTickets: vi.fn(async () => [ticket(), ticket({ id: "t2", title: "Second", preview: "Hello", unread: false, assigneeId: "a1" })]),
    agentTicket: vi.fn(async (id: string) => ticket({ id })),
    agentTicketCounts: vi.fn(async () => ({ mine: 1, unassigned: 1, all: 2 })),
    thread: vi.fn(async () => ({ mode: "chat" as const, conversationId: "c1" })),
    replies: vi.fn(async () => [
      reply({ id: "m1", body: "It does nothing", authorId: "u1" }),
      reply({ id: "m2", body: "Looking", fromStaff: true, mine: true, authorId: "a1" }),
      reply({ id: "m3", body: "A note", fromStaff: true, internal: true, authorId: "a2" }),
    ]),
    reply: vi.fn(async () => reply({ id: "sent" })),
    markRead: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    attachments: vi.fn(async () => []),
    setStatus: vi.fn(async () => undefined),
    assign: vi.fn(async () => undefined),
    ...over,
  } as unknown as SupportClient & Record<string, ReturnType<typeof vi.fn>>;
}

const names: Record<string, string> = { u1: "Ada", a1: "Sam", a2: "Kit" };

function show(client: SupportClient, props: Partial<Parameters<typeof SupportAgentInbox>[0]> = {}) {
  const onTicketChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SupportAgentInbox client={client} tenantId="ta" ticketId={null} onTicketChange={onTicketChange} resolveUser={(id) => ({ name: names[id] ?? id })} {...props} />
    </QueryClientProvider>,
  );
  return { onTicketChange };
}

describe("SupportAgentInbox", () => {
  it("lists a queue with who has each ticket, and opens one through the router", async () => {
    const client = fakeClient();
    const { onTicketChange } = show(client);
    expect(await screen.findByText("Export is broken")).toBeTruthy();
    expect(client.agentTickets).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "ta", view: "mine" }));
    expect(screen.getByText("Open · Nobody")).toBeTruthy();
    expect(screen.getByText("Open · Sam")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-support-agent-list-row-t2"));
    expect(onTicketChange).toHaveBeenCalledWith("t2");
  });

  it("moves between views, with their counts", async () => {
    const client = fakeClient();
    show(client);
    const unassigned = await screen.findByTestId("genesis-support-agent-views-unassigned");
    await waitFor(() => expect(unassigned.textContent).toContain("1"));
    fireEvent.click(unassigned);
    await waitFor(() => expect(client.agentTickets).toHaveBeenCalledWith(expect.objectContaining({ view: "unassigned" })));
  });

  it("says so when the viewer isn't an agent, and tells the app", async () => {
    const onError = vi.fn();
    const refused = new SupportError("only an agent", "42501", "agentTickets");
    show(fakeClient({ agentTickets: vi.fn(async () => Promise.reject(refused)), agentTicketCounts: vi.fn(async () => Promise.reject(refused)) }), { onError });
    expect(await screen.findByText("These tickets aren't yours to see")).toBeTruthy();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(refused));
  });

  it("shows a ticket that isn't there as gone, not as a thread", async () => {
    show(fakeClient({ agentTicket: vi.fn(async () => null) }), { ticketId: "gone" });
    expect(await screen.findByText("That ticket isn't in this inbox.")).toBeTruthy();
  });

  it("shows the thread: mine, theirs by name, notes marked, and marks it read", async () => {
    const client = fakeClient();
    show(client, { ticketId: "t1" });
    const note = await screen.findByTestId("genesis-support-agent-thread-message-m3");
    expect(note.textContent).toContain("Internal note");
    expect(note.className).toContain("border-warning");
    expect(screen.getByTestId("genesis-support-agent-thread-message-m1").className).not.toContain("bg-primary");
    expect(screen.getByTestId("genesis-support-agent-thread-message-m2").className).toContain("bg-primary");
    expect(screen.getAllByText("Ada").length).toBeGreaterThan(0);
    await waitFor(() => expect(client.markRead).toHaveBeenCalledWith("t1", { ticket: true }));
    expect(client.subscribe).toHaveBeenCalledWith("t1", expect.any(Function));
  });

  it("reads support_replies from the agent's side when there is no author", async () => {
    show(fakeClient({ replies: vi.fn(async () => [reply({ id: "m1", body: "From them", mine: true }), reply({ id: "m2", body: "From us", fromStaff: true })]) }), { ticketId: "t1" });
    const theirs = await screen.findByTestId("genesis-support-agent-thread-message-m1");
    expect(theirs.className).not.toContain("bg-primary");
    expect(screen.getByTestId("genesis-support-agent-thread-message-m2").className).toContain("bg-primary");
  });

  it("offers a note only on chat, and sends each kind", async () => {
    const client = fakeClient();
    show(client, { ticketId: "t1" });
    const box = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Thanks" } });
    fireEvent.click(await screen.findByTestId("genesis-support-agent-thread-composer-send"));
    await waitFor(() => expect(client.reply).toHaveBeenCalledWith("t1", "Thanks", { internal: false }));
    await waitFor(() => expect(box.value).toBe(""));
    fireEvent.click(screen.getByRole("radio", { name: "Internal note" }));
    fireEvent.change(box, { target: { value: "Between us" } });
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    await waitFor(() => expect(client.reply).toHaveBeenCalledWith("t1", "Between us", { internal: true }));
  });

  it("keeps the words when a send fails", async () => {
    const onError = vi.fn();
    const client = fakeClient({ reply: vi.fn(async () => Promise.reject(new Error("offline"))) });
    show(client, { ticketId: "t1", onError });
    const box = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Thanks" } });
    fireEvent.click(await screen.findByTestId("genesis-support-agent-thread-composer-send"));
    expect(await screen.findByTestId("genesis-support-agent-send-failed")).toBeTruthy();
    expect(box.value).toBe("Thanks");
    expect(onError).toHaveBeenCalled();
  });

  it("doesn't mark a ticket read from a hidden tab, and does on coming back", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const client = fakeClient();
    show(client, { ticketId: "t1" });
    await screen.findByTestId("genesis-support-agent-thread-message-m1");
    expect(client.markRead).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(client.markRead).toHaveBeenCalledTimes(1));
    visibility.mockRestore();
  });

  it("opens with the ticket's own words, which aren't a message in its conversation", async () => {
    show(fakeClient({ replies: vi.fn(async () => []) }), { ticketId: "t1" });
    const first = await screen.findByTestId("genesis-support-agent-thread-message-t1");
    expect(first.textContent).toContain("It does nothing");
    expect(first.className).not.toContain("bg-primary");
  });

  it("says a thread failed rather than showing it empty, and takes no reply", async () => {
    const onError = vi.fn();
    show(fakeClient({ replies: vi.fn(async () => Promise.reject(new Error("offline"))) }), { ticketId: "t1", onError });
    expect(await screen.findByText("Couldn't load this conversation")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onError).toHaveBeenCalled();
  });

  it("says an open ticket failed rather than that it's gone", async () => {
    show(fakeClient({ agentTicket: vi.fn(async () => Promise.reject(new Error("offline"))) }), { ticketId: "t1" });
    // After the inbox's own retries of a failure that isn't a refusal.
    expect(await screen.findByText("Couldn't open this ticket", {}, { timeout: 6000 })).toBeTruthy();
  });

  it("offers only the queues asked for, and starts on the first", async () => {
    const client = fakeClient();
    show(client, { views: ["all"] });
    await screen.findByTestId("genesis-support-agent-views-all");
    expect(screen.queryByTestId("genesis-support-agent-views-mine")).toBeNull();
    expect(client.agentTickets).toHaveBeenCalledWith(expect.objectContaining({ view: "all" }));
  });

  it("names an email ticket's sender", async () => {
    const client = fakeClient({ agentTicket: vi.fn(async () => ticket({ userId: null, requesterName: "Ada L", requesterEmail: "ada@example.test" })) });
    show(client, { ticketId: "t1" });
    fireEvent.click(await screen.findByTestId("genesis-support-agent-inbox-toggle-context"));
    const details = await screen.findByTestId("genesis-support-agent-details");
    expect(details.textContent).toContain("Ada L");
    expect(details.textContent).toContain("ada@example.test");
  });

  it("keeps the current assignee in the picker's options, and never the requester", async () => {
    show(fakeClient({ agentTicket: vi.fn(async () => ticket({ assigneeId: "a2" })) }), { ticketId: "t1", agents: [{ id: "u1", name: "Ada" }, { id: "a1", name: "Sam" }] });
    const picker = await screen.findByTestId("genesis-support-staff-assignee");
    expect(picker.textContent).toContain("Kit");
  });

  it("shows only a stored picture as a picture", async () => {
    const file = { kind: "image", mime: "image/png", width: null, height: null, durationMs: null };
    show(
      fakeClient({
        replies: vi.fn(async () => [
          reply({
            id: "m1",
            body: "See",
            authorId: "u1",
            attachments: [
              { ...file, id: "in", path: "ok/a.png", name: "a.png", url: "https://signed.test/a.png", stored: true },
              { ...file, id: "out", path: null, name: "b.png", url: "https://elsewhere.test/b.png", stored: false },
            ],
          }),
        ]),
      }),
      { ticketId: "t1" },
    );
    const inside = await screen.findByTestId("genesis-support-agent-thread-attachment-in");
    expect(inside.querySelector("img")).not.toBeNull();
    const outside = screen.getByTestId("genesis-support-agent-thread-attachment-out");
    expect(outside.querySelector("img")).toBeNull();
    expect(outside.textContent).toContain("b.png (elsewhere.test)");
  });

  it("has no note mode without chat", async () => {
    show(fakeClient({ thread: vi.fn(async () => ({ mode: "replies" as const, conversationId: null })) }), { ticketId: "t1" });
    await screen.findByRole("textbox");
    await waitFor(() => expect(screen.queryByRole("radio", { name: "Internal note" })).toBeNull());
  });

  it("opens a non-image file as a link, and never a non-web address", async () => {
    const attachment = { kind: "file", path: null, stored: false, mime: "application/pdf", width: null, height: null, durationMs: null };
    show(
      fakeClient({
        replies: vi.fn(async () => [
          reply({
            id: "m1",
            body: "See these",
            authorId: "u1",
            attachments: [
              { ...attachment, id: "pdf", name: "invoice.pdf", url: "https://files.test/invoice.pdf" },
              { ...attachment, id: "bad", name: "bad", url: "javascript:alert(1)" },
            ],
          }),
        ]),
      }),
      { ticketId: "t1" },
    );
    const link = await screen.findByTestId("genesis-support-agent-thread-attachment-pdf");
    const anchor = link.tagName === "A" ? link : link.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("https://files.test/invoice.pdf");
    expect(link.textContent).toContain("invoice.pdf (files.test)");
    expect(link.querySelector("img")).toBeNull();
    expect(screen.queryByTestId("genesis-support-agent-thread-attachment-bad")).toBeNull();
  });
});
