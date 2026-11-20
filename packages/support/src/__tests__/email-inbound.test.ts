// @feat:support-email
// Reply by email end to end: the Reply-To support's emails carry, and the inbound route.
import { describe, expect, it, vi } from "vitest";
import type { ClaimedJob, EmailProvider, InboundEmail } from "@marktiderman/genesis-notifications/server";
import {
  handleSupportInbound,
  replyAddress,
  replyKey,
  senderAuthenticated,
  stripReply,
  supportEmailOptions,
  supportReplyConfig,
  supportReplyRoute,
  type SupportReplyConfig,
} from "../email";

const TICKET = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const env = { SUPPORT_REPLY_DOMAIN: "reply.acme.test", SUPPORT_REPLY_SIGNING_SECRET: "a-long-enough-secret-for-tests" };
const config = supportReplyConfig(env) as SupportReplyConfig;
const address = replyAddress(config.keyring, config.domain, { ticketId: TICKET, userId: USER });
const PASS = { dkim: "pass", spf: "pass", dmarc: "pass" };

function email(over: Partial<InboundEmail> = {}): InboundEmail {
  return {
    providerId: "re_1",
    messageId: "m1@mail.test",
    inReplyTo: null,
    references: [],
    from: { email: "pat@example.test", name: "Pat" },
    to: [address],
    cc: [],
    subject: "Re: Export",
    text: "Thanks, that works",
    html: null,
    authentication: PASS,
    attachments: [],
    receivedAt: "2026-11-19T10:00:00Z",
    autoSubmitted: false,
    ...over,
  };
}

function rpc(error: { message: string; code?: string } | null = null) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return { calls, client: { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { data: "m", error }) } };
}

describe("reply by email's set-up", () => {
  it("names what is missing", () => {
    expect(supportReplyConfig({})).toEqual({ missing: ["SUPPORT_REPLY_DOMAIN", "SUPPORT_REPLY_SIGNING_SECRET"], off: false });
    expect(supportReplyConfig({ ...env, SUPPORT_REPLY_DOMAIN: "not a domain" })).toMatchObject({ missing: ["SUPPORT_REPLY_DOMAIN"] });
  });

  it("is off with support.replyByEmail or support.email off", () => {
    expect(supportReplyConfig(env, { settings: { "support.replyByEmail": false } })).toEqual({ missing: [], off: true });
    expect(supportReplyConfig(env, { settings: { "support.email": false } })).toEqual({ missing: [], off: true });
  });

  it("keeps an app's earlier addresses working under its old label", () => {
    const old = replyKey(env.SUPPORT_REPLY_SIGNING_SECRET, { label: "acme/reply/v1" });
    const ring = (supportReplyConfig(env, { legacyLabel: "acme/reply/v1" }) as SupportReplyConfig).keyring;
    expect(ring.current).toBe("b");
    expect(ring.legacy?.["a"]?.equals(old)).toBe(true);
  });
});

describe("the Reply-To on support's emails", () => {
  const sent: unknown[] = [];
  const provider: EmailProvider = { name: "resend", send: vi.fn(async (m) => (sent.push(m), { id: "x" })) } as unknown as EmailProvider;
  const job = (type: string) => ({ type, user_id: USER, data: { ticket_id: TICKET } }) as unknown as ClaimedJob;
  const message = { from: "a@acme.test", to: "pat@example.test", subject: "s", html: "h", text: "t", headers: {} } as never;

  it("gives each recipient their own signed address and the ticket's thread", async () => {
    const opts = supportEmailOptions({ env, provider });
    expect(Object.keys(opts.templates ?? {})).toContain("support.reply");
    await opts.providerFor!(job("support.reply")).send(message);
    expect(sent.at(-1)).toMatchObject({ replyTo: address, headers: { References: `<support-ticket-${TICKET}@reply.acme.test>` } });
  });

  it("leaves other emails, and the verify prompt, as they are", () => {
    const opts = supportEmailOptions({ env, provider });
    expect(opts.providerFor!(job("chat.message"))).toBe(provider);
    expect(opts.providerFor!(job("support.verify"))).toBe(provider);
  });

  it("has no reply addresses until it is set up", () => {
    expect(supportEmailOptions({ env: {}, provider }).providerFor).toBeUndefined();
  });
});

describe("the inbound route", () => {
  it("posts what the person wrote, as the login the email went to", async () => {
    const { client, calls } = rpc();
    expect(await supportReplyRoute(client, config)(email())).toBe(true);
    expect(calls).toEqual([
      { fn: "support_email_reply", args: { p_ticket: TICKET, p_user: USER, p_from: "pat@example.test", p_message_id: "m1@mail.test", p_body: "Thanks, that works" } },
    ]);
  });

  it("passes an email that isn't to a reply address on to the next route", async () => {
    const { client, calls } = rpc();
    expect(await supportReplyRoute(client, config)(email({ to: ["support@acme.test"] }))).toBe(false);
    expect(await supportReplyRoute(client, config)(email({ to: [`${address.slice(0, 10)}x${address.slice(11)}`] }))).toBe(false);
    expect(calls).toEqual([]);
  });

  it("drops automatic mail, an unauthenticated sender and an empty reply", async () => {
    const { client, calls } = rpc();
    const outcomes: string[] = [];
    const route = supportReplyRoute(client, { ...config, onOutcome: (o) => outcomes.push(o) });
    await route(email({ autoSubmitted: true }));
    await route(email({ authentication: { dkim: "fail", spf: "pass", dmarc: "fail" } }));
    await route(email({ text: "On Mon, 16 Nov 2026 at 10:02, Acme <x@reply.acme.test> wrote:\n> old" }));
    expect(outcomes).toEqual(["automatic", "unauthenticated", "empty"]);
    expect(calls).toEqual([]);
  });

  it("drops a refusal, and throws on a failure worth retrying", async () => {
    expect(await supportReplyRoute(rpc({ message: "no", code: "42501" }).client, config)(email())).toBe(true);
    expect(await supportReplyRoute(rpc({ message: "loop", code: "GS429" }).client, config)(email())).toBe(true);
    await expect(supportReplyRoute(rpc({ message: "gone", code: "42883" }).client, config)(email())).rejects.toThrow("42883");
  });

  it("falls back to the provider's id when the email has no Message-ID", async () => {
    const { client, calls } = rpc();
    await supportReplyRoute(client, config)(email({ messageId: null }));
    expect(calls[0]?.args["p_message_id"]).toBe("resend:re_1");
  });

  it("trusts DMARC, aligned with the From domain, and nothing else", () => {
    expect(senderAuthenticated({ dkim: "pass", spf: "pass", dmarc: "PASS" })).toBe(true);
    expect(senderAuthenticated({ spf: "pass", dmarc: "pass" })).toBe(true);
    // A pass for a domain of the sender's own (d=evil.test), not the From's.
    expect(senderAuthenticated({ dkim: "pass", spf: "pass", dmarc: "fail" })).toBe(false);
    expect(senderAuthenticated({ dkim: "pass" })).toBe(false);
    expect(senderAuthenticated({ spf: "pass" })).toBe(false);
    expect(senderAuthenticated(null)).toBe(false);
  });

  it("drops a reply DKIM-signed by another domain (d=evil) with DMARC failing", async () => {
    const { client, calls } = rpc();
    const outcomes: string[] = [];
    await supportReplyRoute(client, { ...config, onOutcome: (o) => outcomes.push(o) })(
      email({ from: { email: "pat@example.test", name: null }, authentication: { dkim: "pass", dkim_domain: "evil.test", spf: "pass", dmarc: "fail" } }),
    );
    expect(outcomes).toEqual(["unauthenticated"]);
    expect(calls).toEqual([]);
  });
});

describe("what mail apps quote", () => {
  it("Gmail", () => {
    expect(stripReply("Works now, thanks!\n\nOn Thu, Nov 19, 2026 at 10:02 AM Acme Support <\nb123@reply.acme.test> wrote:\n> Fixed in 2.1")).toBe("Works now, thanks!");
    expect(stripReply("", '<div dir="ltr">Works now</div><br><div class="gmail_quote"><div>On Thu… wrote:</div><blockquote>Fixed</blockquote></div>')).toBe("Works now");
  });

  it("Outlook", () => {
    expect(stripReply("Still broken.\r\n\r\n________________________________\r\nFrom: Acme Support <b@reply.acme.test>\r\nSent: Thursday, November 19, 2026 10:02\r\nTo: Pat\r\nSubject: Re: Export\r\n\r\nFixed in 2.1")).toBe("Still broken.");
    expect(stripReply("Still broken.\n\n-----Original Message-----\nFrom: Acme\nFixed")).toBe("Still broken.");
    expect(stripReply("Still broken.\n\nFrom: Acme Support <b@reply.acme.test>\nSent: Thursday\nTo: Pat\n\nFixed\n\nGet Outlook for iOS")).toBe("Still broken.");
  });

  it("Apple Mail", () => {
    expect(stripReply("Yes it works\n\nSent from my iPhone\n\n> On 19 Nov 2026, at 10:02, Acme Support <b@reply.acme.test> wrote:\n>\n> Fixed")).toBe("Yes it works");
    expect(stripReply("Yes it works\n\n> On 19 Nov 2026, at 10:02, Acme Support <b@reply.acme.test> wrote:\n> Fixed")).toBe("Yes it works");
  });
});

describe("the inbound endpoint", () => {
  it("is POST only, and 503 until it is set up", async () => {
    const { client } = rpc();
    expect((await handleSupportInbound(new Request("https://x.test", { method: "GET" }), { env, client })).status).toBe(405);
    expect((await handleSupportInbound(new Request("https://x.test", { method: "POST", body: "{}" }), { env, client })).status).toBe(503);
    expect((await handleSupportInbound(new Request("https://x.test", { method: "POST", body: "{}" }), { env: { ...env, RESEND_INBOUND_WEBHOOK_SECRET: "whsec_x", RESEND_API_KEY: "re_x" }, client, settings: { "support.replyByEmail": false } })).status).toBe(503);
  });

  it("checks the webhook's signature once set up", async () => {
    const { client } = rpc();
    const full = { ...env, RESEND_INBOUND_WEBHOOK_SECRET: "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ=", RESEND_API_KEY: "re_x" };
    expect((await handleSupportInbound(new Request("https://x.test", { method: "POST", body: "{}" }), { env: full, client })).status).toBe(401);
  });
});
