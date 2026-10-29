// @feat:support-email
import { describe, expect, it, vi } from "vitest";
import { runSupportEmail, supportEmailRoute, type ReceivedEmail, type SupportEmailClient } from "../email";

function client(results: Record<string, Array<{ data?: unknown; error?: { message: string } | null }>> = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const c: SupportEmailClient = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const next = results[fn]?.shift() ?? { data: "report-1", error: null };
      return { data: next.data ?? null, error: next.error ?? null };
    },
  };
  return { c, calls };
}

const email = (over: Partial<ReceivedEmail> = {}): ReceivedEmail => ({
  providerId: "re_1",
  messageId: "m1@x.test",
  inReplyTo: null,
  references: [],
  from: { email: "pat@example.test", name: "Pat" },
  to: ["support@acme.test"],
  subject: "Help",
  text: "It broke.",
  authentication: { dmarc: "pass" },
  attachments: [],
  ...over,
});

describe("supportEmailRoute", () => {
  it("files mail to a support address or a ticket's reply address, and passes the rest", async () => {
    const { c, calls } = client();
    const route = supportEmailRoute(c, { addresses: ["Support@Acme.test"], replyDomain: "reply.acme.test" });
    expect(await route(email())).toBe(true);
    expect(calls[0]).toMatchObject({ fn: "support_receive_email", args: { email: { messageId: "m1@x.test", from: { email: "pat@example.test" }, to: ["support@acme.test"], onlyExisting: false } } });
    expect(await route(email({ to: ["support+0123456789abcdef0123456789abcdef@reply.acme.test"] }))).toBe(true);
    expect(await route(email({ to: ["agent@acme.test"] }))).toBe(false);
    // Mail from our own addresses (a forged From, our reply coming back) never opens a ticket.
    expect(await route(email({ from: { email: "support@acme.test", name: null } }))).toBe(false);
    expect(await route(email({ from: { email: "bot@reply.acme.test", name: null } }))).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("files a reply sent to another address only when it answers a ticket", async () => {
    const { c, calls } = client({ support_receive_email: [{ data: null }, { data: "report-1" }] });
    const route = supportEmailRoute(c, { addresses: ["support@acme.test"] });
    expect(await route(email({ to: ["someone@acme.test"], inReplyTo: "other@x.test" }))).toBe(false);
    expect(calls[0]!.args).toMatchObject({ email: { onlyExisting: true } });
    expect(await route(email({ to: ["someone@acme.test"], references: ["r1@acme.test"] }))).toBe(true);
  });

  it("throws when filing fails, so the webhook is retried", async () => {
    const { c } = client({ support_receive_email: [{ error: { message: "db down" } }] });
    await expect(supportEmailRoute(c, { addresses: ["support@acme.test"] })(email())).rejects.toThrow(/db down/);
  });
});

describe("runSupportEmail", () => {
  it("sends claimed replies threaded, with the reply address and an idempotency key, then settles them", async () => {
    const { c, calls } = client({
      support_claim_outbound_emails: [{ data: [{ id: "out-1", to: ["pat@example.test"], subject: "Re: Help", text: "A <fix> is coming.", inReplyTo: "m1@x.test", references: ["m1@x.test"], token: "0123456789abcdef0123456789abcdef" }] }],
      support_settle_outbound_email: [{ data: null }],
    });
    const send = vi.fn(async () => ({ id: "re_out_1" }));
    const result = await runSupportEmail(c, { email: { send }, from: "Acme Support <support@acme.test>", replyDomain: "reply.acme.test" });
    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledWith({
      from: "Acme Support <support@acme.test>",
      to: ["pat@example.test"],
      replyTo: "support+0123456789abcdef0123456789abcdef@reply.acme.test",
      subject: "Re: Help",
      text: "A <fix> is coming.",
      html: '<div style="white-space:pre-wrap">A &lt;fix&gt; is coming.</div>',
      headers: { "Message-ID": "<out-1@reply.acme.test>", "In-Reply-To": "<m1@x.test>", References: "<m1@x.test>" },
      idempotencyKey: "genesis-support-email-out-1",
    });
    expect(calls.at(-1)).toEqual({ fn: "support_settle_outbound_email", args: { message: "out-1", provider_id: "re_out_1", error: null, sent_message_id: "out-1@reply.acme.test" } });
  });

  it("settles a failed send with its error, and keeps going", async () => {
    const { c, calls } = client({
      support_claim_outbound_emails: [{ data: [{ id: "a", to: ["x@x.test"], subject: "s", text: "t", inReplyTo: null, references: [], token: "0123456789abcdef0123456789abcdef" }, { id: "b", to: ["y@x.test"], subject: "s", text: "t", inReplyTo: null, references: [], token: "0123456789abcdef0123456789abcdef" }] }],
    });
    const send = vi.fn().mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce({ id: "re_b" });
    expect(await runSupportEmail(c, { email: { send }, from: "s@x.test", replyDomain: "r.x.test" })).toEqual({ sent: 1, failed: 1 });
    expect(calls.filter((x) => x.fn === "support_settle_outbound_email").map((x) => x.args.error)).toEqual(["rate limited", null]);
  });
});
