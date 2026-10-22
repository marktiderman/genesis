import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineForm, f, when } from "../index";
import { validateSubmission } from "../server";
import {
  checkWebhookUrl,
  clearGoogleTokenCache,
  columnLetter,
  deliveryFailure,
  DeliveryError,
  emailDestination,
  escapeFormula,
  escapeHtml,
  GOOGLE_TOKEN_URL,
  headerSafe,
  httpError,
  idempotencyKey,
  isPrivateHost,
  isSafeFrom,
  mergeHeader,
  RESEND_API,
  resendProvider,
  responseRow,
  retryAfterSeconds,
  rowFor,
  sheetsDestination,
  SHEETS_API,
  signJwt,
  signWebhook,
  verifyWebhook,
  webhookDestination,
  type DeliverySubmission,
  type EmailMessage,
  type EmailProvider,
} from "../destinations";

// ── Fixtures ────────────────────────────────────────────────────────────────

const form = defineForm({
  id: "feedback",
  title: "Event feedback",
  hidden: { owner: f.hidden.string({ source: "server" }), member: f.hidden.string({ source: "server", identifying: true }) },
  blocks: [
    f.rating("overall", { label: "How was the event?", max: 5, required: true }),
    f.multiChoice("went_well", {
      label: "What went well?",
      options: [{ value: "hosting", label: "Hosting" }, { value: "content", label: "The content" }],
    }),
    f.longText("improve", { label: "Anything {{hidden:owner|we}} could do better?" }),
    f.yesNo("contact_me", { label: "Want a follow-up?" }),
    f.email("email", { label: "Your email", identifying: true }),
    f.shortText("ssn", { label: "Secret", sensitive: true }),
  ],
  logic: [when("contact_me").isNot(true).hide("email")],
  endings: [{ id: "default", title: "Thanks!" }],
});
const def = form.definition;
const anonymous = { ...def, settings: { anonymous: true } };

const submission: DeliverySubmission = {
  id: "resp-1",
  answers: {
    overall: 4,
    went_well: ["hosting", "content"],
    improve: "<script>alert(1)</script> & more",
    contact_me: true,
    email: "ada@example.com",
    ssn: "123-45-6789",
  },
  context: { owner: "Sam" },
  submittedAt: "2026-10-22",
  meta: { form_version: 3, session: "06:00" },
};

interface Call {
  url: string;
  init: RequestInit;
  body: string;
}

/** A fetch that records calls and answers from `handler`. */
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

// ── Results and classification ─────────────────────────────────────────────

describe("retry classification", () => {
  it("reads Retry-After as delta-seconds or an IMF-fixdate, at least 1 s and at most a day", () => {
    expect(retryAfterSeconds("30")).toBe(30);
    expect(retryAfterSeconds(" 30 ")).toBe(30);
    expect(retryAfterSeconds(new Date(1_000_000 + 90_000).toUTCString(), 60, 1_000_000)).toBe(90);
    expect(retryAfterSeconds("nonsense", 7)).toBe(7);
    expect(retryAfterSeconds(null)).toBe(60);
    expect(retryAfterSeconds("999999999")).toBe(86_400);
    expect(retryAfterSeconds("9".repeat(400))).toBe(86_400);
    // A floor of 1 s: "now" or a date already past never means "retry in a tight loop".
    expect(retryAfterSeconds("0")).toBe(1);
    expect(retryAfterSeconds(new Date(1_000_000 - 90_000).toUTCString(), 60, 1_000_000)).toBe(1);
    // Junk that Date.parse would read is not a Retry-After.
    for (const junk of ["-5", "1.5", "+5", "5s", "2026-10-22", "Oct 22 2026", "Thu, 22 Oct 2026 07:28:00 +0000", "1e3"]) {
      expect(retryAfterSeconds(junk, 7), junk).toBe(7);
    }
  });

  it("retries 408, 425, 429 and 5xx; not other statuses", () => {
    for (const status of [408, 425, 429, 500, 503]) {
      const e = httpError("X", new Response(null, { status }));
      expect(e.retryable, String(status)).toBe(true);
      expect(e.retryAfterSeconds).toBe(60);
    }
    for (const status of [400, 401, 403, 404, 410, 422]) {
      expect(httpError("X", new Response(null, { status })).retryable, String(status)).toBe(false);
    }
    expect(httpError("X", new Response(null, { status: 429, headers: { "retry-after": "12" } })).retryAfterSeconds).toBe(12);
  });

  it("reduces unknown errors to their kind, never their message", () => {
    const timeout = Object.assign(new Error("https://hook.example/?token=SECRET"), { name: "TimeoutError" });
    expect(deliveryFailure(timeout)).toEqual({ ok: false, retryable: true, error: "Timed out" });
    // A TypeError outside fetch is a bug: retrying would repeat it forever.
    expect(deliveryFailure(new TypeError("x is undefined https://x/?k=SECRET"))).toEqual({
      ok: false,
      retryable: false,
      error: "Unexpected error",
    });
    expect(deliveryFailure(new Error("boom SECRET")).error).toBe("Unexpected error");
    expect(deliveryFailure(new DeliveryError("Bad config", { status: 400 }))).toEqual({
      ok: false,
      retryable: false,
      error: "Bad config",
      status: 400,
    });
  });
});

// ── Rows ───────────────────────────────────────────────────────────────────

describe("responseRow", () => {
  it("lays out id, submitted_at, meta, then each field by key, with readable cells", () => {
    const { row, columns, labels } = responseRow(submission, def);
    expect(columns).toEqual(["id", "submitted_at", "form_version", "session", "overall", "went_well", "improve", "contact_me", "email", "ssn"]);
    expect(row).toMatchObject({
      id: "resp-1",
      submitted_at: "2026-10-22",
      form_version: 3,
      overall: 4,
      went_well: "Hosting, The content",
      contact_me: "Yes",
      email: "ada@example.com",
    });
    expect(labels["improve"]).toBe("Anything Sam could do better?");
  });

  it("leaves unanswered fields blank and works from a validated submission", () => {
    const result = validateSubmission(def, { answers: { overall: 2, contact_me: false, email: "x@example.com" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { row } = responseRow({ id: "r", ...result.submission }, def);
    expect(row).toMatchObject({ overall: 2, contact_me: "No", email: "", improve: "" });
  });

  it("gives identifying fields no column on an anonymous form", () => {
    const { columns, row } = responseRow(submission, anonymous);
    expect(columns).not.toContain("email");
    expect(JSON.stringify(row)).not.toContain("ada@example.com");
  });

  it("masks or omits sensitive fields on request", () => {
    expect(responseRow(submission, def, { sensitive: "mask" }).row["ssn"]).toBe("[sensitive]");
    expect(responseRow(submission, def, { sensitive: "omit" }).columns).not.toContain("ssn");
  });

  it("never leaks a masked or withheld value through recall in a label", () => {
    const recalling = defineForm({
      id: "recall",
      title: "Recall",
      hidden: { token: f.hidden.string({ source: "server", sensitive: true }) },
      blocks: [
        f.shortText("ssn", { label: "SSN", sensitive: true }),
        f.shortText("name", { label: "Name", identifying: true }),
        f.shortText("next", { label: "Thanks {{field:name|you}}, {{field:ssn|-}} {{hidden:token|-}}" }),
      ],
      settings: { anonymous: true },
    }).definition;
    const sub = { id: "r", answers: { ssn: "123-45-6789", name: "Ada", next: "x" }, context: { token: "tok_SECRET" } };
    const { labels } = responseRow(sub, recalling, { sensitive: "mask" });
    expect(labels["next"]).toBe("Thanks you, - -");
    expect(responseRow(sub, { ...recalling, settings: {} }).labels["next"]).toBe("Thanks Ada, 123-45-6789 tok_SECRET");
  });

  it("ignores prototype names as meta keys", () => {
    const meta = JSON.parse('{"__proto__": "x", "ok": 1}') as Record<string, number>;
    const { row, columns } = responseRow({ ...submission, meta }, def);
    expect(columns).toContain("ok");
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(columns).not.toContain("__proto__");
  });
});

describe("escapeFormula", () => {
  it("prefixes text a spreadsheet would run", () => {
    expect(escapeFormula("=HYPERLINK(\"http://evil\",\"x\")")).toBe("'=HYPERLINK(\"http://evil\",\"x\")");
    expect(escapeFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeFormula("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(escapeFormula("-2+3+cmd|' /C calc'!A0")).toBe("'-2+3+cmd|' /C calc'!A0");
    expect(escapeFormula("\t=1")).toBe("'\t=1");
    expect(escapeFormula("\r=1")).toBe("'\r=1");
  });

  it("leaves numbers, phone numbers and ordinary text alone", () => {
    expect(escapeFormula("+1 (555) 010-0000")).toBe("+1 (555) 010-0000");
    expect(escapeFormula("-2.5")).toBe("-2.5");
    expect(escapeFormula(-3)).toBe(-3);
    expect(escapeFormula(true)).toBe(true);
    expect(escapeFormula("Great event = fun")).toBe("Great event = fun");
    expect(escapeFormula("")).toBe("");
  });
});

// ── Email ──────────────────────────────────────────────────────────────────

function captureProvider() {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    name: "test",
    async send(message) {
      sent.push(message);
    },
  };
  return { provider, sent };
}

describe("emailDestination", () => {
  it("builds escaped HTML and plain text from the definition, sensitive values masked", async () => {
    const { provider, sent } = captureProvider();
    const email = emailDestination({ provider, from: "Forms <forms@example.com>" });
    const result = await email.deliver(submission, def, { to: ["owner@example.com"] });
    expect(result).toEqual({ ok: true });
    const message = sent[0]!;
    expect(message.subject).toBe("Event feedback: new response");
    expect(message.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    expect(message.html).not.toContain("<script>");
    expect(message.text).toContain("Anything Sam could do better?: <script>alert(1)</script> & more");
    expect(message.text).toContain("What went well?: Hosting, The content");
    expect(message.text).toContain("Secret: [sensitive]");
    expect(message.text).not.toContain("123-45-6789");
    expect(message.html).not.toContain("123-45-6789");
    expect(message.text).toContain("Response resp-1");
  });

  it("strips line breaks from the subject, wherever it comes from", async () => {
    const { provider, sent } = captureProvider();
    const email = emailDestination({
      provider,
      from: "forms@example.com",
      render: () => ({ subject: "Hi\r\nBcc: victim@example.com", text: "", html: "" }),
    });
    await email.deliver(submission, def, { to: "owner@example.com" });
    expect(sent[0]!.subject).toBe("Hi Bcc: victim@example.com");
    expect(headerSafe("a b\u0000c")).toBe("a b c");
    expect(headerSafe("x".repeat(300)).length).toBe(200);

    const configured = captureProvider();
    await emailDestination({ provider: configured.provider, from: "forms@example.com" }).deliver(submission, def, {
      to: "owner@example.com",
      subject: "New\nresponse",
    });
    expect(configured.sent[0]!.subject).toBe("New response");
  });

  it("uses a Reply-To answer only when it is one valid address", async () => {
    const send = async (answer: string, definition = def) => {
      const { provider, sent } = captureProvider();
      await emailDestination({ provider, from: "forms@example.com", replyTo: "email" }).deliver(
        { ...submission, answers: { ...submission.answers, email: answer } },
        definition,
        { to: "owner@example.com" },
      );
      return sent[0]?.replyTo;
    };
    expect(await send("ada@example.com")).toBe("ada@example.com");
    expect(await send("ada@example.com\r\nBcc: victim@example.com")).toBeUndefined();
    expect(await send("ada@example.com, victim@example.com")).toBeUndefined();
    expect(await send("Ada <ada@example.com>")).toBeUndefined();
    // An anonymous form never gives away an identifying answer.
    expect(await send("ada@example.com", anonymous)).toBeUndefined();
  });

  it("refuses bad recipients and from addresses permanently", async () => {
    const { provider, sent } = captureProvider();
    const email = emailDestination({ provider, from: "forms@example.com" });
    expect(await email.deliver(submission, def, {})).toMatchObject({ ok: false, retryable: false, error: "The email destination has no recipients" });
    expect(await email.deliver(submission, def, { to: ["ok@example.com", "bad\r\n@x.com"] })).toMatchObject({
      ok: false,
      retryable: false,
      error: "The email destination has an invalid recipient",
    });
    const many = Array.from({ length: 51 }, (_, i) => `u${i}@example.com`);
    expect(await email.deliver(submission, def, { to: many })).toMatchObject({ ok: false, retryable: false });
    const badFrom = emailDestination({ provider, from: "Evil\r\nBcc: x <forms@example.com>" });
    expect(await badFrom.deliver(submission, def, { to: "a@example.com" })).toMatchObject({ ok: false, retryable: false });
    expect(sent).toEqual([]);
    expect(isSafeFrom("Forms <forms@example.com>")).toBe(true);
    expect(isSafeFrom('"Forms" <forms@example.com>')).toBe(false);
  });

  it("keys idempotency on the delivery id and the recipients", async () => {
    const a = await idempotencyKey("d1", ["b@x.com", "a@x.com"]);
    expect(a).toBe(await idempotencyKey("d1", ["a@x.com", "b@x.com"]));
    expect(a).not.toBe(await idempotencyKey("d1", ["a@x.com"]));
    expect(a).toMatch(/^d1:[0-9a-f]{16}$/);
  });

  it("escapes every HTML special character", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

describe("resendProvider", () => {
  const destination = (fetch: typeof globalThis.fetch) =>
    emailDestination({ provider: resendProvider({ apiKey: "re_SECRET_KEY", fetch }), from: "forms@example.com" });

  it("posts to Resend with the key, the idempotency key and both bodies", async () => {
    const mock = mockFetch(() => json({ id: "email-1" }));
    const result = await destination(mock.fetch).deliver(submission, def, { to: "owner@example.com" }, { deliveryId: "del-9" });
    expect(result).toEqual({ ok: true });
    const call = mock.calls[0]!;
    expect(call.url).toBe(RESEND_API);
    expect(headersOf(call).get("authorization")).toBe("Bearer re_SECRET_KEY");
    expect(headersOf(call).get("idempotency-key")).toMatch(/^del-9:[0-9a-f]{16}$/);
    const body = JSON.parse(call.body) as Record<string, unknown>;
    expect(body).toMatchObject({ from: "forms@example.com", to: ["owner@example.com"], subject: "Event feedback: new response" });
    expect(typeof body["html"]).toBe("string");
    expect(typeof body["text"]).toBe("string");
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries 429 and 5xx with a wait, never with the key in the message", async () => {
    const limited = await destination(mockFetch(() => json({ name: "rate_limit_exceeded" }, 429, { "retry-after": "3" })).fetch).deliver(
      submission,
      def,
      { to: "owner@example.com" },
    );
    expect(limited).toEqual({ ok: false, retryable: true, retryAfterSeconds: 3, status: 429, error: "Resend answered 429 (rate_limit_exceeded)" });
    const down = await destination(mockFetch(() => new Response("upstream", { status: 502 })).fetch).deliver(submission, def, {
      to: "owner@example.com",
    });
    expect(down).toMatchObject({ ok: false, retryable: true, retryAfterSeconds: 60, status: 502 });
    expect(JSON.stringify([limited, down])).not.toContain("re_SECRET_KEY");
  });

  it("fails a malformed header value permanently, but retries a network error", async () => {
    // A newline in the key can never be sent: retrying would fail forever.
    const mock = mockFetch(() => json({ id: "email-1" }));
    const bad = await emailDestination({
      provider: resendProvider({ apiKey: "re_SECRET\nKEY", fetch: mock.fetch }),
      from: "forms@example.com",
    }).deliver(submission, def, { to: "owner@example.com" });
    expect(bad).toMatchObject({ ok: false, retryable: false });
    expect(JSON.stringify(bad)).not.toContain("SECRET");
    expect(mock.calls).toHaveLength(0);

    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const down = await destination(offline).deliver(submission, def, { to: "owner@example.com" });
    expect(down).toMatchObject({ ok: false, retryable: true, error: "Network error" });
  });

  it("fails a validation error permanently, keeping only Resend's error name", async () => {
    const mock = mockFetch(() => json({ name: "validation_error", message: "Invalid `to` ada@example.com" }, 422));
    const result = await destination(mock.fetch).deliver(submission, def, { to: "owner@example.com" });
    expect(result).toEqual({ ok: false, retryable: false, status: 422, error: "Resend answered 422 (validation_error)" });
  });

  it("retries a concurrent idempotent request, not a reused key", async () => {
    const concurrent = await destination(mockFetch(() => json({ name: "concurrent_idempotent_requests" }, 409)).fetch).deliver(
      submission,
      def,
      { to: "owner@example.com" },
    );
    expect(concurrent).toMatchObject({ ok: false, retryable: true, retryAfterSeconds: 5 });
    const reused = await destination(mockFetch(() => json({ name: "invalid_idempotent_request" }, 409)).fetch).deliver(submission, def, {
      to: "owner@example.com",
    });
    expect(reused).toMatchObject({ ok: false, retryable: false, status: 409 });
  });

  it("times out a request that never answers", async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
      })) as typeof fetch;
    const email = emailDestination({ provider: resendProvider({ apiKey: "k", fetch: hang, timeoutMs: 20 }), from: "forms@example.com" });
    expect(await email.deliver(submission, def, { to: "owner@example.com" })).toEqual({ ok: false, retryable: true, error: "Timed out" });
  });

  it("reports a network failure as retryable", async () => {
    const offline = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
    expect(await destination(offline).deliver(submission, def, { to: "owner@example.com" })).toEqual({
      ok: false,
      retryable: true,
      error: "Network error",
    });
  });
});

// ── Google auth ─────────────────────────────────────────────────────────────

let privateKeyPem = "";
let publicKey: Awaited<ReturnType<typeof crypto.subtle.importKey>>;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as { privateKey: typeof publicKey; publicKey: typeof publicKey };
  publicKey = pair.publicKey;
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  let bin = "";
  for (const b of pkcs8) bin += String.fromCharCode(b);
  // As env vars often hold it: "\n" escaped.
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\\n${btoa(bin).replace(/(.{64})/g, "$1\\n")}\\n-----END PRIVATE KEY-----\\n`;
});

const b64urlDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

describe("signJwt", () => {
  it("signs an RS256 JWT that verifies with the public key", async () => {
    const jwt = await signJwt({ iss: "svc@example.iam.gserviceaccount.com", aud: GOOGLE_TOKEN_URL }, privateKeyPem);
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(header!)))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(claims!)))).toMatchObject({ iss: "svc@example.iam.gserviceaccount.com" });
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      b64urlDecode(signature!),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(ok).toBe(true);
  });

  it("refuses a bad key with a message that never quotes it", async () => {
    await expect(signJwt({}, "-----BEGIN PRIVATE KEY-----\nTOPSECRETbm90IGEga2V5\n-----END PRIVATE KEY-----")).rejects.toThrow(
      "The Google private key is not a valid PKCS#8 RSA key",
    );
    await expect(signJwt({}, "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----")).rejects.toThrow(/PKCS#1/);
  });
});

// ── Sheets ─────────────────────────────────────────────────────────────────

describe("sheet helpers", () => {
  it("merges headers without moving existing columns", () => {
    expect(mergeHeader(["id", "", "overall"], ["overall", "improve"])).toEqual(["id", "", "overall", "improve"]);
    expect(mergeHeader(["id", ""], ["x"], 3)).toEqual(["id", "", "", "x"]);
    expect(mergeHeader(["id", "", ""], ["x"])).toEqual(["id", "x"]);
  });

  it("maps rows onto the header, escaping formulas only when asked", () => {
    expect(rowFor(["id", "a", "b"], { id: "r", b: "=1+1" })).toEqual(["r", "", "=1+1"]);
    expect(rowFor(["id", "b"], { id: "r", b: "=1+1" }, true)).toEqual(["r", "'=1+1"]);
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(701)).toBe("ZZ");
  });
});

describe("sheetsDestination", () => {
  const account = { clientEmail: "svc@example.iam.gserviceaccount.com", privateKey: "" };
  const config = { spreadsheetId: "sheet_ABCDEFGHIJ" };
  beforeEach(() => {
    clearGoogleTokenCache();
    account.privateKey = privateKeyPem;
  });

  /** A Google that holds one sheet in memory. */
  function fakeGoogle(
    options: {
      tab?: boolean;
      header?: string[];
      ids?: string[];
      fail?: (call: Call) => Response | null;
      /** Another worker adds the tab first: this addSheet answers 400 but the tab exists. */
      addSheetRace?: boolean;
      /** Another worker's header write lands right after this one's first write. */
      headerRace?: string[];
    } = {},
  ) {
    let header = options.header ?? [];
    let headerRace = options.headerRace;
    let tab = options.tab ?? false;
    const appended: unknown[][] = [];
    const mock = mockFetch((call) => {
      const failure = options.fail?.(call);
      if (failure) return failure;
      const url = decodeURIComponent(call.url);
      if (call.url === GOOGLE_TOKEN_URL) return json({ access_token: "ya29.TOKEN", expires_in: 3600 });
      if (url.includes("?fields=")) return json({ sheets: tab ? [{ properties: { sheetId: 7, title: "Responses" } }] : [] });
      if (url.endsWith(":batchUpdate")) {
        const body = JSON.parse(call.body) as { requests: Record<string, unknown>[] };
        if (body.requests[0]!["addSheet"]) {
          tab = true;
          if (options.addSheetRace) return json({ error: { message: "A sheet with the name already exists" } }, 400);
          return json({ replies: [{ addSheet: { properties: { sheetId: 7, title: "Responses" } } }] });
        }
        return json({});
      }
      if (url.includes("majorDimension=COLUMNS")) return json({ values: header.map((h) => [h]) });
      if (call.init.method === "PUT") {
        header = (JSON.parse(call.body) as { values: string[][] }).values[0]!;
        if (headerRace) {
          header = headerRace;
          headerRace = undefined;
        }
        return json({});
      }
      if (url.includes(":append")) {
        const rows = (JSON.parse(call.body) as { values: unknown[][] }).values;
        appended.push(...rows);
        return json({ updates: { updatedRange: `'Responses'!A2:K${1 + appended.length}` } });
      }
      if (/!J\d+:J$/.test(url) || /![A-Z]+\d+:[A-Z]+$/.test(url)) return json({ values: (options.ids ?? []).map((id) => [id]) });
      return json({ error: "unexpected" }, 500);
    });
    return { ...mock, appended, header: () => header };
  }

  it("creates the tab and header, then appends one RAW row with text stored as typed", async () => {
    const google = fakeGoogle();
    const sheet = sheetsDestination({ account, fetch: google.fetch });
    // RAW never runs a formula, so nothing is prefixed: a "'" would be stored literally.
    const evil = { ...submission, answers: { ...submission.answers, improve: "=IMPORTXML(\"http://evil\",\"//a\")" } };
    const result = await sheet.deliver(evil, def, config);
    expect(result.ok).toBe(true);
    expect(google.header()).toEqual(["id", "submitted_at", "form_version", "session", "overall", "went_well", "improve", "contact_me", "email", "ssn"]);
    expect(google.appended[0]).toEqual([
      "resp-1",
      "2026-10-22",
      3,
      "06:00",
      4,
      "Hosting, The content",
      "=IMPORTXML(\"http://evil\",\"//a\")",
      "Yes",
      "ada@example.com",
      "123-45-6789",
    ]);
    const append = google.calls.find((c) => c.url.includes(":append"))!;
    expect(append.url).toContain("valueInputOption=RAW");
    expect(headersOf(append).get("authorization")).toBe("Bearer ya29.TOKEN");
    // The token request carries a signed assertion, never the key itself.
    const token = google.calls[0]!;
    expect(token.body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    expect(token.body).not.toContain("PRIVATE");
    if (!result.ok) return;
    expect(result.state).toMatchObject({ spreadsheet_id: "sheet_ABCDEFGHIJ", sheet_name: "Responses", sheet_id: 7, last_row: 2 });
  });

  it("prefixes formula-like text and header keys with ' only when escapeFormulas is on", async () => {
    const withAt = defineForm({
      id: "at",
      title: "At",
      blocks: [f.longText("@note", { label: "Note" }), f.longText("plain", { label: "Plain" })],
    }).definition;
    const answers = { "@note": "@team thanks", plain: "=1+1" };
    const plain = fakeGoogle();
    await sheetsDestination({ account, fetch: plain.fetch }).deliver({ id: "r", answers }, withAt, config);
    expect(plain.header()).toEqual(["id", "@note", "plain"]);
    expect(plain.appended[0]).toEqual(["r", "@team thanks", "=1+1"]);

    clearGoogleTokenCache();
    const escaped = fakeGoogle();
    await sheetsDestination({ account, fetch: escaped.fetch, escapeFormulas: true }).deliver({ id: "r", answers }, withAt, config);
    expect(escaped.header()).toEqual(["id", "'@note", "plain"]);
    expect(escaped.appended[0]).toEqual(["r", "'@team thanks", "'=1+1"]);
  });

  it("makes one request (the append) once the state is cached, and reuses the token", async () => {
    const google = fakeGoogle();
    const sheet = sheetsDestination({ account, fetch: google.fetch });
    const first = await sheet.deliver(submission, def, config);
    if (!first.ok) throw new Error(first.error);
    const before = google.calls.length;
    const second = await sheet.deliver({ ...submission, id: "resp-2" }, def, config, { state: first.state });
    expect(second.ok).toBe(true);
    const calls = google.calls.slice(before);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain(":append");
  });

  it("never serves a cached token to the same email with a different private key", async () => {
    const tokenCalls = (g: ReturnType<typeof fakeGoogle>) => g.calls.filter((c) => c.url === GOOGLE_TOKEN_URL).length;
    const google = fakeGoogle({ tab: true });
    await sheetsDestination({ account, fetch: google.fetch }).deliver(submission, def, config);
    expect(tokenCalls(google)).toBe(1);
    // Same key again: a cache hit, no new token request.
    await sheetsDestination({ account, fetch: google.fetch }).deliver({ ...submission, id: "resp-2" }, def, config);
    expect(tokenCalls(google)).toBe(1);
    // Same email, another key: must sign (and here fail) rather than reuse the token.
    const other = { clientEmail: account.clientEmail, privateKey: "-----BEGIN PRIVATE KEY-----\nTOPSECRETbm90IGEga2V5\n-----END PRIVATE KEY-----" };
    const result = await sheetsDestination({ account: other, fetch: google.fetch }).deliver({ ...submission, id: "resp-3" }, def, config);
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(tokenCalls(google)).toBe(1);
    expect(google.appended.map((r) => r[0])).toEqual(["resp-1", "resp-2"]);
  });

  it("reuses the tab when a concurrent first delivery added it first", async () => {
    const google = fakeGoogle({ addSheetRace: true });
    const result = await sheetsDestination({ account, fetch: google.fetch }).deliver(submission, def, config);
    expect(result.ok).toBe(true);
    expect(google.appended).toHaveLength(1);
  });

  it("merges again when a concurrent header write drops its columns", async () => {
    // Another form's first delivery overwrites the header right after ours.
    const google = fakeGoogle({ headerRace: ["id", "other"] });
    const result = await sheetsDestination({ account, fetch: google.fetch }).deliver(submission, def, config);
    expect(result.ok).toBe(true);
    const header = google.header();
    expect(header.slice(0, 2)).toEqual(["id", "other"]);
    for (const key of ["overall", "improve", "email"]) expect(header).toContain(key);
    // The row maps onto the header as it really is.
    const row = google.appended[0]!;
    expect(row[header.indexOf("id")]).toBe("resp-1");
    expect(row[header.indexOf("other")]).toBe("");
    expect(row[header.indexOf("overall")]).toBe(4);
  });

  it("adds a column for a new key without moving the others", async () => {
    const google = fakeGoogle({ tab: true, header: ["id", "overall", "notes"] });
    const sheet = sheetsDestination({ account, fetch: google.fetch });
    await sheet.deliver({ id: "r", answers: { overall: 5 } }, def, config);
    expect(google.header().slice(0, 3)).toEqual(["id", "overall", "notes"]);
    expect(google.header()).toContain("improve");
    expect(google.appended[0]!.slice(0, 3)).toEqual(["r", 5, ""]);
  });

  it("skips a row already there on a redelivery", async () => {
    const google = fakeGoogle({ tab: true, ids: ["resp-1"] });
    const sheet = sheetsDestination({ account, fetch: google.fetch });
    const result = await sheet.deliver(submission, def, config, { redelivery: true });
    expect(result).toMatchObject({ ok: true, skipped: ["resp-1"] });
    expect(google.appended).toEqual([]);
  });

  it("appends a batch in one request", async () => {
    const google = fakeGoogle({ tab: true });
    const sheet = sheetsDestination({ account, fetch: google.fetch });
    const result = await sheet.deliverBatch!(
      [
        { submission, definition: def },
        { submission: { id: "resp-2", answers: { overall: 1 } }, definition: def },
      ],
      config,
    );
    expect(result.ok).toBe(true);
    expect(google.calls.filter((c) => c.url.includes(":append"))).toHaveLength(1);
    expect(google.appended.map((r) => r[0])).toEqual(["resp-1", "resp-2"]);
  });

  it("explains a sheet that is not shared, permanently", async () => {
    const google = fakeGoogle({ fail: (call) => (call.url.includes("?fields=") ? json({}, 403) : null) });
    const result = await sheetsDestination({ account, fetch: google.fetch }).deliver(submission, def, config);
    expect(result).toEqual({
      ok: false,
      retryable: false,
      status: 403,
      error: "Google Sheets read answered 403: is the sheet shared with svc@example.iam.gserviceaccount.com?",
    });
  });

  it("retries a rate limit with Google's wait", async () => {
    const google = fakeGoogle({
      tab: true,
      fail: (call) => (call.url.includes(":append") ? json({}, 429, { "retry-after": "20" }) : null),
    });
    const result = await sheetsDestination({ account, fetch: google.fetch }).deliver(submission, def, config);
    expect(result).toMatchObject({ ok: false, retryable: true, retryAfterSeconds: 20, status: 429 });
  });

  it("looks at the tab again when an append with cached state is refused", async () => {
    let refused = false;
    const google = fakeGoogle({
      tab: true,
      header: ["id"],
      fail: (call) => {
        if (call.url.includes(":append") && !refused) {
          refused = true;
          return json({}, 400);
        }
        return null;
      },
    });
    const sheet = sheetsDestination({ account, fetch: google.fetch });
    const state = {
      spreadsheet_id: "sheet_ABCDEFGHIJ",
      sheet_name: "Responses",
      sheet_id: 7,
      header: ["id", "submitted_at", "form_version", "session", "overall", "went_well", "improve", "contact_me", "email", "ssn"],
      columns: 26,
      last_row: 5,
    };
    const result = await sheet.deliver(submission, def, config, { state });
    expect(result.ok).toBe(true);
    expect(google.appended).toHaveLength(1);
  });

  it("refuses a missing or malformed spreadsheet id, and a token endpoint refusal", async () => {
    const sheet = sheetsDestination({ account, fetch: fakeGoogle().fetch });
    expect(await sheet.deliver(submission, def, {})).toMatchObject({ ok: false, retryable: false });
    expect(await sheet.deliver(submission, def, { spreadsheetId: "../../x?y" })).toMatchObject({ ok: false, retryable: false });
    expect((await sheet.deliver(submission, def, { spreadsheet_id: "sheet_ABCDEFGHIJ" })).ok).toBe(true);

    clearGoogleTokenCache();
    const refused = fakeGoogle({ fail: (call) => (call.url === GOOGLE_TOKEN_URL ? json({ error: "invalid_grant" }, 400) : null) });
    const result = await sheetsDestination({ account, fetch: refused.fetch }).deliver(submission, def, config);
    expect(result).toEqual({ ok: false, retryable: false, status: 400, error: "Google token endpoint answered 400" });
  });

  it("refuses a bad private key without quoting it", async () => {
    const sheet = sheetsDestination({ account: { clientEmail: "svc@x.com", privateKey: "TOPSECRET" }, fetch: fakeGoogle().fetch });
    const result = await sheet.deliver(submission, def, config);
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(JSON.stringify(result)).not.toContain("TOPSECRET");
  });

  it("sends the right URLs", () => {
    expect(SHEETS_API).toBe("https://sheets.googleapis.com/v4/spreadsheets");
  });
});

// ── Webhook ────────────────────────────────────────────────────────────────

describe("webhookDestination", () => {
  const secret = "whsec_YS13ZWJob29rLXNpZ25pbmctc2VjcmV0IQ==";
  const now = () => 1_800_000_000_000;

  it("posts a Standard Webhooks request that verifies", async () => {
    const mock = mockFetch(() => new Response(null, { status: 204 }));
    const hook = webhookDestination({ secret, fetch: mock.fetch, now });
    const result = await hook.deliver(submission, def, { url: "https://hooks.example.com/forms" }, { deliveryId: "del-1" });
    expect(result).toEqual({ ok: true });
    const call = mock.calls[0]!;
    const headers = headersOf(call);
    expect(headers.get("webhook-id")).toBe("del-1");
    expect(headers.get("webhook-timestamp")).toBe("1800000000");
    expect(headers.get("webhook-signature")).toMatch(/^v1,[A-Za-z0-9+/]+=*$/);
    expect(call.init.redirect).toBe("manual");
    expect(await verifyWebhook({ secret, headers, body: call.body, now })).toBe(true);
    // Tampered, wrong secret, stale.
    expect(await verifyWebhook({ secret, headers, body: call.body.replace("resp-1", "resp-2"), now })).toBe(false);
    expect(await verifyWebhook({ secret: "whsec_YW5vdGhlci1zZWNyZXQtZW50aXJlbHkh", headers, body: call.body, now })).toBe(false);
    expect(await verifyWebhook({ secret, headers, body: call.body, now: () => now() + 301_000 })).toBe(false);

    const payload = JSON.parse(call.body) as { type: string; data: { submission: { answers: Record<string, unknown> }; row: Record<string, unknown> } };
    expect(payload.type).toBe("form.submitted");
    expect(payload.data.submission.answers["went_well"]).toEqual(["hosting", "content"]);
    expect(payload.data.row["went_well"]).toBe("Hosting, The content");
  });

  it("matches the Standard Webhooks reference signature", async () => {
    // The example from the Standard Webhooks spec's reference implementations.
    const signature = await signWebhook(
      "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      "msg_p5jXN8AQM9LWM0D4loKWxJek",
      1614265330,
      '{"test": 2432232314}',
    );
    expect(signature).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  it("base64-decodes the secret with or without whsec_, as the reference libraries do", async () => {
    const args = ["msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, '{"test": 2432232314}'] as const;
    expect(await signWebhook("MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", ...args)).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
    // Not base64 (a raw passphrase, base64url, missing padding): refused, never used as UTF-8.
    for (const bad of ["a-webhook-signing-secret", "whsec_", "whsec_YS13ZWJob29rLXNpZ25pbmctc2VjcmV0IQ", "whsec_a-b_c-d_e-f_g-h_i-j_k-l_"]) {
      await expect(signWebhook(bad, ...args), bad).rejects.toThrow("The webhook secret must be base64");
    }
    const mock = mockFetch(() => new Response(null, { status: 204 }));
    expect(
      await webhookDestination({ secret: "a raw passphrase!", fetch: mock.fetch }).deliver(submission, def, { url: "https://h.example.com" }),
    ).toMatchObject({ ok: false, retryable: false, error: expect.stringContaining("must be base64") });
    expect(mock.calls).toEqual([]);
  });

  it("accepts any of several signatures (secret rotation)", async () => {
    const body = "{}";
    const signature = await signWebhook(secret, "m", 1_800_000_000, body);
    const headers = { "webhook-id": "m", "webhook-timestamp": "1800000000", "webhook-signature": `v1,AAAA ${signature}` };
    expect(await verifyWebhook({ secret, headers, body, now })).toBe(true);
    expect(await verifyWebhook({ secret, headers: { ...headers, "webhook-signature": "garbage" }, body, now })).toBe(false);
  });

  it("refuses unsafe URLs and short secrets permanently, never echoing the URL", async () => {
    const mock = mockFetch(() => new Response(null, { status: 200 }));
    const hook = webhookDestination({ secret, fetch: mock.fetch });
    for (const url of [
      "http://hooks.example.com/x",
      "https://user:pass@hooks.example.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://2130706433/x",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.1/x",
      "https://[::1]/x",
      "https://[::ffff:127.0.0.1]/x",
      "https://[fd00::1]/x",
      "https://metadata.google.internal/x",
      "not a url?token=SECRET",
      "",
    ]) {
      const result = await hook.deliver(submission, def, { url });
      expect(result, url).toMatchObject({ ok: false, retryable: false });
      if (!result.ok && url) expect(result.error).not.toContain(url);
    }
    expect(mock.calls).toEqual([]);
    expect(await webhookDestination({ secret: "whsec_c2hvcnQ=", fetch: mock.fetch }).deliver(submission, def, { url: "https://h.example.com" })).toMatchObject({
      ok: false,
      retryable: false,
      error: "The webhook secret is shorter than 16 bytes",
    });
    expect(checkWebhookUrl("http://127.0.0.1:3000/x", { allowInsecureUrls: true, allowPrivateHosts: true }).port).toBe("3000");
    expect(isPrivateHost("hooks.example.com")).toBe(false);
    expect(isPrivateHost("172.32.0.1")).toBe(false);
    expect(isPrivateHost("172.16.0.1")).toBe(true);
  });

  it("classifies receiver answers", async () => {
    const answer = async (status: number) =>
      webhookDestination({ secret, fetch: mockFetch(() => new Response(null, { status })).fetch }).deliver(submission, def, {
        url: "https://hooks.example.com",
      });
    expect(await answer(503)).toMatchObject({ ok: false, retryable: true, status: 503 });
    expect(await answer(410)).toMatchObject({ ok: false, retryable: false, status: 410 });
    expect(await answer(302)).toMatchObject({ ok: false, retryable: false, error: "Webhook answered 302: redirects are not followed" });
  });

  it("fails permanently, without its message, when the secret resolver throws", async () => {
    const mock = mockFetch(() => new Response(null, { status: 200 }));
    const throwing = webhookDestination({
      secret: () => {
        throw new Error("vault said token=SECRET");
      },
      fetch: mock.fetch,
    });
    expect(await throwing.deliver(submission, def, { url: "https://hooks.example.com" })).toEqual({
      ok: false,
      retryable: false,
      error: "The webhook secret could not be resolved",
    });
    // A resolver may still ask for a retry with a retryable DeliveryError.
    const busy = webhookDestination({
      secret: async () => {
        throw new DeliveryError("Vault busy", { retryable: true, retryAfterSeconds: 5 });
      },
      fetch: mock.fetch,
    });
    expect(await busy.deliver(submission, def, { url: "https://hooks.example.com" })).toMatchObject({ ok: false, retryable: true, error: "Vault busy" });
    expect(mock.calls).toEqual([]);
  });

  it("leaves identifying answers out on an anonymous form, and finds the secret per config", async () => {
    const mock = mockFetch(() => new Response(null, { status: 200 }));
    const seen: unknown[] = [];
    const hook = webhookDestination({
      secret: (config) => {
        seen.push(config["url"]);
        return secret;
      },
      fetch: mock.fetch,
    });
    await hook.deliver(submission, anonymous, { url: "https://hooks.example.com" });
    expect(mock.calls[0]!.body).not.toContain("ada@example.com");

    const masked = mockFetch(() => new Response(null, { status: 200 }));
    const withSecret = defineForm({
      id: "s",
      title: "S",
      hidden: { token: f.hidden.string({ source: "server", sensitive: true }), owner: f.hidden.string({ source: "server" }) },
      blocks: [f.shortText("ssn", { label: "SSN", sensitive: true })],
    }).definition;
    await webhookDestination({ secret, fetch: masked.fetch, sensitive: "mask" }).deliver(
      { id: "r", answers: { ssn: "123-45-6789" }, context: { token: "tok_SECRET", owner: "Sam" } },
      withSecret,
      { url: "https://hooks.example.com" },
    );
    const body = masked.calls[0]!.body;
    expect(body).not.toContain("tok_SECRET");
    expect(body).not.toContain("123-45-6789");
    expect(body).toContain("Sam");
    expect(seen).toEqual(["https://hooks.example.com"]);
  });
});
