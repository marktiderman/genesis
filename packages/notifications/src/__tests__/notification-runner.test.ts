// @feat:notifications
import { describe, expect, it, vi } from "vitest";
import {
  SECRET_LINK_PLACEHOLDER,
  SecretLinkError,
  canonicalJson,
  createNotificationRunner,
  resolveSecretLink,
  verifyUnsubscribeToken,
  type ClaimedJob,
  type EmailMessage,
  type EmailProvider,
  type NotificationStore,
  type PushMessage,
  type PushProvider,
  type RenderedEmail,
  type SettleOutcome,
} from "../server/index";
import { sha256Hex } from "../server/crypto";
import { USER, registry } from "./fixtures";

const UNSUB = { url: "https://app.example.test/notifications/unsubscribe", secret: "u".repeat(32) };

function job(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: "d1",
    claim_id: "c1",
    notification_id: "n1",
    channel: "push",
    attempt: 1,
    deferrals: 0,
    redelivery: false,
    type: "chat.message",
    category: "messages",
    tenant_id: null,
    user_id: USER,
    email: null,
    recipient_name: null,
    data: { sender_name: "Sam", preview: "See you at six", conversation_id: "c42" },
    thread_key: "c42",
    collapse_key: null,
    badge: 3,
    brand: null,
    transactional: false,
    critical: false,
    push_privacy: "default",
    ios_category: "message",
    hide_previews: false,
    devices: [{ id: "dev1", token: "ExponentPushToken[a]", platform: "ios" }],
    sender: null,
    rendered: null,
    rendered_hash: null,
    secret: null,
    ...overrides,
  };
}

function fakeStore(claims: { push?: ClaimedJob[]; email?: ClaimedJob[] }) {
  const settled: [string, SettleOutcome][] = [];
  const tickets: [string, unknown][] = [];
  const stored = new Map<string, { rendered: RenderedEmail; hash: string }>();
  const store: NotificationStore = {
    claim: async (channel) => {
      const list = claims[channel] ?? [];
      claims[channel] = [];
      return list;
    },
    storeRendered: async (id, _claim, rendered, hash) => {
      if (!stored.has(id)) stored.set(id, { rendered: JSON.parse(JSON.stringify(rendered)), hash });
      return stored.get(id)!;
    },
    settle: async (id, _claim, outcome) => {
      settled.push([id, outcome]);
      return true;
    },
    pushTickets: async (id, rows) => void tickets.push([id, rows]),
    receiptsClaim: async () => [],
    receiptsSettle: async () => {},
    emailEvent: async () => true,
    unsubscribe: async () => true,
    syncTypes: async () => 0,
  };
  return { store, settled, tickets, stored };
}

function fakePush(answer?: (messages: readonly PushMessage[]) => Promise<{ status: "ok"; id: string }[] | never>) {
  const sent: PushMessage[][] = [];
  const provider: PushProvider = {
    name: "fake",
    send: vi.fn(async (messages: readonly PushMessage[]) => {
      sent.push([...messages]);
      return answer ? answer(messages) : messages.map((_, i) => ({ status: "ok" as const, id: `t${sent.length}-${i}` }));
    }),
    receipts: async () => ({}),
  };
  return { provider, sent };
}

function fakeEmail(result: { id: string | null; alreadySent?: boolean } = { id: "re_1" }) {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = { name: "fake", send: vi.fn(async (m: EmailMessage) => (sent.push(m), result)) };
  return { provider, sent };
}

const emailOptions = (provider: EmailProvider, extra = {}) => ({
  provider,
  appName: "Example",
  domains: { transactional: "mail.example.test", other: "updates.example.test" },
  unsubscribe: UNSUB,
  secretLinks: { "forms.receipt": ({ data, secret }: { data: Record<string, unknown>; secret: string | null }) => `https://app.example.test/r/${String(data.response_id)}?k=${secret}` },
  ...extra,
});

describe("push", () => {
  it("batches every device of every job in 100s, with thread, category, badge and collapse", async () => {
    const devices = Array.from({ length: 250 }, (_, i) => ({ id: `dev${i}`, token: `ExponentPushToken[${i}]`, platform: "ios" }));
    const { store, settled, tickets } = fakeStore({ push: [job({ devices })] });
    const push = fakePush();
    const runner = createNotificationRunner({ store, registry, push: { provider: push.provider } });
    expect(await runner.runPush()).toMatchObject({ claimed: 1, sent: 1 });
    expect(push.sent.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(push.sent[0]![0]).toMatchObject({
      title: "Sam",
      body: "See you at six",
      threadId: "c42",
      categoryId: "message",
      badge: 3,
      channelId: "messages",
      collapseId: "n1",
      data: { notification_id: "n1", type: "chat.message", url: "/messages/c42", thread_key: "c42" },
    });
    // The notification's own data never rides in the payload.
    expect(JSON.stringify(push.sent)).not.toContain("conversation_id");
    expect(settled).toEqual([["d1", { status: "sent", provider_id: null }]]);
    expect((tickets[0]![1] as unknown[]).length).toBe(250);
  });

  it("sends neutral text when the person hides previews, and for a generic type", async () => {
    const { store } = fakeStore({ push: [job({ hide_previews: true }), job({ id: "d2", push_privacy: "generic" })] });
    const push = fakePush();
    await createNotificationRunner({ store, registry, push: { provider: push.provider } }).runPush();
    for (const m of push.sent.flat()) {
      expect(m.title).toBe("New notification");
      expect(m.body).toBeUndefined();
      expect(JSON.stringify(m)).not.toContain("See you at six");
    }
  });

  it("collapses per conversation with the collapse key", async () => {
    const { store } = fakeStore({ push: [job({ collapse_key: "conv:c42" })] });
    const push = fakePush();
    await createNotificationRunner({ store, registry, push: { provider: push.provider } }).runPush();
    expect(push.sent[0]![0]).toMatchObject({ collapseId: "conv:c42", tag: "conv:c42" });
  });

  it("skips a job whose only device Expo says is gone, and records the ticket so it is pruned", async () => {
    const { store, settled, tickets } = fakeStore({ push: [job()] });
    const provider: PushProvider = { name: "x", send: async () => [{ status: "error", code: "DeviceNotRegistered" }], receipts: async () => ({}) };
    await createNotificationRunner({ store, registry, push: { provider } }).runPush();
    expect(settled[0]).toEqual(["d1", { status: "skipped", reason: "device_not_registered" }]);
    expect(tickets[0]![1]).toEqual([{ device_id: "dev1", ticket_id: null, status: "failed", error: "DeviceNotRegistered" }]);
  });

  it("retries the jobs of a batch Expo couldn't take", async () => {
    const { store, settled } = fakeStore({ push: [job(), job({ id: "d2" })] });
    const { SendError } = await import("../server/errors");
    const provider: PushProvider = { name: "x", send: async () => { throw new SendError("Expo push answered HTTP 503", { retryable: true, status: 503 }); }, receipts: async () => ({}) };
    expect(await createNotificationRunner({ store, registry, push: { provider } }).runPush()).toMatchObject({ retrying: 2 });
    expect(settled[0]![1]).toMatchObject({ status: "retry", counted: true, error: "Expo push answered HTTP 503" });
  });

  it("resends a refused batch one by one", async () => {
    const { store, settled } = fakeStore({ push: [job({ devices: [{ id: "a", token: "ExponentPushToken[a]", platform: "ios" }, { id: "b", token: "ExponentPushToken[b]", platform: "ios" }] })] });
    const { SendError } = await import("../server/errors");
    let calls = 0;
    const provider: PushProvider = {
      name: "x",
      send: async (m) => {
        calls++;
        if (m.length > 1) throw new SendError("Expo push answered HTTP 400", { status: 400 });
        return [{ status: "ok", id: `t${calls}` }];
      },
      receipts: async () => ({}),
    };
    await createNotificationRunner({ store, registry, push: { provider } }).runPush();
    expect(calls).toBe(3);
    expect(settled[0]![1]).toMatchObject({ status: "sent" });
  });
});

describe("email", () => {
  const emailJob = (o: Partial<ClaimedJob> = {}) => job({ channel: "email", email: "a@example.test", devices: null, ...o });

  it("renders once, stores it, and sends from the shared domain with the tenant's name and reply-to", async () => {
    const { store, settled, stored } = fakeStore({ email: [emailJob({ tenant_id: "t1", sender: { from_name: "Riverside", reply_to: "hello@riverside.example.test", domain: null, domain_verified: false } })] });
    const mail = fakeEmail();
    await createNotificationRunner({ store, registry, email: emailOptions(mail.provider) }).runEmail();
    const m = mail.sent[0]!;
    expect(m.from).toBe("Riverside <notifications@updates.example.test>");
    expect(m.replyTo).toBe("hello@riverside.example.test");
    expect(m.idempotencyKey).toBe("genesis-notification-d1");
    expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(m.tags).toContainEqual({ name: "stream", value: "other" });
    expect(stored.get("d1")!.hash).toBe(await sha256Hex(canonicalJson(stored.get("d1")!.rendered)));
    expect(settled[0]).toEqual(["d1", { status: "sent", provider_id: "re_1" }]);
  });

  it("puts a working one-click unsubscribe token in the header", async () => {
    const { store } = fakeStore({ email: [emailJob()] });
    const mail = fakeEmail();
    await createNotificationRunner({ store, registry, email: emailOptions(mail.provider) }).runEmail();
    const header = mail.sent[0]!.headers!["List-Unsubscribe"]!;
    const token = new URL(header.slice(1, -1)).searchParams.get("t")!;
    expect(await verifyUnsubscribeToken(UNSUB.secret, token)).toEqual({ userId: USER, category: "messages" });
    expect(mail.sent[0]!.html).toContain("Unsubscribe");
  });

  it("puts no unsubscribe on a critical type's email (preferences can't turn it off)", async () => {
    const { store } = fakeStore({ email: [emailJob({ type: "security.new_sign_in", category: "security", critical: true })] });
    const mail = fakeEmail();
    await createNotificationRunner({ store, registry, email: emailOptions(mail.provider) }).runEmail();
    expect(mail.sent[0]!.headers).toBeUndefined();
    expect(mail.sent[0]!.html).not.toContain("Unsubscribe");
  });

  it("sends a tenant's verified domain as the from address", async () => {
    const { store } = fakeStore({ email: [emailJob({ sender: { from_name: "Riverside", reply_to: null, domain: "mail.riverside.example.test", domain_verified: true } })] });
    const mail = fakeEmail();
    await createNotificationRunner({ store, registry, email: emailOptions(mail.provider) }).runEmail();
    expect(mail.sent[0]!.from).toBe("Riverside <notifications@mail.riverside.example.test>");
  });

  it("retries byte for byte: the second attempt sends the stored render, not a new one", async () => {
    const first = fakeStore({ email: [emailJob()] });
    const failing: EmailProvider = { name: "x", send: async () => { const { SendError } = await import("../server/errors"); throw new SendError("Resend answered HTTP 500", { retryable: true, status: 500 }); } };
    let n = 0;
    const templates = { "chat.message": () => ({ subject: `Render ${++n}`, html: `<p>${n}</p>`, text: String(n) }) };
    await createNotificationRunner({ store: first.store, registry, email: emailOptions(failing, { templates }) }).runEmail();
    expect(first.settled[0]![1]).toMatchObject({ status: "retry" });
    const kept = first.stored.get("d1")!;
    // The next claim hands back what was stored.
    const second = fakeStore({ email: [emailJob({ attempt: 2, rendered: kept.rendered, rendered_hash: kept.hash })] });
    const mail = fakeEmail();
    await createNotificationRunner({ store: second.store, registry, email: emailOptions(mail.provider, { templates }) }).runEmail();
    expect(mail.sent[0]).toMatchObject({ subject: "Render 1", html: "<p>1</p>", idempotencyKey: "genesis-notification-d1" });
    expect(n).toBe(1);
  });

  it("refuses to send a stored render whose hash doesn't match", async () => {
    const rendered: RenderedEmail = { from: "x <a@b.test>", to: ["a@example.test"], subject: "s", html: "h", text: "t" };
    const { store, settled } = fakeStore({ email: [emailJob({ rendered, rendered_hash: "0".repeat(64) })] });
    const mail = fakeEmail();
    await createNotificationRunner({ store, registry, email: emailOptions(mail.provider) }).runEmail();
    expect(mail.sent).toHaveLength(0);
    expect(settled[0]![1]).toEqual({ status: "failed", error: "rendered_email_changed" });
  });

  it("counts Resend's already-sent as sent", async () => {
    const { store, settled } = fakeStore({ email: [emailJob()] });
    await createNotificationRunner({ store, registry, email: emailOptions(fakeEmail({ id: null, alreadySent: true }).provider) }).runEmail();
    expect(settled[0]![1]).toEqual({ status: "sent", provider_id: null });
  });

  it("builds a secret link at send time: never in data, never in the stored render", async () => {
    const receipt = emailJob({ type: "forms.receipt", category: "forms", transactional: true, data: { response_id: "r9", form_title: "Intake" }, secret: "plain-secret" });
    const { store, stored } = fakeStore({ email: [receipt] });
    const mail = fakeEmail();
    await createNotificationRunner({ store, registry, email: emailOptions(mail.provider) }).runEmail();
    const m = mail.sent[0]!;
    expect(m.html).toContain("https://app.example.test/r/r9?k=plain-secret");
    expect(m.text).toContain("https://app.example.test/r/r9?k=plain-secret");
    expect(JSON.stringify(stored.get("d1"))).not.toContain("plain-secret");
    expect(JSON.stringify(stored.get("d1"))).toContain(SECRET_LINK_PLACEHOLDER);
    // Transactional: no unsubscribe, from the transactional domain.
    expect(m.headers).toBeUndefined();
    expect(m.from).toBe("Example <notifications@mail.example.test>");
    expect(m.tags).toContainEqual({ name: "stream", value: "transactional" });
  });

  it("skips a job with no valid address, and fails an unknown type", async () => {
    const { store, settled } = fakeStore({ email: [emailJob({ email: "not an address" }), emailJob({ id: "d2", type: "gone.type" })] });
    await createNotificationRunner({ store, registry, email: emailOptions(fakeEmail().provider) }).runEmail();
    expect(settled).toContainEqual(["d1", { status: "skipped", reason: "no_address" }]);
    expect(settled).toContainEqual(["d2", { status: "failed", error: "unknown_type" }]);
  });

  it("is loud at setup: mail that isn't transactional needs unsubscribe, a secret-link type needs its builder", () => {
    const provider = fakeEmail().provider;
    expect(() => createNotificationRunner({ store: fakeStore({}).store, registry, email: { ...emailOptions(provider), unsubscribe: undefined } })).toThrow(/unsubscribe/);
    expect(() => createNotificationRunner({ store: fakeStore({}).store, registry, email: { ...emailOptions(provider), secretLinks: {} } })).toThrow(/forms.receipt/);
  });

  it("strips line breaks from subjects and names", async () => {
    const { store } = fakeStore({ email: [emailJob({ sender: { from_name: 'Evil"\r\nBcc: x@y', reply_to: "bad\r\naddress", domain: null, domain_verified: false } })] });
    const mail = fakeEmail();
    const templates = { "chat.message": () => ({ subject: "Hi\r\nBcc: x@y.test", html: "h", text: "t" }) };
    await createNotificationRunner({ store, registry, email: emailOptions(mail.provider, { templates }) }).runEmail();
    expect(mail.sent[0]!.subject).toBe("Hi Bcc: x@y.test");
    expect(mail.sent[0]!.from).toBe("Evil Bcc xy <notifications@updates.example.test>");
    expect(mail.sent[0]!.replyTo).toBeUndefined();
  });
});

describe("resolveSecretLink", () => {
  const ref = { data: { response_id: "r1" }, secret: "s3cret", notificationId: "n1", tenantId: null };
  it("builds the link from the ref at send time", async () => {
    expect(await resolveSecretLink({ "forms.receipt": ({ data, secret }) => `https://app.example.test/r/${String(data.response_id)}#${secret}` }, "forms.receipt", ref)).toBe("https://app.example.test/r/r1#s3cret");
  });
  it("is loud for a type with no builder, or a link that isn't https", async () => {
    await expect(resolveSecretLink({}, "forms.receipt", ref)).rejects.toBeInstanceOf(SecretLinkError);
    await expect(resolveSecretLink({ x: () => "http://evil.example.test/" }, "x", ref)).rejects.toThrow(/not https/);
    await expect(resolveSecretLink({ x: () => "javascript:alert(1)" }, "x", ref)).rejects.toThrow(/not https/);
    expect(await resolveSecretLink({ x: () => "http://localhost:3000/r" }, "x", ref)).toBe("http://localhost:3000/r");
    await expect(resolveSecretLink({ x: () => "not a url" }, "x", ref)).rejects.toThrow(/not a URL/);
  });
});
