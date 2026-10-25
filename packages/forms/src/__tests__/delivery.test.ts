// @feat:forms-destinations
// Phase 3 of delivery: sending by answer, SSRF checks on hook URLs, Slack,
// the webhook's URL lookup and DNS check, Google sign-in tokens for sheets,
// sealed secrets, and the outbox runner.
import { createDecipheriv, createHmac, hkdfSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineForm, f } from "../index";
import {
  checkHookHost,
  clearGoogleOAuthTokenCache,
  conditionOf,
  createDeliveryRunner,
  defaultBackoff,
  deliveryOutcome,
  DeliveryError,
  deriveSecretKey,
  GOOGLE_TOKEN_URL,
  googleOAuthAccessToken,
  HookUrlError,
  isCondition,
  isPublicAddress,
  newWebhookSecret,
  openSecret,
  parseHookUrl,
  passesCondition,
  refreshGoogleAccessToken,
  sealSecret,
  secretKeyBytes,
  sheetsDestination,
  signWebhook,
  slackDestination,
  slackMessage,
  escapeSlack,
  verifyWebhook,
  webhookDestination,
  type ClaimedDelivery,
  type DeliveryOutcome,
  type DeliveryResult,
  type DeliverySubmission,
  type Destination,
} from "../destinations";
import type { Condition } from "../types";

// ── Fixtures ────────────────────────────────────────────────────────────────

const form = defineForm({
  id: "front-desk",
  title: "Front desk <report>",
  hidden: { session: f.hidden.string({ source: "server" }), venue: f.hidden.string({ source: "url" }) },
  blocks: [
    f.yesNo("broken", { label: "Is something broken or unsafe?" }),
    f.singleChoice("area", {
      label: "Where?",
      options: [
        { value: "floor", label: "Main floor" },
        { value: "lockers", label: "Locker room" },
      ],
    }),
    f.multiChoice("tags", { label: "What about it?", options: [{ value: "equipment" }, { value: "cleaning" }] }),
    f.longText("notes", { label: "Tell us more" }),
    f.rating("score", { label: "How was it?", max: 5 }),
    f.email("email", { label: "Your email", identifying: true }),
    f.shortText("member", { label: "Member number", sensitive: true }),
  ],
});
const def = form.definition;

const submission: DeliverySubmission = {
  id: "resp-1",
  answers: {
    broken: true,
    area: "floor",
    tags: ["equipment"],
    notes: "<!channel> the rower & bike",
    email: "alex@example.com",
    member: "M-1234",
  },
  hidden: { venue: "from-url", session: "spoofed" },
  context: { session: "6:00 class" },
  submittedAt: "2026-10-23",
};

const brokenIsYes: Condition = { op: "eq", left: { field: "broken" }, right: { value: true } };

interface Call {
  url: string;
  init: RequestInit;
  body: string;
}

function mockFetch(handler: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(input), init, body: typeof init.body === "string" ? init.body : "" };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as typeof fetch;
  return { fetch: fn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const headersOf = (call: Call) => new Headers(call.init.headers as ConstructorParameters<typeof Headers>[0]);

const publicDns = async () => ["93.184.216.34"];

// ── Sending by answer ──────────────────────────────────────────────────────

describe("sending by answer", () => {
  it("sends everything without a condition", () => {
    expect(passesCondition(submission, def, {})).toBe(true);
    expect(passesCondition(submission, def, { when: null })).toBe(true);
  });

  it("evaluates config.when against the answers", () => {
    expect(passesCondition(submission, def, { when: brokenIsYes })).toBe(true);
    expect(passesCondition({ ...submission, answers: { broken: false } }, def, { when: brokenIsYes })).toBe(false);
    expect(passesCondition({ ...submission, answers: { broken: null } }, def, { when: brokenIsYes })).toBe(false);
    const lowScore: Condition = { op: "lte", left: { field: "score" }, right: { value: 2 } };
    expect(passesCondition({ ...submission, answers: { score: 1 } }, def, { when: lowScore })).toBe(true);
    expect(passesCondition({ ...submission, answers: { score: 4 } }, def, { when: lowScore })).toBe(false);
  });

  it("reads hidden inputs and context, the trusted context winning", () => {
    const session: Condition = { op: "eq", left: { hidden: "session" }, right: { value: "6:00 class" } };
    expect(passesCondition(submission, def, { when: session })).toBe(true);
    const venue: Condition = { op: "eq", left: { hidden: "venue" }, right: { value: "from-url" } };
    expect(passesCondition(submission, def, { when: venue })).toBe(true);
    const spoofed: Condition = { op: "eq", left: { hidden: "session" }, right: { value: "spoofed" } };
    expect(passesCondition(submission, def, { when: spoofed })).toBe(false);
  });

  it("treats a hidden input named __proto__ as a plain name", () => {
    const hidden = JSON.parse('{"__proto__": "x"}') as Record<string, string>;
    const proto: Condition = { op: "eq", left: { hidden: "__proto__" }, right: { value: "x" } };
    expect(passesCondition({ ...submission, hidden, context: {} }, def, { when: proto })).toBe(true);
  });

  it("fails rather than guesses on a condition it can't read", () => {
    expect(() => conditionOf({ when: { op: "drop table" } })).toThrow(DeliveryError);
    expect(() => passesCondition(submission, def, { when: "broken" })).toThrow("The destination's condition can't be read");
    expect(isCondition({ all: [brokenIsYes, { not: brokenIsYes }] })).toBe(true);
    expect(isCondition({ op: "eq", left: { field: 1 } })).toBe(false);
    expect(isCondition({ op: "eq", left: { field: "a", hidden: "b" } })).toBe(false);
    let deep: unknown = brokenIsYes;
    for (let i = 0; i < 12; i++) deep = { not: deep };
    expect(isCondition(deep)).toBe(false);
  });
});

// ── SSRF ───────────────────────────────────────────────────────────────────

describe("where a hook may post (SSRF)", () => {
  it("tells public addresses from private, loopback and reserved ones", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicAddress(ip), ip).toBe(true);
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "192.0.2.1",
      "198.51.100.7",
      "203.0.113.9",
      "::1",
      "::",
      "fe80::1",
      "fe80::1%en0",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "64:ff9b::a00:1",
      "2002:7f00:1::",
      "2001::1",
      "ff02::1",
      "2001:db8::1",
      "1:2:3:4:5:6:7:8:9",
      "not an ip",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("refuses addresses that aren't https on a public host", () => {
    const refused = [
      "http://example.com/h",
      "https://localhost/h",
      "https://app.localhost/h",
      "https://127.0.0.1/h",
      "https://2130706433/h", // 127.0.0.1 written as a number
      "https://[::1]/h",
      "https://10.0.0.5/h",
      "https://169.254.169.254/latest/meta-data",
      "https://metadata/h",
      "https://printer.local/h",
      "https://db.internal/h",
      "https://user:pass@example.com/h",
      "https://example.com:8080/h",
      "ftp://example.com/h",
      `https://example.com/${"a".repeat(2100)}`,
      "not a url",
      "",
    ];
    for (const url of refused) expect(() => parseHookUrl(url, "webhook"), url.slice(0, 40)).toThrow(HookUrlError);
    expect(parseHookUrl("https://example.com/hooks/1?x=1#frag").toString()).toBe("https://example.com/hooks/1?x=1");
    expect(parseHookUrl("https://8.8.8.8/h").hostname).toBe("8.8.8.8");
    expect(parseHookUrl("https://example.com:443/h").toString()).toBe("https://example.com/h");
  });

  it("takes only a Slack incoming webhook for Slack", () => {
    expect(parseHookUrl("https://hooks.slack.com/services/T0/B0/xyz", "slack").hostname).toBe("hooks.slack.com");
    for (const url of ["https://example.com/services/x", "https://hooks.slack.com/triggers/x", "https://hooks.slack.com.evil.test/services/x"]) {
      expect(() => parseHookUrl(url, "slack"), url).toThrow(HookUrlError);
    }
  });

  it("refuses a name that resolves to a private address; a failed lookup is retryable", async () => {
    const url = new URL("https://hooks.example.com/x");
    await expect(checkHookHost(url, publicDns)).resolves.toBeUndefined();
    await expect(checkHookHost(url, async () => ["93.184.216.34", "10.0.0.1"])).rejects.toMatchObject({ retryable: false });
    await expect(checkHookHost(url, async () => [])).rejects.toMatchObject({ retryable: true });
    await expect(checkHookHost(url, () => Promise.reject(new Error("ENOTFOUND")))).rejects.toMatchObject({
      name: "HookUrlError",
      retryable: true,
      message: "hooks.example.com couldn't be found",
    });
    await expect(checkHookHost(new URL("https://[::1]/x"), publicDns)).rejects.toThrow(HookUrlError);
  });
});

// ── Slack ──────────────────────────────────────────────────────────────────

describe("slackMessage", () => {
  it("lists the answers by label, escaped, with a link back", () => {
    const { text } = slackMessage(submission, def, {
      lines: [["Session", "6:00 class <with Riley>"]],
      link: { url: "https://app.example.test/forms/f1?tab=responses", text: "See it in the app" },
      omit: ["email"],
    });
    expect(text).toContain("*New response: Front desk &lt;report&gt;*");
    expect(text).toContain("*Session*: 6:00 class &lt;with Riley&gt;");
    expect(text).toContain("*Is something broken or unsafe?*: Yes");
    expect(text).toContain("*Where?*: Main floor");
    expect(text).toContain("&lt;!channel&gt; the rower &amp; bike");
    expect(text).toContain("*Member number*: [sensitive]");
    expect(text).toContain("<https://app.example.test/forms/f1?tab=responses|See it in the app> · 2026-10-23");
    expect(text).not.toContain("alex@example.com");
    expect(text).not.toContain("M-1234");
    expect(text).not.toContain("How was it?");
  });

  it("says when it is an update, cuts long answers and never makes a link from a non-http one", () => {
    const long = { ...submission, answers: { notes: "x".repeat(2000) } };
    const { text } = slackMessage(long, def, { update: true, link: { url: "javascript:alert(1)" } });
    expect(text.split("\n")[0]).toBe("*Updated response: Front desk &lt;report&gt;*");
    expect(text).toContain(`${"x".repeat(1500)}…`);
    expect(text).not.toContain("x".repeat(1501));
    expect(text.split("\n").at(-1)).toBe("Response resp-1 · 2026-10-23");
    expect(slackMessage({ id: "r", answers: {} }, def).text).toContain("_No answers._");
    expect(escapeSlack("a<b>&")).toBe("a&lt;b&gt;&amp;");
  });
});

describe("slackDestination", () => {
  const slackUrl = "https://hooks.slack.com/services/T0/B0/secret";

  it("posts the message to the incoming webhook it looks up, following no redirect", async () => {
    const mock = mockFetch(() => new Response("ok"));
    const lookup = vi.fn(async (_config: unknown, context: { destinationId?: string }) => (context.destinationId === "dest-1" ? slackUrl : ""));
    const slack = slackDestination({
      fetch: mock.fetch,
      url: lookup,
      resolveHost: publicDns,
      message: ({ update, destinationId }) => ({ heading: `${update ? "Changed" : "New"} report for ${destinationId}` }),
    });
    const result = await slack.deliver(submission, def, {}, { destinationId: "dest-1", update: true });
    expect(result).toEqual({ ok: true });
    expect(mock.calls[0]!.url).toBe(slackUrl);
    expect(mock.calls[0]!.init.redirect).toBe("manual");
    expect(mock.calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(mock.calls[0]!.body).text).toMatch(/^\*Changed report for dest-1\*/);
  });

  it("refuses anything but a Slack incoming webhook, before sending", async () => {
    const mock = mockFetch(() => new Response("ok"));
    const slack = slackDestination({ fetch: mock.fetch });
    expect(await slack.deliver(submission, def, { url: "https://example.com/services/x" })).toMatchObject({
      ok: false,
      retryable: false,
      error: expect.stringContaining("Slack incoming webhook"),
    });
    expect(await slack.deliver(submission, def, {})).toMatchObject({ ok: false, error: "The Slack destination has no url" });
    const privateDns = slackDestination({ fetch: mock.fetch, resolveHost: async () => ["10.0.0.1"] });
    expect(await privateDns.deliver(submission, def, { url: slackUrl })).toMatchObject({ ok: false, retryable: false });
    expect(mock.calls).toEqual([]);
  });

  it("treats a redirect as a failure, and 429 or 5xx as retryable after Retry-After", async () => {
    const redirect = mockFetch(() => new Response(null, { status: 302, headers: { location: "http://10.0.0.1" } }));
    expect(await slackDestination({ fetch: redirect.fetch }).deliver(submission, def, { url: slackUrl })).toMatchObject({
      ok: false,
      retryable: false,
      error: expect.stringContaining("redirects are not followed"),
    });
    const busy = mockFetch(() => new Response("", { status: 503, headers: { "retry-after": "30" } }));
    expect(await slackDestination({ fetch: busy.fetch }).deliver(submission, def, { url: slackUrl })).toEqual({
      ok: false,
      retryable: true,
      retryAfterSeconds: 30,
      status: 503,
      error: "Slack answered 503",
    });
  });

  it("never echoes the webhook URL or a resolver's message in an error", async () => {
    const slack = slackDestination({
      url: () => {
        throw new Error(`lookup failed for ${slackUrl}`);
      },
    });
    const result = await slack.deliver(submission, def, {});
    expect(result).toEqual({ ok: false, retryable: false, error: "The Slack webhook url could not be resolved" });
  });
});

// ── Webhooks (Standard Webhooks) ───────────────────────────────────────────

describe("Standard Webhooks signing", () => {
  // The example in the Standard Webhooks spec and its reference libraries.
  const vector = {
    secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
    id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
    timestamp: 1614265330,
    body: '{"test": 2432232314}',
    signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
  };

  it("matches the spec's test vector, and an independent HMAC", async () => {
    expect(await signWebhook(vector.secret, vector.id, vector.timestamp, vector.body)).toBe(vector.signature);
    const key = Buffer.from(vector.secret.slice("whsec_".length), "base64");
    const mac = createHmac("sha256", key).update(`${vector.id}.${vector.timestamp}.${vector.body}`).digest("base64");
    expect(`v1,${mac}`).toBe(vector.signature);
  });

  it("verifies the spec's vector, with several signatures, and refuses tampering", async () => {
    const headers = {
      "webhook-id": vector.id,
      "webhook-timestamp": String(vector.timestamp),
      "webhook-signature": `v1,bm90LWl0 ${vector.signature}`,
    };
    const now = () => vector.timestamp * 1000 + 10_000;
    expect(await verifyWebhook({ secret: vector.secret, headers, body: vector.body, now })).toBe(true);
    expect(await verifyWebhook({ secret: vector.secret, headers, body: '{"test": 2432232315}', now })).toBe(false);
    expect(await verifyWebhook({ secret: vector.secret, headers: { ...headers, "webhook-id": "msg_other" }, body: vector.body, now })).toBe(false);
    expect(await verifyWebhook({ secret: vector.secret, headers: { ...headers, "webhook-signature": "v2," + vector.signature.slice(3) }, body: vector.body, now })).toBe(false);
  });

  it("issues whsec_ secrets in the base64 the reference libraries read", async () => {
    const secret = newWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/);
    expect(Buffer.from(secret.slice(6), "base64")).toHaveLength(32);
    expect(newWebhookSecret()).not.toBe(secret);
    const signature = await signWebhook(secret, "msg_1", 1_800_000_000, "{}");
    const headers = { "webhook-id": "msg_1", "webhook-timestamp": "1800000000", "webhook-signature": signature };
    expect(await verifyWebhook({ secret, headers, body: "{}", now: () => 1_800_000_000_000 })).toBe(true);
  });
});

describe("webhookDestination lookups and checks", () => {
  const secret = newWebhookSecret();
  const now = () => 1_800_000_000_000;

  it("posts to the URL it looks up for the destination, signed, as an update when asked", async () => {
    const mock = mockFetch(() => new Response(null, { status: 204 }));
    const seen: unknown[] = [];
    const hook = webhookDestination({
      fetch: mock.fetch,
      now,
      resolveHost: publicDns,
      url: (_config, { destinationId }) => `https://hooks.example.com/in/${destinationId}`,
      secret: (_config, context) => {
        seen.push(context.destinationId);
        return secret;
      },
    });
    const result = await hook.deliver(submission, def, {}, { deliveryId: "del-1:r2", destinationId: "dest-9", update: true });
    expect(result).toEqual({ ok: true });
    const call = mock.calls[0]!;
    expect(call.url).toBe("https://hooks.example.com/in/dest-9");
    expect(seen).toEqual(["dest-9"]);
    const headers = headersOf(call);
    expect(headers.get("webhook-id")).toBe("del-1:r2");
    expect(await verifyWebhook({ secret, headers, body: call.body, now })).toBe(true);
    expect(JSON.parse(call.body).type).toBe("form.updated");
  });

  it("refuses at send time when the name points somewhere private", async () => {
    const mock = mockFetch(() => new Response(null, { status: 204 }));
    const hook = webhookDestination({ secret, fetch: mock.fetch, resolveHost: async () => ["127.0.0.1"] });
    expect(await hook.deliver(submission, def, { url: "https://hooks.example.com/in" })).toEqual({
      ok: false,
      retryable: false,
      error: "The address must be on the public internet.",
    });
    const gone = webhookDestination({ secret, fetch: mock.fetch, resolveHost: async () => [] });
    expect(await gone.deliver(submission, def, { url: "https://hooks.example.com/in" })).toMatchObject({ ok: false, retryable: true });
    expect(mock.calls).toEqual([]);
  });

  it("keeps config.url and form.submitted when no lookup or update is given", async () => {
    const mock = mockFetch(() => new Response(null, { status: 200 }));
    await webhookDestination({ secret, fetch: mock.fetch }).deliver(submission, def, { url: "https://hooks.example.com/a" });
    expect(mock.calls[0]!.url).toBe("https://hooks.example.com/a");
    expect(JSON.parse(mock.calls[0]!.body).type).toBe("form.submitted");
  });
});

// ── Google sign-in ─────────────────────────────────────────────────────────

describe("Google OAuth access tokens", () => {
  const client = { clientId: "client-1.apps.example.test", clientSecret: "client-secret" };
  beforeEach(() => clearGoogleOAuthTokenCache());

  it("trades a refresh token once, then caches it until a minute before it expires", async () => {
    const mock = mockFetch(() => json({ access_token: "ya29.FRESH", expires_in: 3600, scope: "https://www.googleapis.com/auth/drive.file" }));
    let t = 1_000_000;
    const options = { fetch: mock.fetch, now: () => t };
    expect(await googleOAuthAccessToken(client, "1//refresh", options)).toBe("ya29.FRESH");
    expect(await googleOAuthAccessToken(client, "1//refresh", options)).toBe("ya29.FRESH");
    expect(mock.calls).toHaveLength(1);
    const body = new URLSearchParams(mock.calls[0]!.body);
    expect(mock.calls[0]!.url).toBe(GOOGLE_TOKEN_URL);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "refresh_token",
      refresh_token: "1//refresh",
      client_id: client.clientId,
      client_secret: client.clientSecret,
    });
    // Another grant is never served this one's token.
    await googleOAuthAccessToken(client, "1//other", options);
    expect(mock.calls).toHaveLength(2);
    t += 3_541_000;
    await googleOAuthAccessToken(client, "1//refresh", options);
    expect(mock.calls).toHaveLength(3);
  });

  it("says to reconnect when access was removed, and retries when Google is down", async () => {
    const revoked = mockFetch(() => json({ error: "invalid_grant" }, 400));
    await expect(refreshGoogleAccessToken(client, "1//refresh", { fetch: revoked.fetch })).rejects.toMatchObject({
      retryable: false,
      message: "Google access to this sheet was removed. Connect the sheet again.",
    });
    const down = mockFetch(() => json({}, 503));
    await expect(refreshGoogleAccessToken(client, "1//refresh", { fetch: down.fetch })).rejects.toMatchObject({ retryable: true, status: 503 });
    const empty = mockFetch(() => json({}));
    await expect(refreshGoogleAccessToken(client, "1//refresh", { fetch: empty.fetch })).rejects.toMatchObject({ retryable: true });
    await expect(googleOAuthAccessToken(client, null)).rejects.toThrow("Connect the sheet again");
    await expect(refreshGoogleAccessToken({ clientId: "", clientSecret: "" }, "1//refresh")).rejects.toThrow("client id or secret is not set");
  });
});

describe("sheetsDestination with an access token", () => {
  const config = { spreadsheetId: "sheet_ABCDEFGHIJ" };
  const small = defineForm({ id: "small", title: "Small", blocks: [f.shortText("a", { label: "A" }), f.shortText("b", { label: "B" })] }).definition;
  const state = { spreadsheet_id: "sheet_ABCDEFGHIJ", sheet_name: "Responses", sheet_id: 7, header: ["id", "a", "b"], columns: 26, last_row: 4 };

  function fakeSheet(ids: string[], fail?: (call: Call) => Response | null) {
    const appended: unknown[][] = [];
    const updated: { range: string; values: unknown[][] }[] = [];
    const mock = mockFetch((call) => {
      const failure = fail?.(call);
      if (failure) return failure;
      const url = decodeURIComponent(call.url);
      if (url.endsWith("/values:batchUpdate")) {
        const body = JSON.parse(call.body) as { valueInputOption: string; data: { range: string; values: unknown[][] }[] };
        expect(body.valueInputOption).toBe("RAW");
        updated.push(...body.data);
        return json({});
      }
      if (url.includes(":append")) {
        appended.push(...(JSON.parse(call.body) as { values: unknown[][] }).values);
        return json({ updates: { updatedRange: `'Responses'!A5:C${4 + appended.length}` } });
      }
      if (/!A\d+:A$/.test(url)) return json({ values: ids.map((id) => [id]) });
      return json({ error: "unexpected" }, 500);
    });
    return { ...mock, appended, updated };
  }

  it("signs in with the token it looks up for the destination, never a service account", async () => {
    const sheet = fakeSheet([]);
    const accessToken = vi.fn(async (_config: unknown, context: { destinationId?: string }) => `ya29.FOR-${context.destinationId}`);
    const result = await sheetsDestination({ accessToken, fetch: sheet.fetch }).deliver({ id: "r9", answers: { a: "x" } }, small, config, {
      state,
      destinationId: "dest-3",
    });
    expect(result.ok).toBe(true);
    expect(sheet.calls.map((c) => headersOf(c).get("authorization"))).toEqual(["Bearer ya29.FOR-dest-3"]);
    expect(sheet.calls.some((c) => c.url === GOOGLE_TOKEN_URL)).toBe(false);
    expect(sheet.appended).toEqual([["r9", "x", ""]]);
  });

  it("overwrites an updated response's row where it is, and appends it when the row is gone", async () => {
    const sheet = fakeSheet(["r1", "r2", "r3"]);
    const destination = sheetsDestination({ accessToken: () => "ya29.T", fetch: sheet.fetch });
    const result = await destination.deliverBatch!(
      [
        { submission: { id: "r2", answers: { a: "changed" } }, definition: small, update: true },
        { submission: { id: "r7", answers: { b: "back" } }, definition: small, update: true },
        { submission: { id: "r8", answers: { a: "new" } }, definition: small },
      ],
      config,
      { state },
    );
    expect(result.ok).toBe(true);
    // An update reads the whole id column, from row 2.
    expect(decodeURIComponent(sheet.calls[0]!.url)).toContain("!A2:A");
    expect(sheet.updated).toEqual([{ range: "'Responses'!A3", values: [["r2", "changed", ""]] }]);
    expect(sheet.appended).toEqual([
      ["r7", "", "back"],
      ["r8", "new", ""],
    ]);
  });

  it("reports a refused sheet as no longer connected, and needs an account or a token", async () => {
    const sheet = fakeSheet([], () => json({}, 403));
    expect(await sheetsDestination({ accessToken: () => "ya29.T", fetch: sheet.fetch }).deliver({ id: "r", answers: {} }, small, config, { state })).toMatchObject({
      ok: false,
      retryable: false,
      error: "Google Sheets append answered 403: is the sheet still connected to its Google account?",
    });
    expect(await sheetsDestination({}).deliver({ id: "r", answers: {} }, small, config)).toMatchObject({
      ok: false,
      error: "The sheet destination has neither an account nor an access token",
    });
  });
});

// ── Sealed secrets ─────────────────────────────────────────────────────────

describe("sealed secrets", () => {
  const raw = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const keyText = Buffer.from(raw).toString("base64");

  it("opens only with its own key, purpose and associated data", async () => {
    const key = await deriveSecretKey(keyText, "hook-v1");
    const sealed = await sealSecret(key, JSON.stringify({ url: "https://hooks.example.com/h" }), "destination:dest-1");
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("example");
    expect(await openSecret(key, sealed, "destination:dest-1")).toBe('{"url":"https://hooks.example.com/h"}');
    await expect(openSecret(key, sealed, "destination:dest-2")).rejects.toThrow("The stored secret could not be decrypted");
    await expect(openSecret(await deriveSecretKey(keyText, "token-v1"), sealed, "destination:dest-1")).rejects.toThrow(DeliveryError);
    await expect(openSecret(await deriveSecretKey(Buffer.from("x".repeat(32)).toString("base64"), "hook-v1"), sealed, "destination:dest-1")).rejects.toThrow(
      DeliveryError,
    );
    await expect(openSecret(key, "v2.a.b", "destination:dest-1")).rejects.toThrow("not in a known format");
    expect(await sealSecret(key, "same", "aad")).not.toBe(await sealSecret(key, "same", "aad"));
  });

  it("is AES-256-GCM under an HKDF-SHA-256 key, so any implementation can open it", async () => {
    const key = await deriveSecretKey(raw, "token-v1");
    const sealed = await sealSecret(key, "1//refresh-token", "grant:g1");
    const [, iv, body] = sealed.split(".");
    const bytes = Buffer.from(body!, "base64url");
    const aes = Buffer.from(hkdfSync("sha256", raw, new Uint8Array(0), "token-v1", 32));
    const decipher = createDecipheriv("aes-256-gcm", aes, Buffer.from(iv!, "base64url"));
    decipher.setAAD(Buffer.from("grant:g1"));
    decipher.setAuthTag(bytes.subarray(bytes.length - 16));
    expect(Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - 16)), decipher.final()]).toString()).toBe("1//refresh-token");
  });

  it("takes a 32-byte key as base64 or base64url, and says what is wrong otherwise", () => {
    expect(secretKeyBytes(keyText)).toEqual(raw);
    expect(secretKeyBytes(Buffer.from(raw).toString("base64url"))).toEqual(raw);
    expect(() => secretKeyBytes("")).toThrow("The encryption key is not set");
    expect(() => secretKeyBytes("c2hvcnQ=")).toThrow("must be 32 bytes");
    expect(() => secretKeyBytes("not base64 at all!")).toThrow("is not base64");
    expect(() => secretKeyBytes(new Uint8Array(16))).toThrow("must be 32 bytes");
  });
});

// ── The outbox runner ──────────────────────────────────────────────────────

describe("createDeliveryRunner", () => {
  const NOW = 1_800_000_000_000;

  function claimed(over: Partial<ClaimedDelivery> = {}): ClaimedDelivery {
    return {
      id: "del-1",
      destinationId: "dest-1",
      kind: "test",
      config: {},
      submission,
      definition: def,
      attempt: 1,
      ...over,
    };
  }

  /** An in-memory outbox: claims what's queued, keeps each outcome. */
  function outbox(queue: ClaimedDelivery[]) {
    const recorded = new Map<string, DeliveryOutcome>();
    const states = new Map<string, unknown>();
    const claims: { limit: number; filter?: unknown }[] = [];
    return {
      recorded,
      states,
      claims,
      claim: async (request: { limit: number; filter?: unknown }) => {
        claims.push(request);
        return queue.splice(0, request.limit);
      },
      record: async (delivery: ClaimedDelivery, outcome: DeliveryOutcome) => {
        recorded.set(delivery.id, outcome);
      },
      saveState: async (id: string, state: unknown) => {
        states.set(id, state);
      },
    };
  }

  const destination = (deliver: Destination["deliver"], extra: Partial<Destination> = {}): Destination => ({ kind: "test", deliver, ...extra });

  it("claims, delivers and records each delivery, passing its id, update and redelivery", async () => {
    const box = outbox([claimed(), claimed({ id: "del-2", destinationId: "dest-2", update: true, redelivery: true, attempt: 2 })]);
    const deliver = vi.fn(async (): Promise<DeliveryResult> => ({ ok: true }));
    const runner = createDeliveryRunner({ ...box, destinations: { test: destination(deliver) }, now: () => NOW });
    const report = await runner.run({ filter: { account: "riverside-gym" } });
    expect(report).toMatchObject({ claimed: 2, sent: 2, failed: 0 });
    expect(box.claims).toEqual([{ limit: 25, filter: { account: "riverside-gym" } }]);
    expect([...box.recorded.values()]).toEqual([{ status: "sent" }, { status: "sent" }]);
    expect(deliver.mock.calls[1]).toEqual([
      submission,
      def,
      {},
      expect.objectContaining({ deliveryId: "del-2", destinationId: "dest-2", update: true, redelivery: true }),
    ]);
  });

  it("claims one batch per run", async () => {
    const box = outbox(Array.from({ length: 5 }, (_, i) => claimed({ id: `d${i}`, destinationId: `dest-${i}` })));
    const runner = createDeliveryRunner({ ...box, batchSize: 3, destinations: { test: destination(async () => ({ ok: true })) } });
    expect((await runner.run()).claimed).toBe(3);
    expect((await runner.run({ limit: 1 })).claimed).toBe(1);
    expect(box.claims.map((c) => c.limit)).toEqual([3, 1]);
  });

  it("records a deliberate skip as skipped, never retried", async () => {
    const box = outbox([claimed()]);
    const runner = createDeliveryRunner({ ...box, destinations: { test: destination(async () => ({ ok: true, notSent: "Skipped: today's cap is reached" })) } });
    expect(await runner.run()).toMatchObject({ skipped: 1, sent: 0 });
    expect(box.recorded.get("del-1")).toEqual({ status: "skipped", reason: "Skipped: today's cap is reached" });
  });

  it("filters by the destination's condition without calling it, and fails an unreadable one", async () => {
    const box = outbox([
      claimed({ id: "match", config: { when: brokenIsYes } }),
      claimed({ id: "miss", config: { when: brokenIsYes }, submission: { ...submission, answers: { broken: false } } }),
      claimed({ id: "bad", destinationId: "dest-2", config: { when: { op: "nope" } } }),
    ]);
    const deliver = vi.fn(async (): Promise<DeliveryResult> => ({ ok: true }));
    const report = await createDeliveryRunner({ ...box, destinations: { test: destination(deliver) } }).run();
    expect(report).toMatchObject({ sent: 1, filtered: 1, failed: 1 });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(box.recorded.get("miss")).toEqual({ status: "filtered" });
    expect(box.recorded.get("bad")).toEqual({ status: "failed", error: "The destination's condition can't be read" });
  });

  it("fails permanently on a permanent error or an unknown kind, and keeps going", async () => {
    const box = outbox([
      claimed({ id: "a", destinationId: "dest-1" }),
      claimed({ id: "b", destinationId: "dest-2", kind: "fax" }),
      claimed({ id: "c", destinationId: "dest-3" }),
    ]);
    const deliver = vi.fn(async (s: DeliverySubmission, _d: unknown, _c: unknown, o?: { deliveryId?: string }): Promise<DeliveryResult> =>
      o?.deliveryId === "a" ? { ok: false, retryable: false, status: 404, error: "Webhook answered 404" } : { ok: true },
    );
    const log = vi.fn();
    const report = await createDeliveryRunner({ ...box, log, destinations: { test: destination(deliver) } }).run();
    expect(report).toMatchObject({ sent: 1, failed: 2 });
    expect(box.recorded.get("a")).toEqual({ status: "failed", error: "Webhook answered 404", httpStatus: 404 });
    expect(box.recorded.get("b")).toEqual({ status: "failed", error: "No destination for kind fax" });
    expect(log).toHaveBeenCalledWith("Delivery a (test) failed: Webhook answered 404");
  });

  it("defers a failure the service timed without using up an attempt", async () => {
    const box = outbox([claimed({ attempt: 8 })]);
    const runner = createDeliveryRunner({
      ...box,
      now: () => NOW,
      destinations: { test: destination(async () => ({ ok: false, retryable: true, retryAfterSeconds: 30, status: 429, error: "Webhook answered 429" })) },
    });
    expect(await runner.run()).toMatchObject({ deferred: 1, retrying: 0, failed: 0 });
    expect(box.recorded.get("del-1")).toEqual({
      status: "retry",
      error: "Webhook answered 429",
      retryAt: new Date(NOW + 30_000),
      retryAfterSeconds: 30,
      counted: false,
      httpStatus: 429,
    });
  });

  it("backs off a retryable failure by attempt, and gives up after maxAttempts", async () => {
    const failing = destination(async () => ({ ok: false, retryable: true, error: "Network error" }));
    const box = outbox([claimed({ id: "early", attempt: 3 }), claimed({ id: "last", destinationId: "dest-2", attempt: 5 })]);
    const report = await createDeliveryRunner({ ...box, now: () => NOW, maxAttempts: 5, destinations: { test: failing } }).run();
    expect(report).toMatchObject({ retrying: 1, failed: 1 });
    expect(box.recorded.get("early")).toEqual({
      status: "retry",
      error: "Network error",
      retryAt: new Date(NOW + 240_000),
      retryAfterSeconds: 240,
      counted: true,
    });
    expect(box.recorded.get("last")).toEqual({ status: "failed", error: "Network error (gave up after 5 attempts)" });
    expect([1, 2, 3, 10, 20].map(defaultBackoff)).toEqual([60, 120, 240, 21_600, 21_600]);
    expect(deliveryOutcome({ ok: false, retryable: true, error: "x" }, 1, { now: 0, backoff: () => 5 })).toMatchObject({ retryAt: new Date(5000) });
  });

  it("hands one destination's deliveries over as one batch and keeps the state it returns", async () => {
    const box = outbox([
      claimed({ id: "s1", destinationId: "sheet-1", kind: "batchy", state: { last_row: 1 } }),
      claimed({ id: "s2", destinationId: "sheet-1", kind: "batchy", state: { last_row: 1 }, redelivery: true }),
      claimed({ id: "other", destinationId: "dest-9" }),
    ]);
    const deliverBatch = vi.fn(async (): Promise<DeliveryResult> => ({ ok: true, state: { last_row: 3 }, skipped: ["resp-1"] }));
    const deliver = vi.fn(async (): Promise<DeliveryResult> => ({ ok: true }));
    const report = await createDeliveryRunner({
      ...box,
      destinations: { batchy: destination(deliver, { kind: "batchy", deliverBatch }), test: destination(deliver) },
    }).run();
    expect(report).toMatchObject({ claimed: 3, sent: 3 });
    expect(deliverBatch).toHaveBeenCalledTimes(1);
    expect(deliverBatch.mock.calls[0]).toEqual([
      [
        { submission, definition: def, deliveryId: "s1", update: undefined },
        { submission, definition: def, deliveryId: "s2", update: undefined },
      ],
      {},
      expect.objectContaining({ state: { last_row: 1 }, redelivery: true, destinationId: "sheet-1" }),
    ]);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(box.states.get("sheet-1")).toEqual({ last_row: 3 });
    expect(box.states.has("dest-9")).toBe(false);
    expect(box.recorded.get("s1")).toEqual({ status: "sent", alreadyThere: true });
  });

  it("passes each single delivery the state the one before it returned", async () => {
    const box = outbox([claimed({ id: "a", state: { n: 0 } }), claimed({ id: "b", state: { n: 0 } })]);
    const seen: unknown[] = [];
    const deliver = vi.fn(async (_s: unknown, _d: unknown, _c: unknown, o?: { state?: unknown }): Promise<DeliveryResult> => {
      seen.push(o?.state);
      return { ok: true, state: { n: seen.length } };
    });
    await createDeliveryRunner({ ...box, destinations: { test: destination(deliver) } }).run();
    expect(seen).toEqual([{ n: 0 }, { n: 1 }]);
    expect(box.states.get("dest-1")).toEqual({ n: 2 });
  });

  it("never stores raw text from an error a destination throws", async () => {
    const box = outbox([claimed()]);
    const throwing = destination(async () => {
      throw new Error("connect to https://user:token@hooks.example.com failed");
    });
    await createDeliveryRunner({ ...box, now: () => NOW, destinations: { test: throwing } }).run();
    const outcome = box.recorded.get("del-1")!;
    expect(outcome).toMatchObject({ status: "retry", error: "Unexpected error" });
    expect(JSON.stringify(outcome)).not.toContain("token");
  });

  it("counts a lost claim as stale and a failed record as unrecorded, recording the rest", async () => {
    const box = outbox([claimed({ id: "lost" }), claimed({ id: "broken", destinationId: "dest-2" }), claimed({ id: "fine", destinationId: "dest-3" })]);
    const recorded: string[] = [];
    const log = vi.fn();
    const report = await createDeliveryRunner({
      ...box,
      log,
      record: async (delivery) => {
        if (delivery.id === "broken") throw new Error("database down: password=hunter2");
        recorded.push(delivery.id);
        return delivery.id !== "lost";
      },
      saveState: async () => {
        throw new Error("nope");
      },
      destinations: { test: destination(async () => ({ ok: true, state: { x: 1 } })) },
    }).run();
    expect(report).toMatchObject({ claimed: 3, sent: 1, stale: 1, unrecorded: 1 });
    expect(recorded.sort()).toEqual(["fine", "lost"]);
    expect(log).toHaveBeenCalledWith("Recording delivery broken failed");
    expect(log).toHaveBeenCalledWith("Saving destination dest-1's state failed");
    expect(JSON.stringify(log.mock.calls)).not.toContain("hunter2");
  });

  it("runs real destinations end to end: a webhook signed, a Slack message filtered", async () => {
    const mock = mockFetch(() => new Response(null, { status: 204 }));
    const secret = newWebhookSecret();
    const box = outbox([
      claimed({ id: "w1", kind: "webhook", destinationId: "hook-1", config: { url: "https://hooks.example.com/in" } }),
      claimed({
        id: "s1",
        kind: "slack",
        destinationId: "slack-1",
        config: { url: "https://hooks.slack.com/services/T/B/x", when: { op: "lte", left: { field: "score" }, right: { value: 2 } } },
      }),
    ]);
    const report = await createDeliveryRunner({
      ...box,
      now: () => NOW,
      destinations: {
        webhook: webhookDestination({ secret, fetch: mock.fetch, now: () => NOW, resolveHost: publicDns }),
        slack: slackDestination({ fetch: mock.fetch }),
      },
    }).run();
    expect(report).toMatchObject({ sent: 1, filtered: 1 });
    expect(mock.calls).toHaveLength(1);
    const headers = headersOf(mock.calls[0]!);
    expect(headers.get("webhook-id")).toBe("w1");
    expect(await verifyWebhook({ secret, headers, body: mock.calls[0]!.body, now: () => NOW })).toBe(true);
  });
});
