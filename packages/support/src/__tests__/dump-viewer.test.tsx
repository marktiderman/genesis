// @feat:support-feedback
// The staff dump viewer: the client reads a ticket's dumps (0026's rule is the database's), and the
// web viewer shows them as sections of text.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupportClient, emptyReport } from "..";
import { SupportTicketDiagnostics } from "../web-chat";
import { fakeSupabase } from "./fake-supabase";

afterEach(cleanup);

const ID = "3f2a9c1b-0000-4000-8000-000000000001";
const report = { ...emptyReport({ id: ID, createdAt: "2026-11-19T10:00:00.000Z", trigger: "feedback", app: { id: "acme" } }), build: { version: "1.4.0" }, logs: { errors: [], breadcrumbs: [], console: [{ at: null, level: "log", text: "<img src=x onerror=alert(1)>" }] } };

describe("the staff dump viewer", () => {
  it("reads the ticket's dumps, newest first, and shows each as sections of text", async () => {
    const supabase = fakeSupabase({
      respond: (call) => (call.table === "support_diagnostics" ? { data: [{ id: ID, short_id: "3F2A9C1B", created_at: "2026-11-19T10:00:00.000Z", trigger: "feedback", report }], error: null } : undefined),
    });
    const client = createSupportClient(supabase.client as never);
    const dumps = await client.ticketDiagnostics!("ticket-1");
    expect(dumps).toEqual([{ id: ID, shortId: "3F2A9C1B", createdAt: "2026-11-19T10:00:00.000Z", trigger: "feedback", report }]);
    const call = supabase.calls.find((c) => c.table === "support_diagnostics")!;
    expect(call.ops).toContainEqual(["eq", ["feedback_id", "ticket-1"]]);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SupportTicketDiagnostics client={client} ticketId="ticket-1" />
      </QueryClientProvider>,
    );
    // A loading state first, then the newest dump open, with how it was sent and when.
    expect(screen.getByTestId("genesis-support-agent-diagnostics-loading")).toBeTruthy();
    expect(await screen.findByText(/Dump 3F2A9C1B/)).toBeTruthy();
    expect(screen.getByText(/With feedback/).querySelector("time")?.getAttribute("dateTime")).toBe("2026-11-19T10:00:00.000Z");
    fireEvent.click(screen.getByText("Console"));
    // Shown as text: the markup is visible words, never an element.
    expect(screen.getByTestId("genesis-support-agent-diagnostics-logs.console").textContent).toContain("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByText("Build"));
    expect(screen.getByTestId("genesis-support-agent-diagnostics-build").textContent).toContain("version: 1.4.0");
    // No links unless the app says how to make them.
    expect(screen.queryByTestId("genesis-support-agent-diagnostics-sentry-link")).toBeNull();
  });

  it("links to the dump's Sentry event and GitHub issue as the app says, and copies its text", async () => {
    const dump = { id: ID, shortId: "3F2A9C1B", createdAt: "2026-11-19T10:00:00.000Z", trigger: "crash", report: { ...report, sentry: { lastEventId: "abc123", replayId: null } } };
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SupportTicketDiagnostics
          client={{ ticketDiagnostics: vi.fn(async () => [dump]) }}
          ticketId="ticket-1"
          links={{ sentry: ({ eventId }) => `https://acme.sentry.io/issues/?query=${eventId}`, githubIssue: () => "javascript:alert(1)" }}
        />
      </QueryClientProvider>,
    );
    expect((await screen.findByTestId("genesis-support-agent-diagnostics-sentry-link")).getAttribute("href")).toBe("https://acme.sentry.io/issues/?query=abc123");
    // Only an https link is drawn.
    expect(screen.queryByTestId("genesis-support-agent-diagnostics-issue-link")).toBeNull();
    expect(screen.getByText(/After a crash/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-support-agent-diagnostics-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String((writeText.mock.calls[0] as unknown[])[0])).toContain("## Build\nversion: 1.4.0");
  });

  it("says when the dumps didn't load", async () => {
    const onError = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SupportTicketDiagnostics client={{ ticketDiagnostics: vi.fn(async () => Promise.reject(new Error("down"))) }} ticketId="ticket-1" onError={onError} />
      </QueryClientProvider>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load the diagnostics.");
    expect(onError).toHaveBeenCalled();
  });

  it("shows nothing when the client can't read dumps", () => {
    const qc = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <SupportTicketDiagnostics client={{}} ticketId="ticket-1" />
      </QueryClientProvider>,
    );
    expect(container.innerHTML).toBe("");
  });
});
