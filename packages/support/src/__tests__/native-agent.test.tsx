// @feat:support-helpdesk
// The agent desk on the phone: a help desk's queues and one ticket's thread.
import type { ReactNode } from "react";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { InboxPage, ThreadPage } from "@marktiderman/genesis-ui-native/layouts";
import { createSupport, SupportProvider, useAgentInbox, useAgentThread, useAgentUnreadCount, useIsSupportAgent, supportAgentKeys } from "../native";
import { fakeSupabase, arg, type Answer, type Call } from "./fake-supabase";

const ME = "00000000-0000-4000-8000-0000000000a1";
const ALEX = "00000000-0000-4000-8000-0000000000b2";
const SAM = "00000000-0000-4000-8000-0000000000c3";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";

const ticket = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "question",
  title: null,
  message: `Help with ${id.slice(0, 2)}`,
  status: "open",
  created_at: "2026-11-18T09:00:00Z",
  updated_at: "2026-11-18T09:00:00Z",
  activity_at: "2026-11-18T09:00:00Z",
  tenant_id: "ta",
  user_id: ALEX,
  assignee_id: null,
  preview: "Where is my invoice?",
  agent_unread: true,
  waiting_since: null,
  ...extra,
});

type Rpc = (fn: string, args: Record<string, unknown>) => Answer | undefined;

const desk: Rpc = (fn, args) => {
  if (fn === "support_is_staff") return { data: true, error: null };
  if (fn === "support_is_agent") return { data: args["tenant"] === "ta", error: null };
  if (fn === "support_agent_unread_count") return { data: 3, error: null };
  if (fn === "support_agent_ticket_counts")
    return { data: [{ inbox_view: "mine", tickets: 1 }, { inbox_view: "unassigned", tickets: 4 }, { inbox_view: "all", tickets: 9 }], error: null };
  if (fn === "support_agent_tickets") {
    if (args["only_id"]) return { data: [ticket(String(args["only_id"]), { assignee_id: SAM, status: "in_progress", user_read_at: "2026-11-18T10:00:00Z" })], error: null };
    return { data: [ticket(T1), ticket(T2, { assignee_id: ME, agent_unread: false, user_id: null, requester_email: "pat@example.com", channel: "email" })], error: null };
  }
  if (fn === "support_ticket_requesters") return { data: [{ user_id: ALEX, full_name: "Alex Doe", email: "alex@example.com" }], error: null };
  if (fn === "support_agents_list") return { data: [{ user_id: SAM, full_name: "Sam" }, { user_id: ME, full_name: "Me" }], error: null };
  if (fn === "support_requester_tenants") return { data: [{ tenant_id: "ta", label: "Acme" }, { tenant_id: "tb", label: "Northside" }], error: null };
  return { data: null, error: null };
};

function harness(rpc: Rpc = desk, respond?: (call: Call) => Answer | undefined) {
  const fake = fakeSupabase({ userId: ME, rpc: (fn, args) => rpc(fn, args as Record<string, unknown>) ?? { data: null, error: null }, ...(respond ? { respond } : {}) });
  const navigate = vi.fn();
  const block = createSupport({ supabase: fake.client, navigate, platform: "ios", basePath: "/s" });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SupportProvider block={block}>{children}</SupportProvider>
    </QueryClientProvider>
  );
  return { fake, navigate, wrapper };
}

describe("who is an agent", () => {
  it("asks isStaff for the app's own help desk and isAgent for a tenant's", async () => {
    const { wrapper, fake } = harness();
    const own = renderHook(() => useIsSupportAgent(), { wrapper });
    expect(own.result.current).toBe(false);
    await waitFor(() => expect(own.result.current).toBe(true));
    expect(fake.rpcs.some((r) => r.fn === "support_is_staff")).toBe(true);
    const other = renderHook(() => useIsSupportAgent("tb"), { wrapper });
    await waitFor(() => expect(fake.rpcs.some((r) => r.fn === "support_is_agent" && (r.args as { tenant: string }).tenant === "tb")).toBe(true));
    expect(other.result.current).toBe(false);
  });

  it("the unread badge counts for an agent and is 0 (unasked) for anyone else", async () => {
    const { wrapper, fake } = harness();
    const agent = renderHook(() => useAgentUnreadCount("ta"), { wrapper });
    await waitFor(() => expect(agent.result.current).toBe(3));
    expect(fake.rpcs.find((r) => r.fn === "support_agent_unread_count")?.args).toEqual({ tenant: "ta" });
    const stranger = harness((fn, args) => (fn === "support_is_staff" ? { data: false, error: null } : desk(fn, args)));
    const none = renderHook(() => useAgentUnreadCount(), { wrapper: stranger.wrapper });
    await waitFor(() => expect(stranger.fake.rpcs.some((r) => r.fn === "support_is_staff")).toBe(true));
    expect(none.result.current).toBe(0);
    expect(stranger.fake.rpcs.some((r) => r.fn === "support_agent_unread_count")).toBe(false);
  });
});

describe("the agent inbox", () => {
  it("lists a queue with the requester, status, assignee and counts, and opens a ticket", async () => {
    const { wrapper, fake, navigate } = harness();
    const { result } = renderHook(() => useAgentInbox({ tenantId: "ta" }), { wrapper });
    await waitFor(() => expect(result.current.items.length).toBe(2));
    await waitFor(() => expect(result.current.items[0]?.meta).toBe("Alex Doe · Open · Nobody"));
    expect(result.current.items[0]).toMatchObject({ title: "Help with 11", preview: "Where is my invoice?", unread: true });
    expect(result.current.items[1]?.meta).toBe("pat@example.com · Open · You");
    expect(result.current.headerTitle).toBe("Support inbox");
    expect(fake.rpcs.find((r) => r.fn === "support_agent_tickets")?.args).toMatchObject({ tenant: "ta", inbox_view: "mine" });
    await waitFor(() => expect(result.current.views.map((v) => v.count)).toEqual([1, 4, 9, undefined, undefined]));
    result.current.items[0]?.onPress?.();
    expect(navigate).toHaveBeenCalledWith(`/s/agent/${T1}`);
  });

  it("switches queues, and pages as the list nears its end", async () => {
    const { wrapper, fake } = harness();
    const { result } = renderHook(() => useAgentInbox({ view: "unassigned", pageSize: 2 }), { wrapper });
    await waitFor(() => expect(result.current.items.length).toBe(2));
    expect(result.current.emptyTitle).toBe("Nothing waiting");
    act(() => result.current.onEndReached?.());
    await waitFor(() => expect(fake.rpcs.filter((r) => r.fn === "support_agent_tickets").length).toBe(2));
    expect(fake.rpcs.filter((r) => r.fn === "support_agent_tickets")[1]?.args).toMatchObject({ tenant: null, inbox_view: "unassigned", before_id: T2, max_rows: 2 });
    act(() => result.current.setView("closed"));
    await waitFor(() => expect(result.current.view).toBe("closed"));
    await waitFor(() => expect(fake.rpcs.some((r) => r.fn === "support_agent_tickets" && (r.args as { inbox_view: string }).inbox_view === "closed")).toBe(true));
  });

  it("renders in InboxPage with the queue switcher", async () => {
    const { wrapper } = harness();
    function Screen() {
      return <InboxPage {...useAgentInbox()} />;
    }
    render(<Screen />, { wrapper });
    expect(await screen.findByTestId("genesis-support-agent-views")).toBeTruthy();
    expect(await screen.findByText("Help with 11")).toBeTruthy();
  });

  it("reads a refusal as not allowed", async () => {
    const { wrapper } = harness((fn, args) => (fn === "support_agent_tickets" ? { data: null, error: { message: "not an agent", code: "42501" } } : desk(fn, args)));
    const { result } = renderHook(() => useAgentInbox({ tenantId: "tb" }), { wrapper });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.notAllowed).toBe(true);
    expect(result.current.errorTitle).toBe("These tickets aren't yours to see");
  });
});

describe("an agent's ticket", () => {
  const replies = (call: Call): Answer | undefined => {
    if (call.table !== "support_replies") return undefined;
    if (call.ops.some(([op]) => op === "insert")) return { data: { id: "r9", report_id: T1, body: "On it", from_staff: true, created_at: "2026-11-18T11:00:00Z" }, error: null };
    return {
      data: [
        { id: "r1", report_id: T1, body: "Any news?", from_staff: false, created_at: "2026-11-18T09:30:00Z" },
        { id: "r2", report_id: T1, body: "Looking now", from_staff: true, created_at: "2026-11-18T09:40:00Z" },
      ],
      error: null,
    };
  };

  it("reads the ticket, its replies, who wrote it and their tenants, and marks it read", async () => {
    const { wrapper, fake } = harness(desk, replies);
    const { result } = renderHook(() => useAgentThread(T1, { tenantId: "ta" }), { wrapper });
    await waitFor(() => expect(result.current.messages.length).toBe(3));
    expect(result.current.messages.map((m) => [m.body, m.mine, m.authorName])).toEqual([
      ["Help with 11", false, "Alex Doe"],
      ["Any news?", false, "Alex Doe"],
      ["Looking now", true, undefined],
    ]);
    expect(result.current.headerTitle).toBe("Help with 11");
    expect(result.current.requester).toEqual({ id: ALEX, name: "Alex Doe", email: "alex@example.com" });
    await waitFor(() => expect(result.current.requesterTenants).toBe("Acme, Northside"));
    expect(result.current.statusLabel).toBe("In progress");
    await waitFor(() => expect(result.current.assigneeLabel).toBe("Sam"));
    expect(result.current.assignees.map((a) => [a.name, a.current])).toEqual([
      ["Sam", true],
      ["You", false],
    ]);
    await waitFor(() => expect(fake.rpcs.some((r) => r.fn === "support_mark_read" && (r.args as { report: string }).report === T1)).toBe(true));
    // Without the support-chat block there are no internal notes.
    expect(result.current.composer?.modes).toBeUndefined();
  });

  it("replies, changes the status, and takes the ticket", async () => {
    const { wrapper, fake } = harness(desk, replies);
    const { result } = renderHook(() => useAgentThread(T1), { wrapper });
    await waitFor(() => expect(result.current.composer).not.toBeNull());
    act(() => result.current.composer?.onChangeText("  On it "));
    act(() => result.current.composer?.onSend());
    await waitFor(() => expect(fake.calls.some((c) => c.table === "support_replies" && arg(c, "insert") !== undefined)).toBe(true));
    expect(arg(fake.calls.find((c) => c.table === "support_replies" && arg(c, "insert") !== undefined), "insert")).toEqual({ report_id: T1, body: "On it" });
    await waitFor(() => expect(result.current.composer?.value).toBe(""));

    await act(() => result.current.setStatus("pending"));
    expect(fake.rpcs.find((r) => r.fn === "support_set_report_status")?.args).toMatchObject({ report: T1, status: "pending" });
    await waitFor(() => expect(result.current.me).toBe(ME));
    expect(result.current.mine).toBe(false);
    await act(() => result.current.toggleMine());
    expect(fake.rpcs.find((r) => r.fn === "support_assign_report")?.args).toEqual({ report: T1, assignee: ME });
  });

  it("says a change failed", async () => {
    const { wrapper } = harness((fn, args) => (fn === "support_set_report_status" ? { data: null, error: { message: "no", code: "42501" } } : desk(fn, args)), replies);
    const { result } = renderHook(() => useAgentThread(T1), { wrapper });
    await waitFor(() => expect(result.current.ticket).not.toBeNull());
    await act(async () => {
      await expect(result.current.setStatus("addressed")).rejects.toThrow("no");
    });
    expect(result.current.changeFailed).toBe(true);
  });

  it("renders in ThreadPage with the ticket's controls", async () => {
    const { wrapper } = harness(desk, replies);
    function Screen() {
      return <ThreadPage {...useAgentThread(T1)} />;
    }
    render(<Screen />, { wrapper });
    expect(await screen.findByTestId("genesis-support-agent-ticket")).toBeTruthy();
    expect(await screen.findByTestId("genesis-support-agent-status-pending")).toBeTruthy();
    expect(await screen.findByText("Looking now")).toBeTruthy();
  });

  it("is not found when the help desk has no such ticket", async () => {
    const { wrapper } = harness((fn, args) => (fn === "support_agent_tickets" ? { data: [], error: null } : desk(fn, args)), replies);
    const { result } = renderHook(() => useAgentThread(T1), { wrapper });
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.composer).toBeNull();
  });
});

describe("the agent desk's query keys", () => {
  it("are scoped by the signed-in login, so another login never reads the last one's cache", () => {
    expect(supportAgentKeys.queue("u1", null, "mine")).not.toEqual(supportAgentKeys.queue("u2", null, "mine"));
    expect(supportAgentKeys.queue("u1", null, "mine").slice(0, 3)).toEqual(supportAgentKeys.user("u1"));
  });
});
