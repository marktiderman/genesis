// @feat:notifications
import { describe, expect, it, vi } from "vitest";
import {
  cancelNotification,
  checkSenderDomain,
  createNotificationsHandler,
  createUnsubscribeToken,
  emailEventOf,
  notify,
  syncNotificationTypes,
  unsubscribeHeaders,
  verifyResendWebhook,
  verifyUnsubscribeToken,
  type NotificationRunner,
  type NotificationStore,
} from "../server/index";
import { hmacSha256, toBase64 } from "../server/crypto";
import { USER, registry } from "./fixtures";

const SECRET = "s".repeat(32);
const CRON = "c".repeat(32);

describe("unsubscribe tokens", () => {
  it("round-trip, and refuse anything tampered with", async () => {
    const token = await createUnsubscribeToken(SECRET, { userId: USER, category: "messages" });
    expect(await verifyUnsubscribeToken(SECRET, token)).toEqual({ userId: USER, category: "messages" });
    const [payload, sig] = token.split(".");
    const other = Buffer.from(JSON.stringify({ u: "someone-else", c: "messages", v: 1 })).toString("base64url");
    expect(await verifyUnsubscribeToken(SECRET, `${other}.${sig}`)).toBeNull();
    expect(await verifyUnsubscribeToken("x".repeat(32), token)).toBeNull();
    expect(await verifyUnsubscribeToken(SECRET, `${payload}`)).toBeNull();
    await expect(createUnsubscribeToken("short", { email: "a@b.test", category: "x" })).rejects.toThrow(/32/);
  });
  it("make RFC 8058 headers", () => {
    expect(unsubscribeHeaders("https://app.example.test/u", "tok")).toEqual({ "List-Unsubscribe": "<https://app.example.test/u?t=tok>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });
});

async function svix(secret: Uint8Array, id: string, ts: number, body: string) {
  return `v1,${toBase64(await hmacSha256(secret, `${id}.${ts}.${body}`))}`;
}

describe("Resend webhooks", () => {
  const key = new Uint8Array(24).fill(7);
  const secret = `whsec_${toBase64(key)}`;
  it("verify a Svix signature, and refuse a stale or forged one", async () => {
    const now = Date.now();
    const ts = Math.floor(now / 1000);
    const body = JSON.stringify({ type: "email.bounced", data: { email_id: "re_1", bounce: { type: "Permanent" } } });
    const headers = new Headers({ "svix-id": "msg_1", "svix-timestamp": String(ts), "svix-signature": `v1,bad ${await svix(key, "msg_1", ts, body)}` });
    expect(await verifyResendWebhook(secret, headers, body, now)).toBe(true);
    expect(await verifyResendWebhook(secret, headers, body + " ", now)).toBe(false);
    expect(await verifyResendWebhook(secret, headers, body, now + 600_000)).toBe(false);
  });
  it("read bounces, complaints and deliveries", () => {
    expect(emailEventOf({ type: "email.bounced", data: { email_id: "re_1", bounce: { type: "Permanent" } } })).toEqual({ providerId: "re_1", event: "bounced", permanent: true });
    expect(emailEventOf({ type: "email.bounced", data: { email_id: "re_1", bounce: { type: "Transient" } } })).toMatchObject({ permanent: false });
    expect(emailEventOf({ type: "email.complained", data: { email_id: "re_2" } })).toMatchObject({ event: "complained" });
    expect(emailEventOf({ type: "email.opened", data: { email_id: "re_3" } })).toBeNull();
  });
});

function deps() {
  const store = { emailEvent: vi.fn(async () => true), unsubscribe: vi.fn(async () => true) } as unknown as NotificationStore;
  const runner = { run: vi.fn(async () => ({ push: null, email: null })), checkReceipts: vi.fn(async () => ({ checked: 0, settled: 0 })) } as unknown as NotificationRunner;
  return { store, runner };
}

describe("createNotificationsHandler", () => {
  it("runs only with the cron secret", async () => {
    const { store, runner } = deps();
    const handle = createNotificationsHandler({ store, runner, cronSecret: CRON });
    expect((await handle(new Request("https://x.test/fn/run", { method: "POST" }))).status).toBe(401);
    expect((await handle(new Request("https://x.test/fn/run", { method: "POST", headers: { authorization: `Bearer ${"d".repeat(32)}` } }))).status).toBe(401);
    const ok = await handle(new Request("https://x.test/fn/run", { method: "POST", headers: { authorization: `Bearer ${CRON}` } }));
    expect(ok.status).toBe(200);
    expect(runner.run).toHaveBeenCalledTimes(1);
    expect((await handle(new Request("https://x.test/fn/receipts", { method: "POST", headers: { authorization: `Bearer ${CRON}` } }))).status).toBe(200);
    expect(() => createNotificationsHandler({ store, runner, cronSecret: "short" })).toThrow(/32/);
  });

  it("never unsubscribes on GET (link scanners), and does on POST", async () => {
    const { store, runner } = deps();
    const handle = createNotificationsHandler({ store, runner, cronSecret: CRON, unsubscribeSecret: SECRET });
    const token = await createUnsubscribeToken(SECRET, { email: "out@example.test", category: "forms" });
    const get = await handle(new Request(`https://x.test/fn/unsubscribe?t=${token}`));
    expect(get.status).toBe(200);
    const html = await get.text();
    expect(html).toContain('method="post"');
    // Relative, so it posts back to wherever the gateway mounted the function.
    expect(html).toContain('action="?t=');
    expect(store.unsubscribe).not.toHaveBeenCalled();
    const post = await handle(new Request(`https://x.test/fn/unsubscribe?t=${token}`, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } }));
    expect(post.status).toBe(200);
    expect(store.unsubscribe).toHaveBeenCalledWith(null, "out@example.test", "forms");
    expect((await handle(new Request("https://x.test/fn/unsubscribe?t=forged.token", { method: "POST" }))).status).toBe(400);
  });

  it("feeds a signed bounce to the store, and refuses an unsigned one", async () => {
    const { store, runner } = deps();
    const key = new Uint8Array(24).fill(3);
    const handle = createNotificationsHandler({ store, runner, cronSecret: CRON, resendWebhookSecret: `whsec_${toBase64(key)}` });
    const body = JSON.stringify({ type: "email.bounced", data: { email_id: "re_9", bounce: { type: "Permanent" } } });
    const ts = Math.floor(Date.now() / 1000);
    const signed = await handle(new Request("https://x.test/fn/webhooks/resend", { method: "POST", body, headers: { "svix-id": "m", "svix-timestamp": String(ts), "svix-signature": await svix(key, "m", ts, body) } }));
    expect(signed.status).toBe(200);
    expect(store.emailEvent).toHaveBeenCalledWith("re_9", "bounced", true);
    expect((await handle(new Request("https://x.test/fn/webhooks/resend", { method: "POST", body }))).status).toBe(401);
  });
});

describe("notify", () => {
  it("calls genesis_notify with the checked input", async () => {
    const rpc = vi.fn(async () => ({ data: [{ notification_id: "n1", recipient_key: USER, created: true }], error: null }));
    const out = await notify({ rpc }, { type: "chat.message", recipients: [USER, { email: "x@example.test" }], data: { conversation_id: "c1" }, idempotencyKey: "push:m1", threadKey: "c1", collapseKey: "c1", badge: 2, tenantId: "t1" }, { registry });
    expect(out).toEqual([{ notificationId: "n1", recipientKey: USER, created: true }]);
    expect(rpc).toHaveBeenCalledWith("genesis_notify", {
      p_type: "chat.message",
      p_recipients: [{ user_id: USER }, { email: "x@example.test" }],
      p_data: { conversation_id: "c1" },
      p_idempotency_key: "push:m1",
      p_thread_key: "c1",
      p_collapse_key: "c1",
      p_badge: 2,
      p_tenant_id: "t1",
      p_brand: null,
      p_secret: null,
    });
  });
  it("refuses a secret in data, a secret for a type without a link, and an unknown type, before the database", async () => {
    const rpc = vi.fn();
    await expect(notify({ rpc }, { type: "chat.message", recipients: [USER], data: { link: "https://a.test/?token=x" }, idempotencyKey: "k" })).rejects.toThrow(/secret/);
    await expect(notify({ rpc }, { type: "chat.message", recipients: [USER], idempotencyKey: "k", secret: "x" }, { registry })).rejects.toThrow(/no secret link/);
    await expect(notify({ rpc }, { type: "nope", recipients: [USER], idempotencyKey: "k" }, { registry })).rejects.toThrow(/unknown/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sends a one-time secret to exactly one recipient", async () => {
    const rpc = vi.fn();
    await expect(notify({ rpc }, { type: "forms.receipt", recipients: [{ email: "a@example.test" }, { email: "b@example.test" }], idempotencyKey: "k", secret: "x" }, { registry })).rejects.toThrow(/exactly one/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("cancels by idempotency key, for some recipients, archiving if asked", async () => {
    const rpc = vi.fn(async () => ({ data: [{ cancelled: 2, archived: 1 }], error: null }));
    expect(await cancelNotification({ rpc }, { idempotencyKey: "release:42", recipients: [USER], archive: true })).toEqual({ cancelled: 2, archived: 1 });
    expect(rpc).toHaveBeenCalledWith("genesis_notifications_cancel", { p_idempotency_key: "release:42", p_recipients: [{ user_id: USER }], p_archive: true });
    await cancelNotification({ rpc }, { idempotencyKey: "release:43" });
    expect(rpc).toHaveBeenLastCalledWith("genesis_notifications_cancel", { p_idempotency_key: "release:43", p_recipients: null, p_archive: false });
    await expect(cancelNotification({ rpc }, { idempotencyKey: "" })).rejects.toThrow(/idempotency key/);
  });
  it("mirrors the registry", async () => {
    const rpc = vi.fn(async () => ({ data: 4, error: null }));
    expect(await syncNotificationTypes({ rpc }, registry)).toBe(4);
    expect((rpc.mock.calls[0] as unknown as [string, { p_rows: unknown[] }])[1].p_rows).toHaveLength(4);
  });
});

describe("checkSenderDomain", () => {
  it("checks SPF, DKIM and DMARC over DNS over HTTPS", async () => {
    const records: Record<string, string> = {
      "send.mail.example.test": '"v=spf1 include:amazonses.com ~all"',
      "resend._domainkey.mail.example.test": '"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ"',
      "_dmarc.mail.example.test": '"v=DMARC1; p=none;"',
    };
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const name = new URL(String(url)).searchParams.get("name")!;
      return new Response(JSON.stringify({ Answer: records[name] ? [{ type: 16, data: records[name] }] : [] }));
    });
    expect(await checkSenderDomain("mail.example.test", { fetch: fetch as typeof globalThis.fetch })).toEqual({ spf: true, dkim: true, dmarc: true, ok: true });
    delete records["_dmarc.mail.example.test"];
    expect(await checkSenderDomain("mail.example.test", { fetch: fetch as typeof globalThis.fetch })).toMatchObject({ dmarc: false, ok: false });
    await expect(checkSenderDomain("not a domain")).rejects.toThrow();
  });
});
