// @feat:support-feedback
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackPanel, webSections } from "../web";
import { captureConsole, createDiagnostics, diagnosticsShortId, type DiagnosticReport, type DiagnosticsTransport } from "../index";
import type { FeedbackRecord } from "../record";

const ID = "3f2a9c1b-0000-4000-8000-000000000001";

afterEach(() => {
  document.body.innerHTML = "";
});

function memoryTransport(): DiagnosticsTransport & { sent: DiagnosticReport[] } {
  const sent: DiagnosticReport[] = [];
  return { name: "memory", sent, send: async (r) => (sent.push(r), { id: r.id, shortId: diagnosticsShortId(r.id) }) };
}

describe("webSections", () => {
  it("reads the browser, the path, and the console ring buffer", async () => {
    window.history.pushState({}, "", "/orders/42?token=abc");
    const fake = { log: (..._args: unknown[]) => {}, error: (..._args: unknown[]) => {} };
    const buffer = captureConsole({ console: fake });
    fake.error("failed for jane@example.test");
    const d = createDiagnostics({
      app: { id: "acme", platform: "web" },
      transport: memoryTransport(),
      sections: webSections({ console: buffer, flags: () => ({ beta: true }), build: () => ({ version: "2.0.0", commit: "abc1234" }), baseUrl: "https://api.test/v1?k=1" }),
    });
    const r = await d.collect();
    expect(r.device).toMatchObject({ os: "web", userAgent: expect.any(String), viewport: { width: expect.any(Number), height: expect.any(Number) } });
    expect(r.session).toMatchObject({ route: "/orders/:id" });
    expect(r.logs.console).toEqual([expect.objectContaining({ level: "error", text: "failed for [email]" })]);
    expect(r.flags).toEqual({ beta: true });
    expect(r.build).toMatchObject({ version: "2.0.0", commit: "abc1234" });
    expect(r.server).toMatchObject({ baseUrl: "https://api.test/v1" });
    buffer.restore();
  });
});

describe("FeedbackPanel with diagnostics", () => {
  it("sends a dump with the report, linked both ways", async () => {
    const transport = memoryTransport();
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID, sections: webSections({ console: false }) });
    const submit = vi.fn(async (_record: FeedbackRecord) => ({ id: "11111111-1111-4111-8111-111111111111", attachmentsDropped: 0 }));
    const onSent = vi.fn();
    render(<FeedbackPanel client={{ submit }} diagnostics={diagnostics} onSent={onSent} screenshots={false} pins={false} />);
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "It broke" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send"));
    });
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(submit.mock.calls[0]![0].diagnosticsId).toBe(ID);
    expect(transport.sent[0]).toMatchObject({ id: ID, trigger: "feedback", feedbackId: "11111111-1111-4111-8111-111111111111" });
    expect(onSent.mock.calls[0]![0].diagnostics).toEqual({ id: ID, shortId: "3F2A9C1B", queued: false });
  });

  it("shows the dump's id to quote after sending, and names its choice rows", async () => {
    const transport = memoryTransport();
    const diagnostics = createDiagnostics({ app: { id: "acme" }, transport, randomId: () => ID, sections: webSections({ console: false }) });
    const submit = vi.fn(async (_record: FeedbackRecord) => ({ id: "11111111-1111-4111-8111-111111111111", attachmentsDropped: 0 }));
    render(<FeedbackPanel client={{ submit }} diagnostics={diagnostics} screenshots={false} pins={false} />);
    // A group of toggles has no control for a label's htmlFor: the label names the group by id.
    const group = screen.getByTestId("genesis-support-type-bug").parentElement;
    expect(document.getElementById(group?.getAttribute("aria-labelledby") ?? "")?.textContent).toBe("What is it?");
    fireEvent.change(screen.getByTestId("genesis-support-message"), { target: { value: "It broke" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-support-send"));
    });
    expect((await screen.findByTestId("genesis-support-sent-reference")).textContent).toBe("Reference: 3F2A9C1B");
  });
});
