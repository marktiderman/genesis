// @feat:support-helpdesk @feat:support-feedback
// The native UI after the final review: "Is it fixed?", the desk controls, the assignee picker, the
// Settings row, the dump viewer, "Report this" and "About:" on the feedback form.
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { Linking, Share } from "react-native";
import { ThreadPage } from "@marktiderman/genesis-ui-native/layouts";
import { emptyReport, resolveSupportCopy } from "..";
import { createDiagnostics, createHealthChecks } from "../diagnostics";
import {
  AgentTicketDiagnostics,
  createSupport,
  dumpHeading,
  FeedbackForm,
  SupportProvider,
  SupportRoute,
  useAgentThread,
  useSupportThread,
} from "../native";
import { fakeSupabase, arg, type Answer, type Call } from "./fake-supabase";

const ME = "00000000-0000-4000-8000-0000000000a1";
const SAM = "00000000-0000-4000-8000-0000000000c3";
const ALEX = "00000000-0000-4000-8000-0000000000b2";
const T1 = "11111111-1111-4111-8111-111111111111";

type Rpc = (fn: string, args: Record<string, unknown>) => Answer | undefined;

function harness(rpc: Rpc = () => undefined, respond?: (call: Call) => Answer | undefined, extra: Partial<Parameters<typeof createSupport>[0]> = {}) {
  const fake = fakeSupabase({ userId: ME, rpc: (fn, args) => rpc(fn, args as Record<string, unknown>) ?? { data: null, error: null }, ...(respond ? { respond } : {}) });
  const navigate = vi.fn();
  const block = createSupport({ supabase: fake.client, navigate, platform: "ios", basePath: "/s", ...extra });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={queryClient}>
      <SupportProvider block={block}>{children}</SupportProvider>
    </QueryClientProvider>
  );
  return { fake, navigate, block, wrap };
}

const report = (extra: Record<string, unknown> = {}) => ({
  id: T1,
  user_id: ME,
  type: "bug",
  message: "The export is empty",
  status: "addressed",
  created_at: "2026-11-18T09:00:00Z",
  updated_at: "2026-11-19T09:00:00Z",
  verified_at: null,
  ...extra,
});

function PersonThread() {
  const { headerTitle: _t, notFound: _n, awaiting: _a, awaitingVerification: _v, verify: _f, report: _r, loading: _l, mode: _m, conversationId: _c, ...thread } = useSupportThread(T1);
  return <ThreadPage {...thread} />;
}

describe("Is it fixed? on the person's thread", () => {
  it("asks once support marks it addressed, and confirms the fix", async () => {
    let row = report();
    const { fake, wrap } = harness(
      (fn) => (fn === "support_verify_report" ? ((row = report({ verified_at: "2026-11-20T09:00:00Z" })), { data: null, error: null }) : undefined),
      (call) => (call.table === "support_reports" ? { data: row, error: null } : undefined),
    );
    render(wrap(<PersonThread />));
    expect(await screen.findByText("Is it fixed?")).toBeTruthy();
    // It reads when the person confirmed, so the question goes once they have.
    expect((arg(fake.calls.find((c) => c.table === "support_reports"), "select") as string).includes("verified_at")).toBe(true);
    fireEvent.click(screen.getByTestId("genesis-support-thread-verify-fixed"));
    await waitFor(() => expect(fake.rpcs).toContainEqual({ fn: "support_verify_report", args: { report: T1, fixed: true, note: null } }));
    expect(await screen.findByTestId("genesis-support-thread-verified")).toBeTruthy();
    expect(screen.queryByTestId("genesis-support-thread-verify-fixed")).toBeNull();
  });

  it("reopens it, and says so when the answer wasn't saved", async () => {
    let fail = true;
    let row = report();
    const { fake, wrap } = harness(
      (fn) => {
        if (fn !== "support_verify_report") return undefined;
        if (fail) return { data: null, error: { message: "down", code: "08006" } };
        row = report({ status: "in_progress" });
        return { data: null, error: null };
      },
      (call) => (call.table === "support_reports" ? { data: row, error: null } : undefined),
    );
    render(wrap(<PersonThread />));
    fireEvent.click(await screen.findByTestId("genesis-support-thread-verify-reopen"));
    expect(await screen.findByTestId("genesis-support-thread-verify-failed")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByTestId("genesis-support-thread-verify-reopen"));
    await waitFor(() => expect(fake.rpcs.filter((r) => r.fn === "support_verify_report").at(-1)?.args).toEqual({ report: T1, fixed: false, note: null }));
    expect((await screen.findByTestId("genesis-support-thread-verified")).textContent).toContain("reopened");
  });

  it("doesn't ask once it is confirmed, or while it is open", async () => {
    for (const row of [report({ verified_at: "2026-11-20T09:00:00Z" }), report({ status: "in_progress" })]) {
      const { wrap } = harness(undefined, (call) => (call.table === "support_reports" ? { data: row, error: null } : undefined));
      const view = render(wrap(<PersonThread />));
      await screen.findByText("The export is empty");
      expect(screen.queryByTestId("genesis-support-thread-verify")).toBeNull();
      view.unmount();
    }
  });
});

const agentTicket = (extra: Record<string, unknown> = {}) => ({
  id: T1,
  type: "question",
  title: null,
  message: "Where is my invoice?",
  status: "open",
  created_at: "2026-11-18T09:00:00Z",
  updated_at: "2026-11-18T09:00:00Z",
  activity_at: "2026-11-18T09:00:00Z",
  tenant_id: "ta",
  user_id: ALEX,
  assignee_id: null,
  preview: "",
  agent_unread: false,
  waiting_since: null,
  ...extra,
});

const desk: Rpc = (fn) => {
  if (fn === "support_is_staff" || fn === "support_is_agent") return { data: true, error: null };
  if (fn === "support_agent_tickets") return { data: [agentTicket()], error: null };
  if (fn === "support_ticket_requesters") return { data: [{ user_id: ALEX, full_name: "Alex Doe", email: "alex@example.com" }], error: null };
  if (fn === "support_agents_list") return { data: [{ user_id: SAM, full_name: "Sam" }, { user_id: ME, full_name: "Me" }], error: null };
  if (fn === "support_ticket_desk")
    return { data: [{ tenant_id: "ta", label: "Acme", is_default: false, can_escalate: true, can_return: false, returns_to: null, returns_to_label: null, last_action: null }], error: null };
  if (fn === "support_desk_move_targets")
    return { data: [{ tenant_id: "app", label: null, is_default: true }, { tenant_id: "tb", label: "Northside", is_default: false }], error: null };
  if (fn === "support_my_desks") return { data: [{ tenant_id: "ta", label: "Acme", is_default: false, enabled: true, manage: true, open_tickets: 2 }], error: null };
  return undefined;
};

function AgentThread() {
  const thread = useAgentThread(T1, { tenantId: "ta" });
  return <ThreadPage {...thread} />;
}

describe("the agent thread's controls on the phone", () => {
  it("links the requester's email and offers an assignee picker from the desk's agents", async () => {
    const { fake, wrap } = harness(desk);
    render(wrap(<AgentThread />));
    const email = await screen.findByTestId("genesis-support-agent-requester-email");
    fireEvent.click(email);
    expect(vi.mocked(Linking.openURL)).toHaveBeenCalledWith("mailto:alex@example.com");
    await waitFor(() => expect(screen.getByTestId("genesis-support-agent-assignee").textContent).toContain("Assign to: Nobody"));
    fireEvent.click(screen.getByTestId("genesis-support-agent-assignee"));
    expect(screen.getByTestId(`genesis-support-agent-assignee-${ME}`).textContent).toBe("You");
    fireEvent.click(screen.getByTestId(`genesis-support-agent-assignee-${SAM}`));
    await waitFor(() => expect(fake.rpcs).toContainEqual({ fn: "support_assign_report", args: { report: T1, assignee: SAM } }));
    fireEvent.click(screen.getByTestId("genesis-support-agent-assignee"));
    fireEvent.click(screen.getByTestId("genesis-support-agent-assignee-none"));
    await waitFor(() => expect(fake.rpcs).toContainEqual({ fn: "support_assign_report", args: { report: T1, assignee: null } }));
  });

  it("sends a ticket up to the app's own desk with a reason, then leaves it", async () => {
    const { fake, wrap, navigate } = harness(desk);
    render(wrap(<AgentThread />));
    fireEvent.click(await screen.findByTestId("genesis-support-desk-escalate"));
    expect(screen.getByTestId("genesis-support-desk-escalate").textContent).toBe("Send to Support");
    fireEvent.change(screen.getByTestId("genesis-support-desk-dialog-reason"), { target: { value: "Billing bug" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-desk-dialog-send"));
    });
    expect(fake.rpcs).toContainEqual({ fn: "support_escalate_ticket", args: { ticket: T1, reason: "Billing bug" } });
    expect(navigate).toHaveBeenCalledWith("/s/agent");
  });

  it("moves a ticket to another desk its person belongs to", async () => {
    const { fake, wrap } = harness(desk);
    render(wrap(<AgentThread />));
    fireEvent.click(await screen.findByTestId("genesis-support-desk-move"));
    expect(screen.getByTestId("genesis-support-desk-dialog-target-tb").textContent).toBe("Northside");
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-desk-dialog-send"));
    });
    expect(fake.rpcs).toContainEqual({ fn: "support_move_ticket", args: { ticket: T1, to_tenant: "tb", reason: null } });
  });

  it("shows no desk controls with support.desks off", async () => {
    const { wrap } = harness(desk, undefined, { appSettings: { "support.desks": false } });
    render(wrap(<AgentThread />));
    await screen.findByTestId("genesis-support-agent-ticket");
    expect(screen.queryByTestId("genesis-support-desk")).toBeNull();
  });
});

describe("the desk switch and the Settings row", () => {
  it("lets a tenant's admin turn its desk off from the inbox", async () => {
    const { fake, wrap, block } = harness(desk);
    const { useAgentInbox } = await import("../native");
    function Inbox() {
      const inbox = useAgentInbox({ tenantId: "ta" });
      return <>{inbox.header}</>;
    }
    render(wrap(<Inbox />));
    fireEvent.click(await screen.findByTestId("genesis-support-desk-switch-row"));
    await waitFor(() => expect(fake.rpcs).toContainEqual({ fn: "support_set_desk", args: { tenant: "ta", enabled: false, reason: null } }));
    expect(block.copy.desks.switchLabel).toBeTruthy();
  });

  it("offers the agent desk in Settings to an agent, with the unread count, and to nobody else", async () => {
    const agent = harness((fn, args) => (fn === "support_agent_unread_count" ? { data: 2, error: null } : desk(fn, args)));
    render(agent.wrap(<Rows rows={agent.block.contributes!.settings!} />));
    await waitFor(() => expect(shownRows()).toContainEqual({ id: "support-agent-desk", subtitle: "2 unread", href: "/s/agent" }));
    const stranger = harness((fn) => (fn === "support_is_staff" ? { data: false, error: null } : undefined));
    const view = render(stranger.wrap(<Rows rows={stranger.block.contributes!.settings!} testID="stranger" />));
    await waitFor(() => expect(stranger.fake.rpcs.some((r) => r.fn === "support_is_staff")).toBe(true));
    expect(JSON.parse(view.getByTestId("stranger").textContent!).map((r: { id: string }) => r.id)).toEqual(["support-send-feedback", "support-help"]);
  });
});

/** A block's Settings rows as a shell shows them: each hook called every render, a row shown false left out. */
function Rows({ rows, testID = "rows" }: { rows: readonly { id: string; href?: string; useShown?: () => boolean; useSubtitle?: () => string | null | undefined }[]; testID?: string }) {
  const read = rows.map((r) => ({ id: r.id, href: r.href, shown: r.useShown?.() ?? true, subtitle: r.useSubtitle?.() ?? null }));
  return <span data-testid={testID}>{JSON.stringify(read.filter((r) => r.shown).map(({ shown: _s, ...r }) => r))}</span>;
}
const shownRows = (testID = "rows") => JSON.parse(screen.getByTestId(testID).textContent!) as { id: string; subtitle: string | null; href?: string }[];

describe("support follows live settings", () => {
  it("shows and hides its Settings rows and the idea board as the settings change, without a restart", async () => {
    let values: Record<string, unknown> = {};
    const { block, wrap } = harness(undefined, undefined, { appSettings: () => values });
    const view = render(wrap(<Rows rows={block.contributes!.settings!} />));
    expect(shownRows().map((r) => r.id)).toEqual(["support-send-feedback", "support-help"]);
    expect(block.options.ideas).toBe(true);
    values = { "support.feedback": false, "support.ideas": false };
    view.rerender(wrap(<Rows rows={block.contributes!.settings!} />));
    expect(shownRows().map((r) => r.id)).toEqual(["support-help"]);
    expect(block.options.ideas).toBe(false);
    expect(block.reportProblem).toBeUndefined();
    values = {};
    view.rerender(wrap(<Rows rows={block.contributes!.settings!} />));
    expect(shownRows().map((r) => r.id)).toEqual(["support-send-feedback", "support-help"]);
    expect(block.reportProblem).toBeTypeOf("function");
  });

  it("updates an open Settings screen when subscribeSettings says the settings changed", () => {
    let values: Record<string, unknown> = {};
    const listeners = new Set<() => void>();
    const { block, wrap } = harness(undefined, undefined, {
      appSettings: () => values,
      subscribeSettings: (onChange) => (listeners.add(onChange), () => listeners.delete(onChange)),
    });
    render(wrap(<Rows rows={block.contributes!.settings!} />));
    expect(shownRows().map((r) => r.id)).toEqual(["support-send-feedback", "support-help"]);
    act(() => {
      values = { "support.inbox": false };
      listeners.forEach((l) => l());
    });
    expect(shownRows().map((r) => r.id)).toEqual(["support-send-feedback"]);
  });

  it("doesn't ask whether the person is an agent, nor poll the unread count, while the agent desk is off", async () => {
    const { block, wrap, fake } = harness(desk, undefined, { appSettings: { "support.agentDesk": false } });
    render(wrap(<Rows rows={block.contributes!.settings!} />));
    await waitFor(() => expect(shownRows().map((r) => r.id)).toEqual(["support-send-feedback", "support-help"]));
    expect(fake.rpcs.some((r) => r.fn === "support_is_staff" || r.fn === "support_agent_unread_count")).toBe(false);
  });

  it("lets an ideas option the app gave win over the live setting", () => {
    const { block } = harness(undefined, undefined, { ideas: false, appSettings: () => ({ "support.ideas": true }) });
    expect(block.options.ideas).toBe(false);
  });
});

describe("the dump viewer on the phone", () => {
  const dump = {
    id: "d1",
    short_id: "AB12CD34",
    created_at: "2026-11-19T10:04:00.000Z",
    trigger: "shake",
    report: { ...emptyReport({ id: "3f2a9c1b-0000-4000-8000-000000000001", createdAt: "2026-11-19T10:04:00.000Z", trigger: "shake", app: { id: "acme" } }), build: { version: "1.4.0" } },
  };

  it("says it is loading, then heads each dump with its trigger and time, in mono, and copies it", async () => {
    let answer: (a: Answer) => void = () => {};
    const pending = new Promise<Answer>((resolve) => (answer = resolve));
    const fake = fakeSupabase({ userId: ME });
    const block = createSupport({ supabase: fake.client, navigate: vi.fn(), platform: "ios" });
    const client = { ...block.client, ticketDiagnostics: async () => (await pending).data as never };
    const copy = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SupportProvider block={{ ...block, client }}>
          <AgentTicketDiagnostics ticketId={T1} me={ME} copy={copy} formatTime={() => "19 Nov, 10:04"} />
        </SupportProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("genesis-support-agent-diagnostics-loading").textContent).toContain("Loading the diagnostics");
    await act(async () => answer({ data: [{ id: "d1", shortId: "AB12CD34", createdAt: dump.created_at, trigger: "shake", report: dump.report }], error: null }));
    fireEvent.click(await screen.findByTestId("genesis-support-agent-diagnostics-toggle"));
    expect(screen.getByTestId("genesis-support-agent-diagnostics-heading").textContent).toBe("Dump AB12CD34 · Shake · 19 Nov, 10:04");
    expect(screen.getByText(/version: 1.4.0/).className).toContain("font-mono");
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-agent-diagnostics-copy-d1"));
    });
    expect(copy.mock.calls[0]?.[0]).toMatch(/^Dump AB12CD34 · Shake · 19 Nov, 10:04\n\n.*version: 1.4.0/s);
    expect(screen.getByTestId("genesis-support-agent-diagnostics-copy-d1").textContent).toBe("Copied");
    void Share;
  });

  it("says so when a copy fails, and reports it", async () => {
    const fake = fakeSupabase({ userId: ME });
    const onError = vi.fn();
    const block = createSupport({ supabase: fake.client, navigate: vi.fn(), platform: "ios", onError });
    const client = { ...block.client, ticketDiagnostics: async () => [{ id: "d1", shortId: "AB12CD34", createdAt: dump.created_at, trigger: "shake", report: dump.report }] };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SupportProvider block={{ ...block, client }}>
          <AgentTicketDiagnostics ticketId={T1} me={ME} copy={() => Promise.reject(new Error("no clipboard"))} />
        </SupportProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByTestId("genesis-support-agent-diagnostics-toggle"));
    const button = screen.getByTestId("genesis-support-agent-diagnostics-copy-d1");
    expect(button.getAttribute("aria-label")).toBe("Copy: Dump AB12CD34");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByTestId("genesis-support-agent-diagnostics-copy-failed")).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "copy");
  });

  it("keeps an unknown trigger and an unreadable time as they came", () => {
    expect(dumpHeading({ shortId: "X", trigger: "custom", createdAt: "not a date" }, resolveSupportCopy())).toBe("Dump X · custom · not a date");
  });
});

describe("Report this, and About on the feedback form", () => {
  it("opens the feedback form with the error attached, scrubbed", async () => {
    const { block, navigate } = harness();
    const error = new Error("failed for person@example.com");
    block.reportProblem!(error, { kind: "screen" });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/s/new"));
    const extra = block.peekPending()?.extra as { error: { name: string; message: string } };
    expect(extra.error.name).toBe("Error");
    expect(extra.error.message).not.toContain("person@example.com");
  });

  it("on the app's fatal screen, opens the form once the remounted screens have committed", async () => {
    const { block, navigate } = harness();
    const Root = block.Root;
    const view = render(<QueryClientProvider client={new QueryClient()}><Root>{null}</Root></QueryClientProvider>);
    block.reportProblem!(new Error("x"), { kind: "app" });
    expect(navigate).not.toHaveBeenCalled();
    view.rerender(<QueryClientProvider client={new QueryClient()}><Root><span>screens</span></Root></QueryClientProvider>);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/s/new"));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("doesn't open the form long after the press when the app stays down", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { block, navigate } = harness();
      block.reportProblem!(new Error("x"), { kind: "app" });
      vi.setSystemTime(Date.now() + 60_000);
      const Root = block.Root;
      render(<QueryClientProvider client={new QueryClient()}><Root><span>screens</span></Root></QueryClientProvider>);
      await act(async () => {});
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("takes no reports with feedback off", () => {
    const { block } = harness(undefined, undefined, { appSettings: { "support.feedback": false } });
    expect(block.reportProblem).toBeUndefined();
  });

  it("shows what the report is about, says the error is attached, and lets the person drop the screen", async () => {
    const { fake, block, wrap } = harness(undefined, () => ({ data: { id: T1 }, error: null }), { useCurrentRoute: () => "/billing/1f6e8a2c-0000-4000-8000-000000000001" });
    const Root = block.Root;
    const view = render(<QueryClientProvider client={new QueryClient()}><Root>{null}</Root></QueryClientProvider>);
    await block.openFeedback({ screenshot: false, extra: { error: { name: "Error", message: "x" } } });
    view.unmount();
    render(wrap(<FeedbackForm />));
    expect(screen.getByTestId("genesis-support-feedback-about").textContent).toMatch(/^About: \/billing\/:id/);
    expect(screen.getByTestId("genesis-support-feedback-error-attached")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-support-feedback-about-clear"));
    expect(screen.queryByTestId("genesis-support-feedback-about")).toBeNull();
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "It broke" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(fake.calls.some((c) => c.table === "support_reports")).toBe(true));
    const sent = arg(fake.calls.find((c) => c.table === "support_reports"), "insert") as Record<string, unknown>;
    expect(sent["route"] ?? null).toBeNull();
  });

  it("names the screen as the app does, and sends that label", async () => {
    const { fake, block, wrap } = harness(undefined, () => ({ data: { id: T1 }, error: null }));
    await block.openFeedback({ screenshot: false, about: { label: "Billing", context: { feature: "billing" } } });
    render(wrap(<FeedbackForm />));
    expect(screen.getByTestId("genesis-support-feedback-about").textContent).toMatch(/^About: Billing/);
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "Wrong total" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(fake.calls.some((c) => c.table === "support_reports")).toBe(true));
    const sent = arg(fake.calls.find((c) => c.table === "support_reports"), "insert") as { context: Record<string, unknown> };
    expect(sent.context).toMatchObject({ about_label: "Billing", feature: "billing" });
  });
});

describe("sign-out", () => {
  it("forgets the queued dumps and feedback, and a report waiting for the form", async () => {
    const fake = fakeSupabase({ userId: ME });
    let signal: (event: string) => void = () => {};
    Object.assign(fake.client.auth, { onAuthStateChange: (cb: (event: string) => void) => ((signal = cb), { data: { subscription: { unsubscribe() {} } } }) });
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport: { name: "x", send: async () => ({ id: "1", shortId: "1" }) } });
    const clear = vi.spyOn(diagnostics, "clearQueue");
    const block = createSupport({ supabase: fake.client, navigate: vi.fn(), platform: "ios", diagnostics });
    await block.openFeedback({ screenshot: false });
    signal("TOKEN_REFRESHED");
    expect(clear).not.toHaveBeenCalled();
    signal("SIGNED_OUT");
    expect(clear).toHaveBeenCalledTimes(1);
    expect(block.peekPending()).toBeNull();
  });
});

describe("SupportRoute without support, and its feedback screen", () => {
  it("never throws without a support block: an empty state, or what the app gives", () => {
    const qc = new QueryClient();
    const view = render(<QueryClientProvider client={qc}><SupportRoute /></QueryClientProvider>);
    expect(view.getByTestId("genesis-support-unavailable").textContent).toContain("Support isn't available");
    view.unmount();
    render(<QueryClientProvider client={qc}><SupportRoute unavailable={<span>back to settings</span>} /></QueryClientProvider>);
    expect(screen.getByText("back to settings")).toBeTruthy();
  });

  it("hands a sent report to onFeedbackSent (a toast) instead of its own alert", async () => {
    const fake = fakeSupabase({ userId: ME, respond: (call) => (call.table === "support_reports" ? { data: { id: T1 }, error: null } : undefined) });
    const block = createSupport({ supabase: fake.client, navigate: vi.fn(), platform: "ios", basePath: "/s", useCurrentRoute: () => "/s/new" });
    const sent = vi.fn();
    const { Alert } = await import("react-native");
    vi.mocked(Alert.alert).mockClear();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SupportProvider block={block}>
          <SupportRoute onFeedbackSent={sent} />
        </SupportProvider>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByTestId("genesis-support-feedback-message"), { target: { value: "Thanks" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-feedback-send"));
    });
    await waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
    expect(vi.mocked(Alert.alert)).not.toHaveBeenCalled();
  });
});

describe("SupportRoute shows what the hooks say", () => {
  it("shows a failed first message on the new-message screen", async () => {
    const fake = fakeSupabase({ userId: ME, respond: () => ({ data: null, error: { message: "down", code: "08006" } }) });
    const block = createSupport({ supabase: fake.client, navigate: vi.fn(), platform: "ios", basePath: "/s", useCurrentRoute: () => "/s/message" });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SupportProvider block={block}>
          <SupportRoute />
        </SupportProvider>
      </QueryClientProvider>,
    );
    fireEvent.change(await screen.findByTestId("genesis-support-start-composer-input"), { target: { value: "Hello" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-start-composer-send"));
    });
    expect(await screen.findByTestId("genesis-support-start-failed")).toBeTruthy();
  });

  it("asks Is it fixed? on a report's thread", async () => {
    const fake = fakeSupabase({ userId: ME, respond: (call) => (call.table === "support_reports" ? { data: report(), error: null } : undefined) });
    const block = createSupport({ supabase: fake.client, navigate: vi.fn(), platform: "ios", basePath: "/s", useCurrentRoute: () => `/s/${T1}` });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SupportProvider block={block}>
          <SupportRoute />
        </SupportProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("genesis-support-thread-verify")).toBeTruthy();
  });
});

describe("one health check again", () => {
  it("runs only that check and keeps the others' results", async () => {
    let up = false;
    const checks = createHealthChecks();
    checks.register({ name: "a", run: () => ({ status: "ok" }) }, { name: "b", run: () => (up ? { status: "ok" } : { status: "fail", message: "down" }) });
    await checks.run();
    up = true;
    const listener = vi.fn();
    checks.subscribe(listener);
    expect(await checks.runCheck("b")).toMatchObject({ name: "b", status: "ok" });
    expect(checks.latest().map((r) => [r.name, r.status])).toEqual([
      ["a", "ok"],
      ["b", "ok"],
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await checks.runCheck("missing")).toBeNull();
  });
});
