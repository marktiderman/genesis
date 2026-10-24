// @feat:push-sender
import { describe, expect, it, vi } from "vitest";
import { EXPO_RECEIPTS_URL, EXPO_SEND_URL, sendBatch } from "../../functions/genesis-push-send/expo.ts";
import {
  authorized,
  handle,
  readPushRequest,
  toExpoMessage,
  type HandlerDeps,
  type PushRequest,
  type PushStore,
  type PushTarget,
  type ReceiptResult,
  type TicketRow,
} from "../../functions/genesis-push-send/handler.ts";

const SECRET = "s".repeat(40);
const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const target = (n: number, hide = false): PushTarget => ({ device_id: `device-${n}`, token: `ExponentPushToken[t${n}]`, platform: "ios", hide_previews: hide });

type Call = { url: string; body: unknown; headers: Record<string, string> };
function expo(...responses: Array<Response | Error | ((body: unknown) => Response)>) {
  const calls: Call[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), body, headers: init?.headers as Record<string, string> });
    const next = responses.shift() ?? ((b: unknown) => okTickets((b as unknown[]).length));
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(body) : next;
  });
  return { fetch: fetchFn as unknown as typeof fetch, calls };
}
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const okTickets = (n: number, offset = 0) => jsonResponse(200, { data: Array.from({ length: n }, (_, i) => ({ status: "ok", id: `ticket-${offset + i}` })) });

function fakeStore(targets: Record<string, PushTarget[]> = {}, status = { deliver: true, reason: "ok", quiet_until: null as string | null }) {
  const tickets: TicketRow[] = [];
  const forgotten: string[] = [];
  const settled: ReceiptResult[] = [];
  const store: PushStore & { claimable: { id: number; ticket_id: string }[] } = {
    claimable: [],
    targets: vi.fn(async (userId: string) => targets[userId] ?? []),
    status: vi.fn(async () => status),
    recordTickets: vi.fn(async (rows: TicketRow[]) => void tickets.push(...rows)),
    forgetDevices: vi.fn(async (ids: string[]) => void forgotten.push(...ids)),
    claimReceipts: vi.fn(async () => store.claimable),
    settleReceipts: vi.fn(async (results: ReceiptResult[]) => void settled.push(...results)),
  };
  return { store, tickets, forgotten, settled };
}

function deps(store: PushStore, fetchFn: typeof fetch, env: Record<string, string> = {}): HandlerDeps & { logs: string[] } {
  const logs: string[] = [];
  return { logs, env: (n) => ({ GENESIS_PUSH_SECRET: SECRET, ...env })[n], fetch: fetchFn, store, log: (m) => logs.push(m) };
}

const request = (body: unknown, secret = SECRET) =>
  new Request("http://localhost/functions/v1/genesis-push-send", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(body) });

const message = (extra: Partial<PushRequest> = {}): PushRequest => ({ userId: USER, category: "messages", title: "Sam", body: "See you at six", url: "/messages/42", ...extra });

describe("genesis-push-send: who may call it", () => {
  it("refuses everyone without the secret, and compares it in constant time over digests", async () => {
    const { store } = fakeStore();
    const d = deps(store, expo().fetch);
    expect((await handle(request({ action: "send", messages: [message()] }, "wrong"), d)).status).toBe(401);
    expect((await handle(new Request("http://x", { method: "POST", body: "{}" }), d)).status).toBe(401);
    expect(await authorized(request({}), SECRET)).toBe(true);
    expect(await authorized(request({}, SECRET + "x"), SECRET)).toBe(false);
    expect(store.targets).not.toHaveBeenCalled();
  });

  it("says loudly, by name, when the secret isn't set, and works for nobody", async () => {
    const { store } = fakeStore();
    const d = deps(store, expo().fetch, { GENESIS_PUSH_SECRET: "short" });
    const res = await handle(request({ action: "send", messages: [message()] }, "short"), d);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "not_configured" });
    expect(d.logs.join("\n")).toContain("GENESIS_PUSH_SECRET");
    expect(d.logs.join("\n")).not.toContain("short");
  });

  it("refuses a malformed message and says which", async () => {
    const { store } = fakeStore();
    const d = deps(store, expo().fetch);
    const res = await handle(request({ action: "send", messages: [message(), message({ userId: "nope" })] }), d);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_message", index: 1 });
    for (const bad of [{ category: "Bad Cat" }, { title: "" }, { body: "x".repeat(1001) }, { url: "https://evil.example" }, { url: "//evil.example" }, { badge: -1 }, { data: { nested: { a: 1 } } }]) {
      expect(readPushRequest(message(bad as Partial<PushRequest>)), JSON.stringify(bad)).toBeNull();
    }
    expect((await handle(request({ action: "send", messages: Array.from({ length: 101 }, () => message()) }), d)).status).toBe(400);
  });
});

describe("genesis-push-send: send", () => {
  it("sends to each target device and records a ticket per message (category and status, never content)", async () => {
    const { store, tickets } = fakeStore({ [USER]: [target(1), target(2)] });
    const e = expo();
    const d = deps(store, e.fetch, { EXPO_ACCESS_TOKEN: "expo-token" });
    const res = await handle(request({ action: "send", messages: [message({ badge: 3 })] }), d);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sent: 2, failed: 0, forgotten: 0, results: [{ deliver: true, devices: 2, sent: 2, failed: 0 }] });
    expect(e.calls).toHaveLength(1);
    expect(e.calls[0]!.url).toBe(EXPO_SEND_URL);
    expect(e.calls[0]!.headers.authorization).toBe("Bearer expo-token");
    expect(e.calls[0]!.body).toEqual([
      { to: "ExponentPushToken[t1]", title: "Sam", body: "See you at six", data: { category: "messages", url: "/messages/42" }, sound: "default", badge: 3, channelId: "messages", priority: "high" },
      { to: "ExponentPushToken[t2]", title: "Sam", body: "See you at six", data: { category: "messages", url: "/messages/42" }, sound: "default", badge: 3, channelId: "messages", priority: "high" },
    ]);
    expect(store.targets).toHaveBeenCalledWith(USER, "messages", true, false);
    expect(tickets).toEqual([
      { user_id: USER, device_id: "device-1", category: "messages", ticket_id: "ticket-0", status: "sent" },
      { user_id: USER, device_id: "device-2", category: "messages", ticket_id: "ticket-1", status: "sent" },
    ]);
    // The response and the logs carry no token and no content.
    const text = JSON.stringify(body) + d.logs.join("\n");
    for (const secret of ["ExponentPushToken", "See you at six", "Sam", "expo-token"]) expect(text).not.toContain(secret);
  });

  it("hides the title, body, subtitle and data of someone who hides previews, keeping the link", async () => {
    const hidden = toExpoMessage(message({ subtitle: "Book club", data: { threadId: "42" } }), target(1, true), { title: "New notification" });
    expect(hidden).toEqual({ to: "ExponentPushToken[t1]", title: "New notification", data: { category: "messages", url: "/messages/42" }, sound: "default", channelId: "messages", priority: "high" });
    const custom = toExpoMessage(message(), target(1, true), { title: "Acme", body: "Open Acme to read it" });
    expect(custom).toMatchObject({ title: "Acme", body: "Open Acme to read it" });
    const shown = toExpoMessage(message({ subtitle: "Book club", data: { threadId: "42" } }), target(1, false), { title: "x" });
    expect(shown).toMatchObject({ title: "Sam", subtitle: "Book club", body: "See you at six", data: { threadId: "42", category: "messages", url: "/messages/42" } });
  });

  it("uses PUSH_HIDDEN_TITLE and PUSH_HIDDEN_BODY when they are set", async () => {
    const { store } = fakeStore({ [USER]: [target(1, true)] });
    const e = expo();
    await handle(request({ action: "send", messages: [message()] }), deps(store, e.fetch, { PUSH_HIDDEN_TITLE: "Acme", PUSH_HIDDEN_BODY: "You have a new message" }));
    expect(e.calls[0]!.body).toEqual([expect.objectContaining({ title: "Acme", body: "You have a new message" })]);
    expect(JSON.stringify(e.calls[0]!.body)).not.toContain("See you at six");
  });

  it("reports why a message had no devices (quiet hours, with when they end), sending nothing", async () => {
    const { store } = fakeStore({}, { deliver: false, reason: "quiet_hours", quiet_until: "2026-01-15T12:00:00Z" });
    const e = expo();
    const body = await (await handle(request({ action: "send", messages: [message({ urgent: false, defaultOn: false })] }), deps(store, e.fetch))).json();
    expect(body.results).toEqual([{ deliver: false, reason: "quiet_hours", quietUntil: "2026-01-15T12:00:00Z", devices: 0, sent: 0, failed: 0 }]);
    expect(store.targets).toHaveBeenCalledWith(USER, "messages", false, false);
    expect(e.calls).toHaveLength(0);
  });

  it("says no_devices when the person may get it but has no device", async () => {
    const { store } = fakeStore();
    const body = await (await handle(request({ action: "send", messages: [message()] }), deps(store, expo().fetch))).json();
    expect(body.results[0]).toMatchObject({ deliver: false, reason: "no_devices" });
  });

  it("forgets a device Expo calls DeviceNotRegistered and records the failure", async () => {
    const { store, tickets, forgotten } = fakeStore({ [USER]: [target(1), target(2)] });
    const e = expo(jsonResponse(200, { data: [{ status: "ok", id: "t-ok" }, { status: "error", message: "\"ExponentPushToken[t2]\" is not a registered push notification recipient", details: { error: "DeviceNotRegistered" } }] }));
    const d = deps(store, e.fetch);
    const body = await (await handle(request({ action: "send", messages: [message()] }), d)).json();
    expect(body).toMatchObject({ sent: 1, failed: 1, forgotten: 1 });
    expect(forgotten).toEqual(["device-2"]);
    expect(tickets[1]).toEqual({ user_id: USER, device_id: "device-2", category: "messages", status: "failed", error: "DeviceNotRegistered" });
    // Expo's message quotes the token; it is never logged or stored.
    expect(JSON.stringify(tickets) + d.logs.join("\n")).not.toContain("ExponentPushToken");
  });

  it("sends in batches of 100", async () => {
    const many = Array.from({ length: 150 }, (_, i) => target(i));
    const { store } = fakeStore({ [USER]: many });
    const e = expo();
    const body = await (await handle(request({ action: "send", messages: [message()] }), deps(store, e.fetch))).json();
    expect(e.calls.map((c) => (c.body as unknown[]).length)).toEqual([100, 50]);
    expect(body.sent).toBe(150);
  });

  it("resends a refused batch one by one, so one bad token can't silence the rest", async () => {
    const { store } = fakeStore({ [USER]: [target(1), target(2)] });
    const e = expo(jsonResponse(400, { errors: [{ code: "PUSH_TOO_MANY_EXPERIENCE_IDS", message: "ExponentPushToken[t2] belongs to another project" }] }), okTickets(1), jsonResponse(400, {}));
    const d = deps(store, e.fetch);
    const body = await (await handle(request({ action: "send", messages: [message()] }), d)).json();
    expect(e.calls.map((c) => (c.body as unknown[]).length)).toEqual([2, 1, 1]);
    expect(body).toMatchObject({ sent: 1, failed: 1 });
    expect(d.logs.join("\n")).not.toContain("another project");
  });

  it("never resends a batch that timed out or hit a 5xx or 429 (it may have been delivered)", async () => {
    for (const failure of [jsonResponse(503, {}), jsonResponse(429, {}), Object.assign(new Error("timed out"), { name: "TimeoutError" })]) {
      const { store, tickets } = fakeStore({ [USER]: [target(1), target(2)] });
      const e = expo(failure);
      const body = await (await handle(request({ action: "send", messages: [message()] }), deps(store, e.fetch))).json();
      expect(e.calls).toHaveLength(1);
      expect(body).toMatchObject({ sent: 0, failed: 2 });
      expect(tickets.every((t) => t.status === "failed" && t.error === "SendFailed")).toBe(true);
    }
  });

  it("counts a message Expo gave no ticket for as failed, never as sent", async () => {
    const e = expo(jsonResponse(200, { data: [{ status: "ok", id: "a" }] }));
    expect(await sendBatch(e.fetch, [{ to: "a" }, { to: "b" }])).toEqual([{ status: "ok", id: "a" }, { status: "error", details: { error: "NoTicket" } }]);
  });

  it("keeps going when one person's targets can't be read", async () => {
    const { store } = fakeStore({ [OTHER]: [target(9)] });
    (store.targets as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new Error("genesis_push_targets: 57014");
    });
    const body = await (await handle(request({ action: "send", messages: [message(), message({ userId: OTHER })] }), deps(store, expo().fetch))).json();
    expect(body.results.map((r: { reason: string; sent: number }) => [r.reason, r.sent])).toEqual([["error", 0], ["ok", 1]]);
  });
});

describe("genesis-push-send: receipts", () => {
  it("settles delivered and failed receipts, leaves the ones Expo doesn't have yet, and logs only codes", async () => {
    const { store, settled } = fakeStore();
    store.claimable = [{ id: 1, ticket_id: "a" }, { id: 2, ticket_id: "b" }, { id: 3, ticket_id: "c" }];
    const e = expo(jsonResponse(200, { data: { a: { status: "ok" }, b: { status: "error", message: "ExponentPushToken[x] gone", details: { error: "DeviceNotRegistered" } } } }));
    const d = deps(store, e.fetch);
    const body = await (await handle(request({ action: "receipts" }), d)).json();
    expect(e.calls[0]).toMatchObject({ url: EXPO_RECEIPTS_URL, body: { ids: ["a", "b", "c"] } });
    expect(settled).toEqual([{ id: 1, status: "delivered" }, { id: 2, status: "failed", error: "DeviceNotRegistered" }]);
    expect(body).toMatchObject({ ok: true, checked: 2, delivered: 1, failed: 1, pending: 1, errors: { DeviceNotRegistered: 1 } });
    expect(d.logs.join("\n")).not.toContain("ExponentPushToken");
  });

  it("says loudly when Expo reports the push credentials are wrong", async () => {
    const { store } = fakeStore();
    store.claimable = [{ id: 1, ticket_id: "a" }];
    const d = deps(store, expo(jsonResponse(200, { data: { a: { status: "error", details: { error: "InvalidCredentials" } } } })).fetch);
    await handle(request({ action: "receipts" }), d);
    expect(d.logs.join("\n")).toContain("eas credentials");
  });

  it("leaves receipts for the next poll when Expo can't be reached", async () => {
    const { store } = fakeStore();
    store.claimable = [{ id: 1, ticket_id: "a" }];
    const body = await (await handle(request({ action: "receipts" }), deps(store, expo(jsonResponse(502, {})).fetch))).json();
    expect(body).toMatchObject({ pending: 1, checked: 0 });
    expect(store.settleReceipts).not.toHaveBeenCalled();
  });

  it("asks Expo nothing when no receipt is due", async () => {
    const { store } = fakeStore();
    const e = expo();
    await handle(request({ action: "receipts" }), deps(store, e.fetch));
    expect(e.calls).toHaveLength(0);
  });
});
