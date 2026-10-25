// @feat:support-feedback @feat:feature-voting
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveBlocks } from "@marktiderman/genesis-features/blocks";
import {
  base64ToBytes,
  cleanRoute,
  composeCollectors,
  createContextCollector,
  createIntakeClient,
  createIntakeSink,
  createSupportClient,
  defineSupportBlock,
  fill,
  isUnread,
  resolveSupportCopy,
  sanitizeContext,
  supportPaths,
  validateSubmitInput,
  SUPPORT_BLOCK_ID,
  WIDGET_HEADERS,
} from "../index";
import { arg, fakeSupabase } from "./fake-supabase";

const ME = "00000000-0000-4000-8000-0000000000a1";
const REPORT = "11111111-1111-4111-8111-111111111111";

describe("cleanRoute", () => {
  it("names private path segments instead of keeping them", () => {
    expect(cleanRoute("/users/jane@example.test/reset/abc123token456xyz789")).toBe("/users/:email/reset/:token");
    expect(cleanRoute("/orders/12345")).toBe("/orders/:id");
    expect(cleanRoute("/r/0b5a2c7e-1d3f-4a6b-9c8d-7e6f5a4b3c2d/edit")).toBe("/r/:id/edit");
    expect(cleanRoute("/settings/notifications")).toBe("/settings/notifications");
    expect(cleanRoute("/u/jane%40example.test")).toBe("/u/:email");
  });
});

describe("the wire contract", () => {
  it("is byte-identical to the intake function's copy", () => {
    const pkg = readFileSync(join(__dirname, "../contract.ts"), "utf8");
    const fn = readFileSync(join(__dirname, "../../../supabase/functions/genesis-support-intake/contract.ts"), "utf8");
    expect(fn).toBe(pkg);
  });

  it("drops a route's query string and fragment", () => {
    expect(cleanRoute("/reset?token=abc#x")).toBe("/reset");
    expect(cleanRoute("?only")).toBeUndefined();
    expect(cleanRoute(undefined)).toBeUndefined();
  });

  it("validates a submit body: known keys, types and limits", () => {
    expect(validateSubmitInput({ body: "hi", route: "/a?b=c" })).toEqual({ ok: true, value: { body: "hi", route: "/a" } });
    expect(validateSubmitInput({ body: " " })).toMatchObject({ ok: false, field: "body" });
    expect(validateSubmitInput({ body: "x", op: "list" })).toMatchObject({ ok: false, field: "op" });
    expect(validateSubmitInput({ body: "x", type: "rant" })).toMatchObject({ ok: false, field: "type" });
    expect(validateSubmitInput({ body: "x".repeat(20001) })).toMatchObject({ ok: false, error: "payload_too_large" });
    expect(validateSubmitInput({ body: "x", context: { blob: "y".repeat(17000) } })).toMatchObject({ ok: false, error: "payload_too_large", field: "context" });
    expect(validateSubmitInput({ body: "x", tags: Array(51).fill("t") })).toMatchObject({ ok: false, field: "tags" });
  });
});

describe("collectors", () => {
  it("read their values when feedback is sent, and clean them", async () => {
    let route = "/home?secret=1";
    const c = createContextCollector({ route: () => route, platform: "ios", appVersion: () => "1.0.0 (1)", device: { model: "x" } });
    expect(await c.collect()).toEqual({ route: "/home", platform: "ios", appVersion: "1.0.0 (1)", device: { model: "x" } });
    route = "/settings";
    expect((await c.collect()).route).toBe("/settings");
  });

  it("drop a device bag over 4 KB rather than send what the database refuses", () => {
    expect(sanitizeContext({ device: { blob: "x".repeat(5000) } }).device).toBeUndefined();
  });

  it("compose, the later winning and the bags merging", async () => {
    const a = createContextCollector({ platform: "ios", device: { model: "x" } });
    const b = createContextCollector({ appVersion: "2", device: { os: "18" } });
    expect(await composeCollectors(a, b).collect()).toEqual({ platform: "ios", appVersion: "2", device: { model: "x", os: "18" } });
  });
});

describe("base64ToBytes", () => {
  it("decodes base64 and data URIs", () => {
    expect([...base64ToBytes("aGk=")]).toEqual([104, 105]);
    expect([...base64ToBytes("data:image/png;base64,aGk=")]).toEqual([104, 105]);
    expect(() => base64ToBytes("not base64!")).toThrow();
  });
});

describe("the support client", () => {
  it("sends a report, uploads its screenshot under <user>/<report>/ and records it", async () => {
    const fake = fakeSupabase({
      respond: (call) => (call.table === "support_reports" ? { data: { id: REPORT }, error: null } : { data: null, error: null }),
    });
    const client = createSupportClient(fake.client, { randomId: () => "shot-1" });
    const delivery = await client.submit({
      type: "bug",
      message: "Broken",
      context: { route: "/a?token=x", platform: "ios", appVersion: "1.0", userId: "someone-else", device: { m: 1 } },
      attachments: [{ kind: "screenshot", contentType: "image/jpeg", base64: "data:image/jpeg;base64,aGk=", width: 390, height: 844 }],
    });
    expect(delivery).toEqual({ id: REPORT, attachmentsDropped: 0 });
    const inserted = arg(fake.calls[0], "insert") as Record<string, unknown>;
    expect(inserted).toEqual({ type: "bug", title: null, message: "Broken", route: "/a", app_version: "1.0", platform: "ios", device: { m: 1 }, context: {} });
    // The person is never sent: the database takes them from the session.
    expect(inserted).not.toHaveProperty("user_id");
    expect(fake.uploads).toEqual([{ bucket: "genesis-support", path: `${ME}/${REPORT}/shot-1.jpg`, body: new Uint8Array([104, 105]), options: { contentType: "image/jpeg", upsert: false } }]);
    expect(arg(fake.calls[1], "insert")).toEqual({ report_id: REPORT, path: `${ME}/${REPORT}/shot-1.jpg`, content_type: "image/jpeg", byte_size: 2, width: 390, height: 844 });
  });

  it("keeps the report when a screenshot fails, and says it was dropped", async () => {
    const fake = fakeSupabase({
      respond: () => ({ data: { id: REPORT }, error: null }),
      upload: () => ({ data: null, error: { message: "too big" } }),
    });
    const delivery = await createSupportClient(fake.client).submit({ type: "bug", message: "x", context: {}, attachments: [{ kind: "screenshot", contentType: "image/png", base64: "aGk=" }] });
    expect(delivery.attachmentsDropped).toBe(1);
  });

  it("refuses to send without a session", async () => {
    const fake = fakeSupabase({ userId: null });
    await expect(createSupportClient(fake.client).submit({ type: "bug", message: "x", context: {} })).rejects.toMatchObject({ code: "42501" });
  });

  it("surfaces the database's rate limit", async () => {
    const fake = fakeSupabase({ respond: () => ({ data: null, error: { message: "too many", code: "GS429" } }) });
    await expect(createSupportClient(fake.client).submit({ type: "bug", message: "x", context: {} })).rejects.toMatchObject({ rateLimited: true });
  });

  it("lists only the person's own reports, with unread staff replies", async () => {
    const fake = fakeSupabase({
      respond: () => ({
        data: [{ id: REPORT, type: "bug", message: "m", status: "open", created_at: "2026-10-24T09:00:00Z", updated_at: "x", last_staff_reply_at: "2026-10-24T10:00:00Z", user_read_at: "2026-10-24T09:30:00Z" }],
        error: null,
      }),
    });
    const [report] = await createSupportClient(fake.client).myReports();
    expect(fake.calls[0]!.ops).toContainEqual(["eq", ["user_id", ME]]);
    expect(report).toMatchObject({ id: REPORT, unread: true });
  });

  it("isUnread: a staff reply newer than the last read", () => {
    expect(isUnread({ lastStaffReplyAt: null, userReadAt: null })).toBe(false);
    expect(isUnread({ lastStaffReplyAt: "2026-01-02", userReadAt: null })).toBe(true);
    expect(isUnread({ lastStaffReplyAt: "2026-01-02", userReadAt: "2026-01-03" })).toBe(false);
  });

  it("treats a delete that removed nothing as a refusal", async () => {
    const fake = fakeSupabase({ respond: () => ({ data: [], error: null }) });
    await expect(createSupportClient(fake.client).deleteReport(REPORT)).rejects.toMatchObject({ code: "42501" });
  });

  it("marks the board with the person's own votes and ideas, and leaves hidden ones out", async () => {
    const fake = fakeSupabase({
      respond: (call) =>
        call.table === "support_ideas"
          ? { data: [{ id: "i1", title: "Dark mode", status: "open", vote_count: 3, created_at: "x" }, { id: "i2", title: "Export", status: "planned", vote_count: 1, created_at: "x" }], error: null }
          : { data: [{ idea_id: "i2" }], error: null },
      // Who suggested an idea isn't readable; the database answers "mine".
      rpc: (fn) => (fn === "support_my_idea_ids" ? { data: ["i1"], error: null } : { data: null, error: null }),
    });
    const ideas = await createSupportClient(fake.client).ideas();
    expect(fake.calls[0]!.ops).toContainEqual(["neq", ["status", "hidden"]]);
    expect(String(arg(fake.calls[0], "select"))).not.toContain("author_id");
    expect(ideas.map((i) => [i.id, i.mine, i.voted])).toEqual([["i1", true, false], ["i2", false, true]]);
  });

  it("votes only with the idea id (the database adds the person), and voting twice is fine", async () => {
    const fake = fakeSupabase({ respond: () => ({ data: null, error: { message: "dup", code: "23505" } }) });
    await expect(createSupportClient(fake.client).vote("i1")).resolves.toBeUndefined();
    expect(arg(fake.calls[0], "insert")).toEqual({ idea_id: "i1" });
  });

  it("reads 'you asked, we shipped' from support_shipped_for_me", async () => {
    const fake = fakeSupabase({
      rpc: () => ({ data: [{ id: "i1", title: "Dark mode", status: "shipped", feature_id: "charts-dark-mode", vote_count: 4, created_at: "x", shipped_at: "y", mine: false, voted: true }], error: null }),
    });
    const [idea] = await createSupportClient(fake.client).shippedForMe();
    expect(fake.rpcs[0]).toEqual({ fn: "support_shipped_for_me", args: { max_rows: 50 } });
    expect(idea).toMatchObject({ featureId: "charts-dark-mode", voted: true });
  });
});

describe("the intake client", () => {
  it("sends the contract headers, the token, and `op` last", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ reportId: "r", findingId: "r", status: "open" }), { status: 200 }));
    const client = createIntakeClient({ endpoint: "https://app.example/", publishableKey: "pk", getAccessToken: () => "tok", fetchImpl });
    await client.submit({ body: "hi", op: "list" } as never);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.example/functions/v1/genesis-support-intake");
    expect(init.headers).toMatchObject({ authorization: "Bearer tok", [WIDGET_HEADERS.key]: "pk", [WIDGET_HEADERS.contract]: "1" });
    expect(JSON.parse(String(init.body)).op).toBe("submit");
  });

  it("turns a refusal into an IntakeError with the function's code", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }));
    await expect(createIntakeClient({ endpoint: "https://x", publishableKey: "pk", fetchImpl }).list()).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("as a sink, reports screenshots as dropped (the function takes none)", async () => {
    const sink = createIntakeSink({ submit: async () => ({ reportId: "r", findingId: "r", status: "open" }), boot: vi.fn(), list: vi.fn() });
    expect(await sink.submit({ type: "bug", message: "x", context: {}, attachments: [{ kind: "screenshot", contentType: "image/png", base64: "aGk=" }] })).toEqual({ id: "r", attachmentsDropped: 1 });
  });
});

describe("the block", () => {
  it("is the support-feedback feature, needing a signed-in person", () => {
    const block = defineSupportBlock();
    expect(block.id).toBe(SUPPORT_BLOCK_ID);
    expect(block.requires).toEqual(["account"]);
  });

  it("contributes Send feedback and Help to Settings, its routes and migration 0006", () => {
    const resolved = resolveBlocks([defineSupportBlock({ basePath: "/settings/support" })], [SUPPORT_BLOCK_ID, "account"]);
    expect(resolved.settings.map((r) => [r.id, r.section, r.title, r.href])).toEqual([
      ["support-send-feedback", "support", "Send feedback", "/settings/support/new"],
      ["support-help", "support", "Help", "/settings/support"],
    ]);
    expect(resolved.routes.map((r) => r.path)).toEqual(["/settings/support", "/settings/support/new", "/settings/support/[id]", "/settings/support/ideas", "/settings/support/shipped"]);
    expect(resolved.migrations).toEqual([
      { package: "@marktiderman/genesis-supabase", file: "migrations/0006_genesis_support.sql", test: "migrations/tests/0006_genesis_support.test.sql", feature: SUPPORT_BLOCK_ID },
    ]);
    expect(resolved.privacy[0]!.collects?.every((c) => c.tracking === false)).toBe(true);
  });

  it("names a migration and a test that the supabase package ships", () => {
    const root = join(__dirname, "../../../supabase");
    for (const m of defineSupportBlock().contributes!.migrations!) {
      expect(() => readFileSync(join(root, m.file))).not.toThrow();
      expect(() => readFileSync(join(root, m.test!))).not.toThrow();
    }
  });

  it("leaves the idea board and the Settings rows out when asked", () => {
    const c = defineSupportBlock({ ideas: false, settings: false }).contributes!;
    expect(c.settings).toEqual([]);
    expect(c.routes!.map((r) => r.path)).toEqual(["/support", "/support/new", "/support/[id]"]);
  });

  it("paths encode a report id", () => {
    expect(supportPaths("/help/").thread("a/b")).toBe("/help/a%2Fb");
  });
});

describe("copy", () => {
  it("merges overrides over the English and fills placeholders", () => {
    const copy = resolveSupportCopy({ feedback: { send: "Envoyer" }, status: { open: "Ouvert" } });
    expect(copy.feedback.send).toBe("Envoyer");
    expect(copy.feedback.title).toBe("Send feedback");
    expect(copy.status.open).toBe("Ouvert");
    expect(fill(copy.ideas.votes, { count: 3 })).toBe("3 votes");
  });
});
