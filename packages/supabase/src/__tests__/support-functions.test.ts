// @feat:support-feedback
import { describe, expect, it, vi } from "vitest";
import { handle as intake, bootConfig, type CallerClient } from "../../functions/genesis-support-intake/handler.ts";
import { handle as notify, issueBody, sameSecret, summarize, hmacHex } from "../../functions/genesis-support-notify/handler.ts";
import { handle as cleanup, type CleanupStore } from "../../functions/genesis-support-cleanup/handler.ts";

const env = (values: Record<string, string>) => (name: string) => values[name];

function caller(over: Partial<CallerClient> = {}): CallerClient & { inserted: Record<string, unknown>[] } {
  const inserted: Record<string, unknown>[] = [];
  return {
    inserted,
    insertReport: async (row) => {
      inserted.push(row);
      return { id: "r1", status: "open" };
    },
    listReports: async () => [{ id: "r1", type: "idea", title: "", message: "Export please", status: "open", route: "/a", created_at: "2026-10-24T09:00:00Z" }],
    ...over,
  };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://fn.test/genesis-support-intake", { method: "POST", headers: { authorization: "Bearer tok", ...headers }, body: JSON.stringify(body) });

describe("genesis-support-intake", () => {
  it("boots with a public projection only", async () => {
    const res = await intake(new Request("https://fn.test", { method: "GET" }), { env: env({ GENESIS_SUPPORT_APP_ID: "demo" }), clientFor: () => caller(), log: vi.fn() });
    expect(res.status).toBe(200);
    const boot = await res.json();
    expect(boot).toEqual(bootConfig(env({ GENESIS_SUPPORT_APP_ID: "demo" })));
    expect(boot).toMatchObject({ contractVersion: 1, identityMode: "genesis-session", project: { id: "demo" } });
  });

  it("submits as the caller, with the route cut to its path", async () => {
    const c = caller();
    const clientFor = vi.fn(() => c);
    const res = await intake(post({ op: "submit", body: "Broken", route: "/a?token=x", severity: "high" }), { env: env({}), clientFor, log: vi.fn() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reportId: "r1", findingId: "r1", status: "open" });
    expect(clientFor).toHaveBeenCalledWith("tok");
    expect(c.inserted[0]).toMatchObject({ type: "bug", message: "Broken", route: "/a", context: { severity: "high" } });
    expect(c.inserted[0]).not.toHaveProperty("user_id");
  });

  it("needs a signed-in caller", async () => {
    const req = new Request("https://fn.test", { method: "POST", body: JSON.stringify({ op: "list" }) });
    const res = await intake(req, { env: env({}), clientFor: () => caller(), log: vi.fn() });
    expect(res.status).toBe(401);
  });

  it("refuses an unknown op and an unknown key", async () => {
    const deps = { env: env({}), clientFor: () => caller(), log: vi.fn() };
    expect((await intake(post({ op: "findings.open" }), deps)).status).toBe(400);
    expect(await (await intake(post({ op: "submit", body: "x", reporterId: "someone" }), deps)).json()).toEqual({ error: "invalid_args", field: "reporterId" });
  });

  it("maps the database's rate limit to 429 and never echoes a database message", async () => {
    const log = vi.fn();
    const res = await intake(post({ op: "submit", body: "x" }), { env: env({}), clientFor: () => caller({ insertReport: async () => ({ error: "GS429" }) }), log });
    expect(res.status).toBe(429);
    const res2 = await intake(post({ op: "submit", body: "x" }), { env: env({}), clientFor: () => caller({ insertReport: async () => ({ error: "XX000" }) }), log });
    expect(await res2.json()).toEqual({ error: "submit_failed" });
  });

  it("lets only allow-listed browser origins in", async () => {
    const deps = { env: env({ GENESIS_SUPPORT_ORIGINS: "https://app.example" }), clientFor: () => caller(), log: vi.fn() };
    const ok = await intake(post({ op: "list" }, { origin: "https://app.example" }), deps);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://app.example");
    const bad = await intake(post({ op: "list" }, { origin: "https://evil.example" }), deps);
    expect(bad.status).toBe(403);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("lists the caller's reports in the contract's shape", async () => {
    const res = await intake(post({ op: "list" }), { env: env({}), clientFor: () => caller(), log: vi.fn() });
    expect(await res.json()).toEqual([{ id: "r1", type: "idea", title: "Export please", status: "open", route: "/a", createdAt: "2026-10-24T09:00:00Z", findingCount: 1 }]);
  });
});

const insert = { type: "INSERT", table: "support_reports", schema: "public", record: { id: "r1", type: "bug", title: "", message: "Save fails for jane@example.test", route: "/s", app_version: "1.0", platform: "ios", user_id: "u1", device: { m: 1 }, context: { secret: 1 } } };

describe("genesis-support-notify", () => {
  it("refuses a call without the webhook secret, and refuses everything when it isn't set", async () => {
    const deps = { env: env({ GENESIS_SUPPORT_WEBHOOK_SECRET: "s3cret" }), fetch: vi.fn(), log: vi.fn() };
    const req = new Request("https://fn.test", { method: "POST", headers: { "x-genesis-support-secret": "wrong" }, body: JSON.stringify(insert) });
    expect((await notify(req, deps)).status).toBe(401);
    const unset = await notify(new Request("https://fn.test", { method: "POST", body: "{}" }), { ...deps, env: env({}) });
    expect(unset.status).toBe(500);
  });

  it("opens a GitHub issue with the summary only: no person, device or context", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 201 }));
    const deps = { env: env({ GENESIS_SUPPORT_WEBHOOK_SECRET: "s3cret", GITHUB_TOKEN: "ghp", GITHUB_REPO: "acme/app" }), fetch: fetch as unknown as typeof globalThis.fetch, log: vi.fn() };
    const res = await notify(new Request("https://fn.test", { method: "POST", headers: { "x-genesis-support-secret": "s3cret" }, body: JSON.stringify(insert) }), deps);
    expect(await res.json()).toEqual({ ok: true, sent: ["github"], failed: [] });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/acme/app/issues");
    const body = String(init.body);
    expect(body).not.toContain("u1");
    expect(body).not.toContain("secret");
    expect(JSON.parse(body).labels).toEqual(["feedback", "bug"]);
  });

  it("signs the webhook body", async () => {
    const fetch = vi.fn(async () => new Response("ok"));
    const deps = { env: env({ GENESIS_SUPPORT_WEBHOOK_SECRET: "s", SUPPORT_WEBHOOK_URL: "https://hooks.example/x", SUPPORT_WEBHOOK_SIGNING_SECRET: "k" }), fetch: fetch as unknown as typeof globalThis.fetch, log: vi.fn() };
    await notify(new Request("https://fn.test", { method: "POST", headers: { "x-genesis-support-secret": "s" }, body: JSON.stringify(insert) }), deps);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-genesis-signature"]).toBe(`sha256=${await hmacHex("k", String(init.body))}`);
  });

  it("refuses a webhook URL that isn't https", async () => {
    const deps = { env: env({ GENESIS_SUPPORT_WEBHOOK_SECRET: "s", SUPPORT_WEBHOOK_URL: "http://hooks.example" }), fetch: vi.fn(), log: vi.fn() };
    const res = await notify(new Request("https://fn.test", { method: "POST", headers: { "x-genesis-support-secret": "s" }, body: JSON.stringify(insert) }), deps);
    expect(res.status).toBe(502);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("summarize keeps only the safe fields, and the issue fences the person's text", () => {
    const s = summarize({ ...insert.record, message: "````\n@everyone" });
    expect(Object.keys(s).sort()).toEqual(["appVersion", "createdAt", "id", "message", "platform", "route", "title", "type"]);
    expect(issueBody(s)).toContain("````\n``` `\n@everyone\n````");
    expect(sameSecret("a", "a")).toBe(true);
    expect(sameSecret("a", "ab")).toBe(false);
  });
});

describe("genesis-support-cleanup", () => {
  function store(over: Partial<CleanupStore> = {}): CleanupStore & { removed: string[][]; forgotten: number[][] } {
    const removed: string[][] = [];
    const forgotten: number[][] = [];
    return {
      removed,
      forgotten,
      queued: async () => [{ id: 1, bucket: "genesis-support", path: "u/r/a.png" }, { id: 2, bucket: "other", path: "x" }],
      orphans: async () => ["u/r2/b.png"],
      remove: async (_bucket, paths) => {
        removed.push(paths);
        return paths;
      },
      forget: async (ids) => {
        forgotten.push(ids);
      },
      ...over,
    };
  }

  it("removes queued and orphaned screenshots through the Storage API, only in its bucket", async () => {
    const s = store();
    const res = await cleanup(new Request("https://fn.test", { method: "POST", headers: { "x-genesis-support-secret": "c" } }), { env: env({ GENESIS_SUPPORT_CLEANUP_SECRET: "c" }), store: s, log: vi.fn() });
    expect(await res.json()).toEqual({ ok: true, purged: 1, orphans: 1 });
    expect(s.removed).toEqual([["u/r/a.png"], ["u/r2/b.png"]]);
    expect(s.forgotten).toEqual([[1]]);
  });

  it("keeps the queue when removal fails", async () => {
    const s = store({ remove: async () => Promise.reject(new Error("storage down")) });
    const res = await cleanup(new Request("https://fn.test", { method: "POST", headers: { "x-genesis-support-secret": "c" } }), { env: env({ GENESIS_SUPPORT_CLEANUP_SECRET: "c" }), store: s, log: vi.fn() });
    expect(res.status).toBe(500);
    expect(s.forgotten).toEqual([]);
  });

  it("needs its secret", async () => {
    const res = await cleanup(new Request("https://fn.test", { method: "POST" }), { env: env({ GENESIS_SUPPORT_CLEANUP_SECRET: "c" }), store: store(), log: vi.fn() });
    expect(res.status).toBe(401);
  });
});
