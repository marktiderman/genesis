// @feat:support-helpdesk
// The agent's desk: queues and how long someone has waited, earlier conversations, the composer's
// pickers (mentions, saved replies, articles), a held reply, saved replies, reports, and the
// messenger's reply expectation and office hours.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSupportClient, defineSupportChatBlock, defineSupportEmailBlock, defineSupportHelpdeskBlock, officeHoursState, SupportError, waitingSinceOf, type AgentTicket, type SupportClient, type SupportReply, type Ticket } from "..";
import { SupportAgentInbox, SupportAgentReports, SupportMessenger, SupportSavedRepliesAdmin } from "../web-chat";
import { mentionMarkup, pickerToken, showMentions } from "../web-chat/composer-pickers";
import { fakeSupabase } from "./fake-supabase";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const AGENT = "00000000-0000-4000-8000-0000000000c4";

const ticket = (over: Partial<AgentTicket> = {}): AgentTicket => ({
  id: "t1",
  tenantId: "ta",
  type: "question",
  title: "Export is broken",
  message: "It does nothing",
  status: "open",
  featureId: null,
  route: null,
  appVersion: null,
  createdAt: "2026-11-03T10:00:00Z",
  updatedAt: "2026-11-03T10:00:00Z",
  lastStaffReplyAt: null,
  lastUserReplyAt: null,
  userReadAt: null,
  staffReadAt: null,
  unread: false,
  userId: "u1",
  severity: null,
  channel: null,
  requesterEmail: "ada@example.test",
  requesterName: null,
  platform: null,
  device: {},
  conversationId: "c1",
  assigneeId: null,
  activityAt: "2026-11-03T11:00:00Z",
  preview: "Still broken",
  waitingSince: null,
  ...over,
});

const reply = (over: Partial<SupportReply>): SupportReply => ({ id: "r", reportId: "t1", body: "", fromStaff: false, mine: false, createdAt: "2026-11-03T10:00:00Z", ...over });

function fakeClient(over: Partial<SupportClient> = {}) {
  return {
    agentTickets: vi.fn(async () => [ticket()]),
    agentTicket: vi.fn(async (id: string) => ticket({ id })),
    agentTicketCounts: vi.fn(async () => ({ mine: 1, unassigned: 2, all: 3 })),
    agentEarlierTickets: vi.fn(async () => [{ id: "t0", title: "Can't sign in", message: "Help", status: "addressed" as const, createdAt: "2026-10-01T10:00:00Z", activityAt: "2026-10-01T10:00:00Z" }]),
    thread: vi.fn(async () => ({ mode: "chat" as const, conversationId: "c1" })),
    replies: vi.fn(async () => [reply({ id: "m1", body: "It does nothing", authorId: "u1" })]),
    reply: vi.fn(async () => reply({ id: "sent" })),
    markRead: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    attachments: vi.fn(async () => []),
    setStatus: vi.fn(async () => undefined),
    assign: vi.fn(async () => undefined),
    savedReplies: vi.fn(async () => [
      { id: "s1", title: "Refund", body: "Hi {first_name}, your refund is on its way. {signature}", updatedAt: "2026-11-01T00:00:00Z" },
      { id: "s2", title: "Reset password", body: "Hi {first_name}, open Settings.", updatedAt: "2026-11-01T00:00:00Z" },
    ]),
    searchHelp: vi.fn(async () => [{ id: "a1", collectionId: null, slug: "reset-password", title: "Reset your password", summary: null }]),
    helpArticles: vi.fn(async () => []),
    agentDesk: vi.fn(async () => ({ queues: true, tools: true })),
    ...over,
  } as unknown as SupportClient & Record<string, ReturnType<typeof vi.fn>>;
}

const names: Record<string, string> = { u1: "Ada Lovelace", [AGENT]: "Kit" };
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;

function inbox(client: SupportClient, props: Partial<Parameters<typeof SupportAgentInbox>[0]> = {}) {
  const onTicketChange = vi.fn();
  render(
    <SupportAgentInbox
      client={client}
      tenantId="ta"
      ticketId={null}
      onTicketChange={onTicketChange}
      resolveUser={(id) => ({ name: names[id] ?? id })}
      agents={[{ id: AGENT, name: "Kit" }]}
      articleHref={(a) => `https://help.example.test/${a.slug}`}
      {...props}
    />,
    { wrapper },
  );
  return { onTicketChange };
}

async function composer() {
  return (await screen.findByRole("textbox")) as HTMLTextAreaElement;
}

describe("the blocks' manifest", () => {
  it("lists the same migrations in package.json (what genesis add reads) as each block declares", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));
    for (const block of [defineSupportChatBlock(), defineSupportHelpdeskBlock(), defineSupportEmailBlock()]) {
      const manifest = pkg.genesis.blocks[block.id];
      expect(manifest.migrations.map((m: { file: string }) => m.file), block.id).toEqual(block.contributes!.migrations!.map((m) => m.file));
    }
    expect(pkg.genesis.blocks["support-chat"].migrations.map((m: { file: string }) => m.file)).toContain("migrations/0014_genesis_support_agent_tools.sql");
  });
});

describe("the client", () => {
  it("reads how long a requester has waited, and works it out without migration 0013", async () => {
    const row = { id: "t1", tenant_id: "ta", status: "open", created_at: "2026-11-03T10:00:00Z", updated_at: "2026-11-03T10:00:00Z", activity_at: "2026-11-03T10:00:00Z" };
    const { client } = fakeSupabase({ rpc: () => ({ data: [{ ...row, waiting_since: "2026-11-03T10:30:00Z" }, { ...row, id: "t2" }], error: null }) });
    const [withColumn, without] = await createSupportClient(client).agentTickets!();
    expect(withColumn?.waitingSince).toBe("2026-11-03T10:30:00Z");
    expect(without?.waitingSince).toBe("2026-11-03T10:00:00Z");
    const base: Pick<Ticket, "status" | "createdAt" | "lastStaffReplyAt" | "lastUserReplyAt"> = { status: "open", createdAt: "2026-11-03T10:00:00Z", lastStaffReplyAt: "2026-11-03T11:00:00Z", lastUserReplyAt: null };
    expect(waitingSinceOf(base)).toBeNull();
    expect(waitingSinceOf({ ...base, lastUserReplyAt: "2026-11-03T12:00:00Z" })).toBe("2026-11-03T12:00:00Z");
    expect(waitingSinceOf({ ...base, lastStaffReplyAt: null, status: "pending" })).toBeNull();
  });

  it("calls each agent function with its arguments, and maps what comes back", async () => {
    const { client, rpcs, calls } = fakeSupabase({
      rpc: (fn) => {
        if (fn === "support_agent_requester_tickets") return { data: [{ id: "t0", title: null, message: "Old", status: "addressed", created_at: "2026-10-01T00:00:00Z", activity_at: "2026-10-02T00:00:00Z" }], error: null };
        if (fn === "support_saved_replies") return { data: [{ id: "s1", title: "Refund", body: "Hi", updated_at: "2026-11-01T00:00:00Z" }], error: null };
        if (fn === "support_save_reply") return { data: "s9", error: null };
        if (fn === "support_agent_report")
          return { data: { from_at: "a", to_at: "b", opened: 4, closed: 2, open_now: 3, median_first_response_seconds: 3600, median_close_seconds: null, by_requester: [{ label: "Acme", open: 2 }, { label: null, open: 1 }] }, error: null };
        return { data: null, error: null };
      },
      respond: (call) => (call.table === "ticket_mentions" ? { data: [{ id: "x", report_id: "t1", message_id: "m", author_id: "a", created_at: "2026-11-01T00:00:00Z" }], error: null } : undefined),
    });
    const support = createSupportClient(client, { tenantId: "ta" });
    expect(await support.agentEarlierTickets!("t1", { limit: 5 })).toEqual([{ id: "t0", title: null, message: "Old", status: "addressed", createdAt: "2026-10-01T00:00:00Z", activityAt: "2026-10-02T00:00:00Z" }]);
    expect(rpcs.at(-1)).toEqual({ fn: "support_agent_requester_tickets", args: { report: "t1", max_rows: 5 } });
    expect(await support.savedReplies!()).toEqual([{ id: "s1", title: "Refund", body: "Hi", updatedAt: "2026-11-01T00:00:00Z" }]);
    expect(rpcs.at(-1)).toEqual({ fn: "support_saved_replies", args: { tenant: "ta" } });
    expect(await support.saveSavedReply!({ title: "Refund", body: "Hi" })).toBe("s9");
    expect(rpcs.at(-1)).toEqual({ fn: "support_save_reply", args: { saved: null, tenant: "ta", title: "Refund", body: "Hi" } });
    await support.saveSavedReply!({ id: "s1", title: "Refund", body: "Hello" });
    expect(rpcs.at(-1)).toEqual({ fn: "support_save_reply", args: { saved: "s1", tenant: null, title: "Refund", body: "Hello" } });
    await support.deleteSavedReply!("s1");
    expect(rpcs.at(-1)).toEqual({ fn: "support_delete_saved_reply", args: { saved: "s1" } });
    const report = await support.agentReport!({ from: new Date("2026-10-01T00:00:00Z"), to: "2026-11-01T00:00:00Z" });
    expect(rpcs.at(-1)).toEqual({ fn: "support_agent_report", args: { tenant: "ta", from_at: "2026-10-01T00:00:00.000Z", to_at: "2026-11-01T00:00:00Z" } });
    expect(report).toMatchObject({ opened: 4, closed: 2, openNow: 3, medianFirstResponseSeconds: 3600, medianCloseSeconds: null, byRequester: [{ label: "Acme", open: 2 }, { label: null, open: 1 }] });
    expect(await support.agentMentions!()).toEqual([{ id: "x", reportId: "t1", messageId: "m", authorId: "a", createdAt: "2026-11-01T00:00:00Z" }]);
    expect(calls.at(-1)?.table).toBe("ticket_mentions");
  });
});

describe("the queues", () => {
  it("offers Pending and Closed, with counts only on the active queues", async () => {
    const client = fakeClient();
    inbox(client);
    const pending = await screen.findByTestId("genesis-support-agent-views-pending");
    await waitFor(() => expect(screen.getByTestId("genesis-support-agent-views-all").textContent).toContain("3"));
    expect(pending.textContent).toBe("Pending");
    expect(screen.getByTestId("genesis-support-agent-views-closed").textContent).toBe("Closed");
    fireEvent.click(pending);
    await waitFor(() => expect(client.agentTickets).toHaveBeenCalledWith(expect.objectContaining({ view: "pending" })));
  });

  it("shows who wrote, the status, who has it and how long they've waited", async () => {
    const since = new Date(Date.now() - 3 * 3_600_000 - 60_000).toISOString();
    inbox(fakeClient({ agentTickets: vi.fn(async () => [ticket({ waitingSince: since }), ticket({ id: "t2", status: "pending", assigneeId: AGENT })]) }));
    expect(await screen.findByText("Ada Lovelace · Open · Nobody · waiting 3h")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace · Pending · Kit")).toBeTruthy();
  });

  it("lists the requester's earlier conversations, each opening in the inbox", async () => {
    const client = fakeClient();
    const { onTicketChange } = inbox(client, { ticketId: "t1" });
    fireEvent.click(await screen.findByTestId("genesis-support-agent-inbox-toggle-context"));
    const earlier = await screen.findByTestId("genesis-support-agent-earlier-t0");
    expect(earlier.textContent).toContain("Can't sign in");
    expect(earlier.textContent).toContain("Fixed");
    expect(client.agentEarlierTickets).toHaveBeenCalledWith("t1");
    fireEvent.click(earlier);
    expect(onTicketChange).toHaveBeenCalledWith("t0");
  });

  it("keeps the app's own cards in the details", async () => {
    inbox(fakeClient(), { ticketId: "t1", context: (t) => <p>Company of {t.userId}</p> });
    fireEvent.click(await screen.findByTestId("genesis-support-agent-inbox-toggle-context"));
    expect(await screen.findByText("Company of u1")).toBeTruthy();
  });
});

describe("the composer's pickers", () => {
  it("finds the trigger being typed", () => {
    expect(pickerToken("Hi !ref")).toEqual({ kind: "saved", start: 3, query: "ref" });
    expect(pickerToken("?r")).toEqual({ kind: "article", start: 0, query: "r" });
    expect(pickerToken("?")).toBeNull();
    expect(pickerToken("Merci !")).toBeNull();
    expect(pickerToken("Can you help?")).toBeNull();
    expect(pickerToken("mail me@x")).toBeNull();
    expect(mentionMarkup({ id: AGENT, name: "Kit [lead]" })).toBe(`@[Kit lead](user:${AGENT})`);
    expect(showMentions(`Over to ${mentionMarkup({ id: AGENT, name: "Kit" })}`)).toBe("Over to @Kit");
  });

  it("inserts a saved reply with the requester's name filled, from ! and the keyboard", async () => {
    const client = fakeClient();
    inbox(client, { ticketId: "t1" });
    const box = await composer();
    fireEvent.change(box, { target: { value: "!re" } });
    const picker = await screen.findByTestId("genesis-support-agent-thread-composer-picker");
    expect(await within(picker).findByText("Refund")).toBeTruthy();
    expect(box.getAttribute("aria-controls")).toBeTruthy();
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(box.value).toBe("Hi Ada, open Settings."));
    expect(client.reply).not.toHaveBeenCalled();
    expect(screen.queryByTestId("genesis-support-agent-thread-composer-picker")).toBeNull();
  });

  it("fills the app's own variables, and leaves unknown ones as written", async () => {
    inbox(fakeClient(), { ticketId: "t1", replyVariables: () => ({ signature: "Kit, Support" }) });
    const box = await composer();
    fireEvent.change(box, { target: { value: "Thanks. !Refund" } });
    fireEvent.click(await screen.findByTestId("genesis-support-agent-thread-composer-picker-option-s1"));
    await waitFor(() => expect(box.value).toBe("Thanks. Hi Ada, your refund is on its way. Kit, Support"));
  });

  it("links a help article from ?", async () => {
    const client = fakeClient();
    inbox(client, { ticketId: "t1" });
    const box = await composer();
    fireEvent.change(box, { target: { value: "See ?reset" } });
    fireEvent.click(await screen.findByTestId("genesis-support-agent-thread-composer-picker-option-a1"));
    await waitFor(() => expect(box.value).toBe("See Reset your password: https://help.example.test/reset-password"));
    expect(client.searchHelp).toHaveBeenCalledWith("reset", { tenantId: "ta", limit: 8 });
  });

  it("mentions a teammate in a note, never in a reply, and shows the mention by name", async () => {
    const client = fakeClient({ replies: vi.fn(async () => [reply({ id: "m3", body: `Look, ${mentionMarkup({ id: AGENT, name: "Kit" })}`, fromStaff: true, internal: true, authorId: "a2" })]) });
    inbox(client, { ticketId: "t1" });
    expect(await screen.findByText("Look, @Kit")).toBeTruthy();
    const box = await composer();
    fireEvent.change(box, { target: { value: "@ki" } });
    expect(screen.queryByTestId("genesis-support-agent-thread-composer-picker")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Internal note" }));
    fireEvent.change(box, { target: { value: "Over to @ki" } });
    expect(within(await screen.findByTestId("genesis-support-agent-thread-composer-picker")).getByText("Kit")).toBeTruthy();
    fireEvent.keyDown(box, { key: "Tab" });
    await waitFor(() => expect(box.value).toBe(`Over to @[Kit](user:${AGENT}) `));
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    await waitFor(() => expect(client.reply).toHaveBeenCalledWith("t1", `Over to @[Kit](user:${AGENT})`, { internal: true }));
  });

  it("closes on Escape, and Enter then sends", async () => {
    const client = fakeClient();
    inbox(client, { ticketId: "t1" });
    const box = await composer();
    fireEvent.change(box, { target: { value: "Is it ?res" } });
    await screen.findByTestId("genesis-support-agent-thread-composer-picker");
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("genesis-support-agent-thread-composer-picker")).toBeNull());
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    await waitFor(() => expect(client.reply).toHaveBeenCalledWith("t1", "Is it ?res", { internal: false }));
  });

  it("opens nothing on a bare ! or ?, so Enter sends", async () => {
    const client = fakeClient();
    inbox(client, { ticketId: "t1" });
    const box = await composer();
    fireEvent.change(box, { target: { value: "Merci !" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(client.reply).toHaveBeenCalledWith("t1", "Merci !", { internal: false }));
    expect(screen.queryByTestId("genesis-support-agent-thread-composer-picker")).toBeNull();
  });
});

describe("on a database without the desk's migrations", () => {
  it("hides Pending and Closed, earlier conversations, mentions and saved replies", async () => {
    const client = fakeClient({ agentDesk: vi.fn(async () => ({ queues: false, tools: false })) });
    inbox(client, { ticketId: "t1", defaultView: "pending" });
    await screen.findByTestId("genesis-support-agent-views-mine");
    await waitFor(() => expect(client.agentDesk).toHaveBeenCalled());
    expect(screen.queryByTestId("genesis-support-agent-views-pending")).toBeNull();
    expect(screen.queryByTestId("genesis-support-agent-views-closed")).toBeNull();
    expect(client.agentTickets).not.toHaveBeenCalledWith(expect.objectContaining({ view: "pending" }));
    const box = await composer();
    fireEvent.change(box, { target: { value: "!re" } });
    fireEvent.click(screen.getByRole("radio", { name: "Internal note" }));
    fireEvent.change(box, { target: { value: "@ki" } });
    expect(screen.queryByTestId("genesis-support-agent-thread-composer-picker")).toBeNull();
    expect(client.savedReplies).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("genesis-support-agent-inbox-toggle-context"));
    await screen.findByTestId("genesis-support-agent-details");
    expect(screen.queryByTestId("genesis-support-agent-earlier")).toBeNull();
    expect(client.agentEarlierTickets).not.toHaveBeenCalled();
  });

  it("learns which migrations are there once, from whether their functions exist", async () => {
    const missing = { data: null, error: { message: "not found", code: "PGRST202" } };
    const refused = { data: null, error: { message: "only an agent", code: "42501" } };
    const { client, rpcs } = fakeSupabase({ rpc: (fn) => (fn === "support_agent_requester_tickets" ? refused : missing) });
    const support = createSupportClient(client);
    expect(await support.agentDesk!()).toEqual({ queues: true, tools: false });
    await support.agentDesk!();
    expect(rpcs.filter((r) => r.fn === "support_delete_saved_reply")).toHaveLength(1);
    const { client: old } = fakeSupabase({ rpc: () => missing });
    expect(await createSupportClient(old).agentEarlierTickets!("t1")).toEqual([]);
  });
});

describe("a held reply", () => {
  it("holds Send when someone wrote while the agent did, then sends anyway", async () => {
    const first = [reply({ id: "m1", body: "It does nothing", authorId: "u1" })];
    const later = [...first, reply({ id: "m2", body: "Never mind, it works", authorId: "u1" })];
    const replies = vi.fn(async () => first);
    const client = fakeClient({ replies });
    inbox(client, { ticketId: "t1" });
    const box = await composer();
    await waitFor(() => expect(replies).toHaveBeenCalled());
    fireEvent.change(box, { target: { value: "Try again?" } });
    replies.mockImplementation(async () => later);
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    expect(await screen.findByText("This conversation changed while you were writing")).toBeTruthy();
    expect(client.reply).not.toHaveBeenCalled();
    expect(await screen.findByText("Never mind, it works")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-support-agent-send-anyway"));
    await waitFor(() => expect(client.reply).toHaveBeenCalledWith("t1", "Try again?", { internal: false }));
  });

  it("lets the agent review, then sends on the next Send", async () => {
    const first = [reply({ id: "m1", body: "It does nothing", authorId: "u1" })];
    const replies = vi.fn(async () => first);
    const client = fakeClient({ replies });
    inbox(client, { ticketId: "t1" });
    const box = await composer();
    await waitFor(() => expect(replies).toHaveBeenCalled());
    fireEvent.change(box, { target: { value: "Try again?" } });
    replies.mockImplementation(async () => [...first, reply({ id: "m2", body: "Hello?", authorId: "u1" })]);
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    fireEvent.click(await screen.findByTestId("genesis-support-agent-review"));
    expect(screen.queryByTestId("genesis-support-agent-held")).toBeNull();
    expect(box.value).toBe("Try again?");
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    await waitFor(() => expect(client.reply).toHaveBeenCalledWith("t1", "Try again?", { internal: false }));
  });

  it("sends at once when nothing changed", async () => {
    const client = fakeClient();
    inbox(client, { ticketId: "t1" });
    const box = await composer();
    await waitFor(() => expect(client.replies).toHaveBeenCalled());
    fireEvent.change(box, { target: { value: "Thanks" } });
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    await waitFor(() => expect(client.reply).toHaveBeenCalledWith("t1", "Thanks", { internal: false }));
    expect(screen.queryByTestId("genesis-support-agent-held")).toBeNull();
  });

  it("is never held by the agent's own message or a teammate's note", async () => {
    const first = [reply({ id: "m1", body: "It does nothing", authorId: "u1" })];
    const replies = vi.fn(async () => first);
    const client = fakeClient({ replies });
    inbox(client, { ticketId: "t1" });
    const box = await composer();
    await waitFor(() => expect(replies).toHaveBeenCalled());
    fireEvent.change(box, { target: { value: "And one more thing" } });
    replies.mockImplementation(async () => [
      ...first,
      reply({ id: "mine", body: "My last reply", fromStaff: true, mine: true, authorId: "me" }),
      reply({ id: "note", body: "A teammate's note", fromStaff: true, internal: true, authorId: AGENT }),
    ]);
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    await waitFor(() => expect(client.reply).toHaveBeenCalledWith("t1", "And one more thing", { internal: false }));
    expect(screen.queryByTestId("genesis-support-agent-held")).toBeNull();
  });

  it("checks again when Send is pressed on an edited held draft", async () => {
    const first = [reply({ id: "m1", body: "It does nothing", authorId: "u1" })];
    const second = [...first, reply({ id: "m2", body: "Hello?", authorId: "u1" })];
    const replies = vi.fn(async () => first);
    const client = fakeClient({ replies });
    inbox(client, { ticketId: "t1" });
    const box = await composer();
    await waitFor(() => expect(replies).toHaveBeenCalled());
    fireEvent.change(box, { target: { value: "Try again?" } });
    replies.mockImplementation(async () => second);
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    await screen.findByTestId("genesis-support-agent-held");
    fireEvent.change(box, { target: { value: "Try again? Still there?" } });
    replies.mockImplementation(async () => [...second, reply({ id: "m3", body: "Anyone?", authorId: "u1" })]);
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    await waitFor(() => expect(replies.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(await screen.findByTestId("genesis-support-agent-held")).toBeTruthy();
    expect(client.reply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("genesis-support-agent-thread-composer-send"));
    await waitFor(() => expect(client.reply).toHaveBeenCalledWith("t1", "Try again? Still there?", { internal: false }));
  });
});

describe("SupportSavedRepliesAdmin", () => {
  function admin(client: SupportClient, replyId: string | null) {
    const onReplyChange = vi.fn();
    render(<SupportSavedRepliesAdmin client={client} tenantId="ta" replyId={replyId} onReplyChange={onReplyChange} />, { wrapper });
    return { onReplyChange };
  }

  it("lists the tenant's saved replies and writes a new one", async () => {
    const client = fakeClient({ saveSavedReply: vi.fn(async () => "s9") });
    const { onReplyChange } = admin(client, "new");
    expect(await screen.findByText("Reset password")).toBeTruthy();
    fireEvent.change(screen.getByTestId("genesis-support-saved-title"), { target: { value: " Welcome " } });
    fireEvent.change(screen.getByTestId("genesis-support-saved-body"), { target: { value: "Hi {first_name}" } });
    fireEvent.click(screen.getByTestId("genesis-support-saved-save"));
    await waitFor(() => expect(client.saveSavedReply).toHaveBeenCalledWith({ id: null, tenantId: "ta", title: "Welcome", body: "Hi {first_name}" }));
    await waitFor(() => expect(onReplyChange).toHaveBeenCalledWith("s9"));
  });

  it("says a name is taken", async () => {
    const client = fakeClient({ saveSavedReply: vi.fn(async () => Promise.reject(new SupportError("dup", "23505", "saveSavedReply"))) });
    admin(client, "s1");
    fireEvent.click(await screen.findByTestId("genesis-support-saved-save"));
    expect(await screen.findByText("Another saved reply has that name.")).toBeTruthy();
  });

  it("deletes one after asking", async () => {
    const client = fakeClient({ deleteSavedReply: vi.fn(async () => undefined) });
    const { onReplyChange } = admin(client, "s1");
    fireEvent.click(await screen.findByTestId("genesis-support-saved-delete"));
    fireEvent.click(await screen.findByTestId("genesis-support-saved-delete-confirm"));
    await waitFor(() => expect(client.deleteSavedReply).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(onReplyChange).toHaveBeenCalledWith(null));
  });
});

describe("SupportAgentReports", () => {
  it("shows the range's numbers and the open ones by customer", async () => {
    const agentReport = vi.fn(async () => ({ fromAt: "", toAt: "", opened: 12, closed: 7, openNow: 5, medianFirstResponseSeconds: 5400, medianCloseSeconds: null, byRequester: [{ label: "Acme", open: 3 }, { label: null, open: 2 }] }));
    render(<SupportAgentReports client={fakeClient({ agentReport })} tenantId="ta" from="2026-10-01" to="2026-10-31" />, { wrapper });
    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.getByText("1h")).toBeTruthy();
    expect(screen.getByText("None yet")).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("Unknown")).toBeTruthy();
    const call = (agentReport.mock.calls[0] as unknown as [{ tenantId: string; from: Date; to: Date }])[0];
    expect(call.tenantId).toBe("ta");
    expect(call.from.getDate()).toBe(1);
    // The last day counts whole.
    expect(call.to.getMonth()).toBe(10);
    expect(call.to.getDate()).toBe(1);
  });

  it("asks for a range that runs forward", async () => {
    const agentReport = vi.fn();
    render(<SupportAgentReports client={fakeClient({ agentReport })} tenantId="ta" from="2026-11-02" to="2026-11-01" />, { wrapper });
    expect(await screen.findByTestId("genesis-support-reports-invalid")).toBeTruthy();
    expect(agentReport).not.toHaveBeenCalled();
  });
});

describe("office hours", () => {
  const office = { timeZone: "America/New_York", hours: [{ days: [1, 2, 3, 4, 5], open: "09:00", close: "17:00" }] };

  it("is open inside the hours, in the desk's own zone", () => {
    // Wednesday 2026-11-11, 10:00 in New York (15:00 UTC).
    expect(officeHoursState(office, new Date("2026-11-11T15:00:00Z"))).toEqual({ open: true, nextOpen: null });
  });

  it("is away after hours, back the next morning", () => {
    // Wednesday 18:00 in New York.
    expect(officeHoursState(office, new Date("2026-11-11T23:00:00Z"))).toEqual({ open: false, nextOpen: new Date("2026-11-12T14:00:00Z") });
  });

  it("is away at the weekend, back on Monday", () => {
    // Saturday 2026-11-14, noon in New York.
    expect(officeHoursState(office, new Date("2026-11-14T17:00:00Z"))).toEqual({ open: false, nextOpen: new Date("2026-11-16T14:00:00Z") });
  });

  it("never says away when the hours can't be read", () => {
    expect(officeHoursState({ timeZone: "Not/AZone", hours: office.hours }, new Date())).toEqual({ open: true, nextOpen: null });
  });
});

describe("the messenger's reply expectation", () => {
  const person = {
    ticketsInTenant: vi.fn(async () => []),
    report: vi.fn(async () => ({ ...ticket(), userId: "me" })),
    thread: vi.fn(async () => ({ mode: "chat" as const, conversationId: "c1" })),
    replies: vi.fn(async () => [reply({ id: "m1", body: "Hello?", mine: true })]),
    markRead: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    submit: vi.fn(async () => ({ id: "t1", attachmentsDropped: 0 })),
    helpArticles: vi.fn(async () => []),
    helpCollections: vi.fn(async () => []),
  } as unknown as SupportClient;

  it("says how soon people hear back on the compose screen and under an unanswered conversation", async () => {
    render(<SupportMessenger client={person} tenantId="ta" spaces={["home"]} replyExpectation="within a few hours" />, { wrapper });
    fireEvent.click(await screen.findByTestId("genesis-support-messenger-new"));
    expect(screen.getByTestId("genesis-support-messenger-expectation").textContent).toBe("We usually reply within a few hours.");
    fireEvent.change(screen.getByTestId("genesis-support-messenger-compose-input"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByTestId("genesis-support-messenger-compose-send"));
    expect((await screen.findByTestId("genesis-support-messenger-awaiting")).textContent).toContain("We usually reply within a few hours.");
  });

  it("says when someone is back, outside office hours", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T17:00:00Z"));
    render(
      <SupportMessenger client={person} tenantId="ta" spaces={["home"]} replyExpectation="within a few hours" officeHours={{ timeZone: "America/New_York", hours: [{ days: [1, 2, 3, 4, 5], open: "09:00", close: "17:00" }] }} />,
      { wrapper },
    );
    fireEvent.click(await screen.findByTestId("genesis-support-messenger-new"));
    const line = await screen.findByTestId("genesis-support-messenger-expectation");
    await act(async () => undefined);
    expect(line.textContent).toMatch(/^We're away right now, and back Monday/);
  });

  it("says nothing extra without either", async () => {
    render(<SupportMessenger client={person} tenantId="ta" spaces={["home"]} />, { wrapper });
    fireEvent.click(await screen.findByTestId("genesis-support-messenger-new"));
    expect(screen.queryByTestId("genesis-support-messenger-expectation")).toBeNull();
  });
});
