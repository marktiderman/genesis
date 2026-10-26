// @feat:notifications
import { describe, expect, it, vi } from "vitest";
import { RESEND_DEFAULT_PER_SECOND, SendError, expoPushProvider, resendProvider } from "../server/index";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("expoPushProvider", () => {
  it("sends with the access token and maps tickets in order", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as unknown[];
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer expo-token");
      return json({ data: body.map((_, i) => (i === 1 ? { status: "error", message: "secret text", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: `t${i}` })) });
    });
    const expo = expoPushProvider({ accessToken: "expo-token", fetch: fetch as typeof globalThis.fetch });
    const tickets = await expo.send([{ to: "ExponentPushToken[a]" }, { to: "ExponentPushToken[b]" }, { to: "ExponentPushToken[c]" }]);
    expect(tickets).toEqual([{ status: "ok", id: "t0" }, { status: "error", code: "DeviceNotRegistered" }, { status: "ok", id: "t2" }]);
  });

  it("treats a short answer as failed, never as sent", async () => {
    const expo = expoPushProvider({ fetch: (async () => json({ data: [{ status: "ok", id: "t0" }] })) as typeof fetch });
    expect(await expo.send([{ to: "a" }, { to: "b" }])).toEqual([{ status: "ok", id: "t0" }, { status: "error", code: "NoTicket" }]);
  });

  it("refuses more than 100 messages", async () => {
    await expect(expoPushProvider().send(Array.from({ length: 101 }, () => ({ to: "x" })))).rejects.toThrow(/at most 100/);
  });

  it("says when to come back on a 429, and never reads an error body", async () => {
    const expo = expoPushProvider({ fetch: (async () => new Response("echo of the request", { status: 429, headers: { "retry-after": "12" } })) as typeof fetch });
    const error = (await expo.send([{ to: "a" }]).catch((e: unknown) => e)) as SendError;
    expect(error).toBeInstanceOf(SendError);
    expect(error).toMatchObject({ retryable: true, status: 429, retryAfterSeconds: 12 });
    expect(error.message).not.toContain("echo");
  });

  it("reads receipts for the ids asked", async () => {
    const expo = expoPushProvider({ fetch: (async () => json({ data: { t1: { status: "ok" }, t2: { status: "error", details: { error: "MessageTooBig" } }, other: { status: "ok" } } })) as typeof fetch });
    expect(await expo.receipts(["t1", "t2", "t3"])).toEqual({ t1: { status: "ok" }, t2: { status: "error", code: "MessageTooBig" } });
  });
});

describe("resendProvider", () => {
  const message = { from: "Acme <notifications@mail.example.test>", to: ["a@example.test"], subject: "Hi", html: "<p>Hi</p>", text: "Hi", idempotencyKey: "k1", headers: { "List-Unsubscribe": "<https://x.test/u?t=1>" }, tags: [{ name: "category", value: "messages" }] };

  it("sends the idempotency key, headers and tags, and returns Resend's id", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["idempotency-key"]).toBe("k1");
      expect(headers.authorization).toBe("Bearer re_key");
      expect(JSON.parse(String(init?.body))).toMatchObject({ from: message.from, to: message.to, headers: message.headers, tags: message.tags });
      return json({ id: "re_123" });
    });
    expect(await resendProvider({ apiKey: "re_key", fetch: fetch as typeof globalThis.fetch }).send(message)).toEqual({ id: "re_123" });
  });

  it("fails invalid_idempotent_request loudly: the body changed under the key, so it is never counted as sent", async () => {
    const resend = resendProvider({ apiKey: "k", fetch: (async () => json({ name: "invalid_idempotent_request", message: "…" }, 409)) as typeof fetch });
    const error = (await resend.send(message).catch((e: unknown) => e)) as SendError;
    expect(error).toBeInstanceOf(SendError);
    expect(error).toMatchObject({ retryable: false, status: 409 });
    expect(error.message).toMatch(/^idempotency_body_changed/);
  });

  it("paces its requests under Resend's limit, five a second by default", async () => {
    const fetch = (async () => json({ id: "re_1" })) as typeof globalThis.fetch;
    const sleep = vi.fn(async () => {});
    const resend = resendProvider({ apiKey: "k", fetch, now: () => 0, sleep });
    await Promise.all(Array.from({ length: 6 }, () => resend.send(message)));
    expect(RESEND_DEFAULT_PER_SECOND).toBeLessThan(10);
    // Six at once, five a second: the first goes now, each next one 200 ms after the one before.
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([200, 400, 600, 800, 1000]);
    const slower = vi.fn(async () => {});
    const two = resendProvider({ apiKey: "k", fetch, now: () => 0, sleep: slower, perSecond: 2 });
    await Promise.all([two.send(message), two.send(message), two.send(message)]);
    expect(slower.mock.calls.map((c) => (c as unknown[])[0])).toEqual([500, 1000]);
  });

  it("retries concurrent_idempotent_requests soon", async () => {
    const resend = resendProvider({ apiKey: "k", fetch: (async () => json({ name: "concurrent_idempotent_requests" }, 409)) as typeof fetch });
    await expect(resend.send(message)).rejects.toMatchObject({ retryable: true, retryAfterSeconds: 5, status: 409 });
  });

  it("retries a 5xx, not a 422, and keeps only Resend's error name", async () => {
    const r500 = resendProvider({ apiKey: "k", fetch: (async () => json({ name: "internal_server_error" }, 500)) as typeof fetch });
    await expect(r500.send(message)).rejects.toMatchObject({ retryable: true, status: 500 });
    const r422 = resendProvider({ apiKey: "k", fetch: (async () => json({ name: "validation_error", message: "a@example.test is bad" }, 422)) as typeof fetch });
    const error = (await r422.send(message).catch((e: unknown) => e)) as SendError;
    expect(error).toMatchObject({ retryable: false, status: 422 });
    expect(error.message).toBe("Resend answered HTTP 422 (validation_error)");
  });

  it("refuses to send without a key, and turns a timeout into a retry", async () => {
    await expect(resendProvider({ apiKey: "" }).send(message)).rejects.toMatchObject({ retryable: false });
    const slow = resendProvider({ apiKey: "k", fetch: (async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); }) as typeof fetch });
    await expect(slow.send(message)).rejects.toMatchObject({ retryable: true, message: "Timed out" });
  });
});
