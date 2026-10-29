// @feat:support-email
import { describe, expect, it, vi } from "vitest";
import { hmacSha256, toBase64 } from "../server/crypto";
import { createInboundEmailHandler, inboundEmailOf, parseAddress, type InboundEmail } from "../server/index";

const key = new Uint8Array(24).fill(9);
const secret = `whsec_${toBase64(key)}`;

async function signed(body: string, now = Date.now()) {
  const ts = Math.floor(now / 1000);
  const sig = `v1,${toBase64(await hmacSha256(key, `msg_1.${ts}.${body}`))}`;
  return new Request("https://app.test/hooks/inbound", { method: "POST", body, headers: { "svix-id": "msg_1", "svix-timestamp": String(ts), "svix-signature": sig } });
}

const received = {
  object: "email",
  id: "re_rcv_1",
  from: "Pat <Pat@Example.test>",
  to: ["Support@Acme.test"],
  cc: [],
  subject: "Help",
  text: "It broke.",
  html: "<p>It broke.</p>",
  message_id: "<m1@mail.example.test>",
  headers: { "In-Reply-To": "<r0@acme.test>", References: "<a@x> <r0@acme.test>" },
  authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
  attachments: [{ id: "att_1", filename: "shot.png", content_type: "image/png", size: 1200 }],
  created_at: "2026-10-29T12:00:00Z",
};

describe("inbound email", () => {
  it("parses addresses and Resend's received email", () => {
    expect(parseAddress("Pat <Pat@Example.test>")).toEqual({ email: "pat@example.test", name: "Pat" });
    expect(parseAddress("solo@x.test")).toEqual({ email: "solo@x.test", name: null });
    expect(parseAddress("nobody")).toBeNull();
    expect(inboundEmailOf(received)).toMatchObject({
      providerId: "re_rcv_1",
      messageId: "m1@mail.example.test",
      inReplyTo: "r0@acme.test",
      references: ["a@x", "r0@acme.test"],
      from: { email: "pat@example.test", name: "Pat" },
      to: ["support@acme.test"],
      attachments: [{ id: "att_1", filename: "shot.png", contentType: "image/png", size: 1200 }],
      autoSubmitted: false,
    });
    expect(inboundEmailOf({ ...received, headers: { "Auto-Submitted": "auto-replied" } })!.autoSubmitted).toBe(true);
    expect(inboundEmailOf({ ...received, headers: { Precedence: "bulk" } })!.autoSubmitted).toBe(true);
    expect(inboundEmailOf({ ...received, headers: { "X-Autoreply": "yes" } })!.autoSubmitted).toBe(true);
  });

  it("verifies, fetches and hands the email to the first route that takes it", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(received), { status: 200 }));
    const seen: string[] = [];
    const handle = createInboundEmailHandler({
      webhookSecret: secret,
      apiKey: "re_key",
      fetch: fetch as unknown as typeof globalThis.fetch,
      routes: [
        (e: InboundEmail) => (seen.push("agent"), e.to.includes("agent@acme.test")),
        (e: InboundEmail) => (seen.push("support"), e.to.includes("support@acme.test")),
        () => (seen.push("never"), true),
      ],
    });
    const res = await handle(await signed(JSON.stringify({ type: "email.received", data: { email_id: "re_rcv_1" } })));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("routed");
    expect(seen).toEqual(["agent", "support"]);
    expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails/receiving/re_rcv_1", expect.objectContaining({ headers: { authorization: "Bearer re_key" } }));
  });

  it("refuses an unsigned call, ignores other events, and asks for a retry when a route throws", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(received), { status: 200 }));
    const onUnrouted = vi.fn();
    const base = { webhookSecret: secret, apiKey: "k", fetch: fetch as unknown as typeof globalThis.fetch };
    const body = JSON.stringify({ type: "email.received", data: { email_id: "re_rcv_1" } });
    expect((await createInboundEmailHandler({ ...base, routes: [] })(new Request("https://x.test", { method: "POST", body }))).status).toBe(401);
    expect(await (await createInboundEmailHandler({ ...base, routes: [] })(await signed(JSON.stringify({ type: "email.sent", data: {} })))).text()).toBe("ignored");
    expect(await (await createInboundEmailHandler({ ...base, routes: [() => false], onUnrouted })(await signed(body))).text()).toBe("unrouted");
    expect(onUnrouted).toHaveBeenCalledOnce();
    expect((await createInboundEmailHandler({ ...base, routes: [() => { throw new Error("db down"); }] })(await signed(body))).status).toBe(502);
    const huge = new Request("https://x.test", { method: "POST", body: "x".repeat(300_000) });
    expect((await createInboundEmailHandler({ ...base, routes: [] })(huge)).status).toBe(413);
  });
});
