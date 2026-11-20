// @feat:setup-wizard
/**
 * The setup wizard: its server's checks (127.0.0.1, the token, Host, Origin, JSON), its host's
 * rule that every write is a plan applied by hash, that no secret's value ever leaves it, init
 * through the fix engine, and the headless run.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest, createServer } from "node:http";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { Finding } from "../src/doctor/types.js";
import type { ToolRunner } from "../src/exec/run.js";
import { appPackageManager, createWizardHost, type WizardHostOptions } from "../src/wizard/host.js";
import { checkInitChoices } from "../src/wizard/init.js";
import { runSetupHeadless } from "../src/wizard/headless.js";
import { checkApiRequest, newToken } from "../src/wizard/security.js";
import { startWizardServer, staticFile, type WizardServer } from "../src/wizard/server.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";
import { removeTempDir } from "./temp.js";

const SECRET = "sk_live_Wizard_Secret_Value_42";
const TOKEN = "A".repeat(43);
const SUPPORT = "@marktiderman/genesis-support";

const temps: string[] = [];
const servers: WizardServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});
afterAll(() => {
  for (const t of temps) removeTempDir(t);
  cleanupApps();
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "genesis-wizard-"));
  temps.push(dir);
  return dir;
}

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** A raw request, so a test can send any Host, Origin or header a browser would refuse to forge. */
function send(port: number, options: { method?: string; path?: string; headers?: Record<string, string>; body?: string }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, method: options.method ?? "GET", path: options.path ?? "/", headers: { host: `127.0.0.1:${port}`, ...options.headers }, setHost: false }, (res) => {
      let body = "";
      res.setEncoding("utf8").on("data", (d: string) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

/** Stream a body far past 1 MB until the server answers; report its status and whether it closed the connection. */
function oversized(port: number, headers: Record<string, string>, declare: boolean): Promise<{ status: number; closed: boolean }> {
  return new Promise((resolve) => {
    let status = 0;
    const req = httpRequest({ host: "127.0.0.1", port, method: "POST", path: "/api", headers: { host: `127.0.0.1:${port}`, ...headers, ...(declare ? { "content-length": String(50_000_000) } : {}) }, setHost: false }, (res) => {
      status = res.statusCode ?? 0;
      res.resume();
      res.on("close", () => resolve({ status, closed: true }));
    });
    req.on("error", () => resolve({ status, closed: true }));
    const chunk = "x".repeat(64 * 1024);
    let sent = 0;
    const pump = () => {
      while (!status && sent < 50_000_000) {
        sent += chunk.length;
        if (!req.write(chunk)) return void req.once("drain", pump);
      }
    };
    pump();
  });
}

const apiHeaders = (port: number, extra: Record<string, string> = {}) => ({ origin: `http://127.0.0.1:${port}`, "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...extra });
const api = (port: number, body: unknown, extra: Record<string, string> = {}) => send(port, { method: "POST", path: "/api", headers: apiHeaders(port, extra), body: JSON.stringify(body) });

async function start(handle: (body: unknown) => Promise<{ status: number; body: unknown }> = async () => ({ status: 200, body: { ok: true } }), options: { staticDir?: string; idleMs?: number; log?: (l: string) => void } = {}) {
  const server = await startWizardServer({ api: { handle }, token: TOKEN, port: 0, attempts: 1, ...options });
  servers.push(server);
  return server;
}

describe("the wizard's server", () => {
  it("listens on 127.0.0.1 only, and its link carries a one-time launch code, never the token", async () => {
    const server = await start();
    expect(server.origin).toBe(`http://127.0.0.1:${server.port}`);
    const url = new URL(server.url);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname + url.search).toBe("/");
    expect(server.url).not.toContain(TOKEN);
    expect(new URLSearchParams(url.hash.slice(1)).get("c")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Not reachable on another address of this machine.
    await expect(new Promise((resolve, reject) => httpRequest({ host: "::1", port: server.port, path: "/" }, resolve).on("error", reject).end())).rejects.toThrow();
  });

  it("makes a fresh 32-byte token each run", () => {
    const a = newToken();
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(newToken()).not.toBe(a);
  });

  it("refuses an API request without the token, or with another one", async () => {
    const seen: unknown[] = [];
    const server = await start(async (b) => (seen.push(b), { status: 200, body: { ok: true } }));
    const body = JSON.stringify({ v: 1, op: "state" });
    const none = await send(server.port, { method: "POST", path: "/api", headers: { origin: server.origin, "content-type": "application/json" }, body });
    expect(none.status).toBe(401);
    const wrong = await send(server.port, { method: "POST", path: "/api", headers: apiHeaders(server.port, { authorization: `Bearer ${"B".repeat(43)}` }), body });
    expect(wrong.status).toBe(401);
    const short = await send(server.port, { method: "POST", path: "/api", headers: apiHeaders(server.port, { authorization: `Bearer ${TOKEN.slice(1)}` }), body });
    expect(short.status).toBe(401);
    const ok = await api(server.port, { v: 1, op: "state" });
    expect(ok.status).toBe(200);
    expect(seen).toHaveLength(1);
    // The events stream needs it too.
    expect((await send(server.port, { path: "/events" })).status).toBe(401);
  });

  it("refuses another Host on every path (DNS rebinding), even with the token", async () => {
    const server = await start();
    for (const p of ["/", "/api", "/events", "/assets/x.js"]) {
      const r = await send(server.port, { method: p === "/api" ? "POST" : "GET", path: p, headers: { ...apiHeaders(server.port), host: `evil.test:${server.port}` }, ...(p === "/api" ? { body: "{}" } : {}) });
      expect(r.status, p).toBe(403);
    }
    expect((await send(server.port, { headers: { host: "127.0.0.1:1" } })).status).toBe(403);
    // Not localhost either: it may resolve to ::1, where the server doesn't listen.
    expect((await send(server.port, { headers: { host: `localhost:${server.port}` } })).status).toBe(403);
    expect((await send(server.port, {})).status).toBe(200);
  });

  it("refuses a write without the server's own Origin, and any cross-site fetch", async () => {
    const server = await start();
    const body = { v: 1, op: "state" };
    const { origin: _origin, ...noOrigin } = apiHeaders(server.port);
    expect((await send(server.port, { method: "POST", path: "/api", headers: noOrigin, body: JSON.stringify(body) })).status).toBe(403);
    expect((await api(server.port, body, { origin: "http://evil.test" })).status).toBe(403);
    expect((await api(server.port, body, { origin: `http://127.0.0.1:${server.port + 1}` })).status).toBe(403);
    expect((await api(server.port, body, { origin: "null" })).status).toBe(403);
    expect((await api(server.port, body, { origin: `http://localhost:${server.port}` })).status).toBe(403);
    expect((await api(server.port, body, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await send(server.port, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await api(server.port, body, { "sec-fetch-site": "same-origin" })).status).toBe(200);
  });

  it("takes JSON only, of a bounded size", async () => {
    const server = await start();
    expect((await api(server.port, { v: 1 }, { "content-type": "text/plain" })).status).toBe(415);
    expect((await api(server.port, { v: 1 }, { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await send(server.port, { method: "POST", path: "/api", headers: apiHeaders(server.port), body: "{not json" })).status).toBe(400);
    // Past 1 MB it answers 413 and drops the connection, without reading the rest: declared, or streamed.
    expect(await oversized(server.port, apiHeaders(server.port), true)).toEqual({ status: 413, closed: true });
    expect(await oversized(server.port, apiHeaders(server.port), false)).toEqual({ status: 413, closed: true });
    expect((await send(server.port, { method: "GET", path: "/api", headers: apiHeaders(server.port) })).status).toBe(405);
  });

  it("sends no CORS header and a strict CSP on every response", async () => {
    const server = await start();
    const replies = [await send(server.port, {}), await api(server.port, { v: 1 }), await api(server.port, { v: 1 }, { origin: "http://evil.test" }), await send(server.port, { method: "OPTIONS", path: "/api", headers: { origin: "http://evil.test" } })];
    for (const r of replies) {
      expect(Object.keys(r.headers).filter((h) => h.startsWith("access-control-"))).toEqual([]);
      const csp = String(r.headers["content-security-policy"]);
      expect(csp).toContain("default-src 'self'");
      // Inline styles for the dialogs' positioning, and nothing more: no inline or remote script.
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).not.toMatch(/script-src|unsafe-eval|\*/);
      expect(r.headers["x-frame-options"]).toBe("DENY");
    }
  });

  it("serves the page without the token, never a file outside it or a dot file", async () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, "assets"));
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><p>wizard</p>");
    writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)");
    writeFileSync(path.join(dir, ".env"), "SECRET=1");
    const server = await start(undefined, { staticDir: dir });
    const page = await send(server.port, {});
    expect(page.status).toBe(200);
    expect(page.body).toContain("wizard");
    expect(page.body).not.toContain(TOKEN);
    expect((await send(server.port, { path: "/assets/app.js" })).headers["content-type"]).toMatch(/javascript/);
    for (const p of ["/.env", "/../package.json", "/%2e%2e/package.json", "/assets/..%2f..%2fpackage.json"]) expect((await send(server.port, { path: p })).status, p).toBe(404);
    expect(staticFile(dir, "/..\\x")).toBeNull();
  });

  it("tries the next port when one is taken", async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", r));
    const taken = (blocker.address() as { port: number }).port;
    try {
      const server = await startWizardServer({ api: { handle: async () => ({ status: 200, body: {} }) }, port: taken, attempts: 5 });
      servers.push(server);
      expect(server.port).toBeGreaterThan(taken);
    } finally {
      blocker.close();
    }
  });

  it("stops itself when idle", async () => {
    const server = await start(undefined, { idleMs: 50 });
    expect(await server.closed).toBe("idle");
  });

  it("checkApiRequest runs every check in order", () => {
    const h = { host: "127.0.0.1:4400", origin: "http://127.0.0.1:4400", authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
    expect(checkApiRequest("POST", h, 4400, TOKEN)).toBeNull();
    expect(checkApiRequest("POST", { ...h, host: "localhost:4400" }, 4400, TOKEN)?.status).toBe(403);
    expect(checkApiRequest("POST", { ...h, host: "localhost:4400", origin: "http://localhost:4400" }, 4400, TOKEN)?.status).toBe(403);
  });

  it("swaps a launch code for the token once; a second use, a made-up code or a foreign origin is refused", async () => {
    const server = await start();
    const code = new URLSearchParams(new URL(server.url).hash.slice(1)).get("c")!;
    const swap = (c: string, headers: Record<string, string> = {}) => send(server.port, { method: "POST", path: "/session", headers: { origin: server.origin, "content-type": "application/json", ...headers }, body: JSON.stringify({ code: c }) });
    // From another site, the code isn't spent.
    expect((await swap(code, { origin: "http://evil.test" })).status).toBe(403);
    expect((await swap(code, { "content-type": "text/plain" })).status).toBe(415);
    const first = await swap(code);
    expect(first.status).toBe(200);
    expect(JSON.parse(first.body)).toEqual({ token: TOKEN });
    const second = await swap(code);
    expect(second.status).toBe(401);
    expect(second.body).not.toContain(TOKEN);
    expect((await swap("x".repeat(43))).status).toBe(401);
    // Each link is its own code: the terminal's still works after the browser's was used.
    const other = new URLSearchParams(new URL(server.launchUrl()).hash.slice(1)).get("c")!;
    expect(other).not.toBe(code);
    expect((await swap(other)).status).toBe(200);
    expect((await swap(other)).status).toBe(401);
  });

  it("refuses an expired launch code", async () => {
    const server = await start();
    const code = new URLSearchParams(new URL(server.url).hash.slice(1)).get("c")!;
    const now = Date.now;
    Date.now = () => now() + 11 * 60_000;
    try {
      expect((await send(server.port, { method: "POST", path: "/session", headers: { origin: server.origin, "content-type": "application/json" }, body: JSON.stringify({ code }) })).status).toBe(401);
    } finally {
      Date.now = now;
    }
  });

  it("never names the token in the browser launcher's arguments", async () => {
    const spawned: string[][] = [];
    const { launchArgs } = await import("../src/wizard/command.js");
    const server = await start();
    spawned.push(launchArgs(server.url, "linux"), launchArgs(server.url, "darwin"), launchArgs(server.url, "win32"));
    for (const argv of spawned) expect(argv.join(" ")).not.toContain(TOKEN);
  });
});

const settings = {
  namespace: "support",
  keys: {
    githubRepo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN", setup: "github.issues", summary: "reports become GitHub issues" },
    aiAnswers: { type: "boolean", default: true, needs: "secret:AI_PROVIDER_KEY" },
    inbox: { type: "boolean", default: true },
  },
};

function wizardApp(config: Record<string, unknown> = {}): string {
  return makeApp(null, {
    "package.json": JSON.stringify({ name: "sample-app", dependencies: { [SUPPORT]: "^0.12.0" } }),
    [`node_modules/${SUPPORT}/package.json`]: JSON.stringify({ name: SUPPORT, version: "0.12.0", genesis: { settings } }),
    "genesis.config.json": `${JSON.stringify({ doctor: { rules: { "genesis-behind": "off" } }, ...config }, null, 2)}\n`,
    "supabase/.temp/project-ref": "abcdefghijklmnopqrst\n",
  });
}

const missingKey: Finding = { rule: "secret-missing", level: "warn", file: "supabase secrets", line: 0, subject: "AI_PROVIDER_KEY", message: "AI_PROVIDER_KEY isn't set in supabase secrets; settings.support.aiAnswers needs it", fix: { id: "secrets.set", kind: "guided", title: "set the missing secrets", command: "genesis fix secrets.set" } };

function host(root: string, extra: Partial<WizardHostOptions> = {}, findings: () => Finding[] = () => []) {
  const events: Array<{ event: string; data: unknown }> = [];
  const h = createWizardHost({ mode: "setup", root, deps: { doctor: async () => ({ findings: findings() }) }, publish: (event, data) => events.push({ event, data }), ...extra });
  const call = async (op: string, body: Record<string, unknown> = {}) => h.handle({ v: 1, op, ...body });
  return { h, call, events };
}

describe("the wizard's host: every write is a plan applied by its hash", () => {
  it("answers state with the doctor's findings, the catalogue and the CLI's capabilities", async () => {
    const root = wizardApp();
    const { call } = host(root, {}, () => [missingKey]);
    const r = await call("state");
    expect(r.status).toBe(200);
    const state = r.body as { app: { name: string; host: string }; capabilities: { writeFiles: boolean; writeDatabase: boolean }; findings: Array<{ rule: string; fix?: { id: string } }>; catalogue: unknown[]; secrets: Array<{ name: string; status: string }> };
    expect(state.app).toMatchObject({ name: "sample-app", host: "cli" });
    expect(state.capabilities).toMatchObject({ writeFiles: true, writeDatabase: false });
    expect(state.findings).toEqual([expect.objectContaining({ rule: "secret-missing", fix: expect.objectContaining({ id: "secrets.set" }) })]);
    expect(state.catalogue).toHaveLength(3);
    expect(state.secrets).toContainEqual(expect.objectContaining({ name: "AI_PROVIDER_KEY", status: "missing" }));
  });

  it("refuses the protocol's direct writes, another version, and an unknown op", async () => {
    const { call, h } = host(wizardApp());
    expect((await call("setValue", { key: "support.inbox", value: false, layer: "file" })).status).toBe(501);
    expect((await call("clearValue", { key: "support.inbox", layer: "file" })).status).toBe(501);
    expect((await call("setSecret", { name: "X", store: "vault", value: SECRET })).body).toMatchObject({ error: { code: "unsupported" } });
    expect((await h.handle({ v: 2, op: "state" })).body).toMatchObject({ error: { code: "version" } });
    expect((await call("nope")).body).toMatchObject({ error: { code: "unsupported" } });
  });

  it("plans a setting, writes nothing, then applies only that plan's hash", async () => {
    const root = wizardApp();
    const before = readFileSync(path.join(root, "genesis.config.json"), "utf8");
    const { call } = host(root);
    const planned = (await call("settings.plan", { key: "support.inbox", value: false })).body as { plan: { fixId: string; hash: string; files: Array<{ path: string; diff?: string }> } };
    expect(planned.plan.files.map((f) => f.path)).toEqual(["genesis.config.json"]);
    expect(planned.plan.files[0]!.diff).toContain('"support.inbox": false');
    expect(readFileSync(path.join(root, "genesis.config.json"), "utf8")).toBe(before);
    // A hash this host didn't make is refused: the person approves only what they were shown.
    expect((await call("apply", { fixId: planned.plan.fixId, expect: "0".repeat(64) })).status).toBe(409);
    const applied = await call("apply", { fixId: planned.plan.fixId, expect: planned.plan.hash });
    expect(applied.body).toMatchObject({ result: { verified: true } });
    expect(JSON.parse(readFileSync(path.join(root, "genesis.config.json"), "utf8")).settings).toEqual({ "support.inbox": false });
    // Once applied, the same hash can't be applied again.
    expect((await call("apply", { fixId: planned.plan.fixId, expect: planned.plan.hash })).status).toBe(409);
  });

  it("refuses a plan whose file changed after it was shown, writing nothing", async () => {
    const root = wizardApp();
    const { call } = host(root);
    const { plan } = (await call("settings.plan", { key: "support.inbox", value: false })).body as { plan: { fixId: string; hash: string } };
    writeFileSync(path.join(root, "genesis.config.json"), `${JSON.stringify({ preset: "min" }, null, 2)}\n`);
    const r = await call("apply", { fixId: plan.fixId, expect: plan.hash });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: { code: "stale_plan" } });
    // Worded for the page, not the terminal.
    const msg = (r.body as { error: { message: string } }).error.message;
    expect(msg).toContain("Plan it again");
    expect(msg).not.toMatch(/genesis fix|--plan/);
    expect(JSON.parse(readFileSync(path.join(root, "genesis.config.json"), "utf8"))).toEqual({ preset: "min" });
  });

  it("refuses a value that doesn't fit, and clears a key through a plan", async () => {
    const root = wizardApp({ settings: { "support.inbox": false } });
    const { call } = host(root);
    expect((await call("settings.plan", { key: "support.inbox", value: "yes" })).body).toMatchObject({ error: { code: "bad_request" } });
    expect((await call("settings.plan", { key: "support.inbox", value: true, layer: "database" })).status).toBe(501);
    const { plan } = (await call("settings.plan", { key: "support.inbox", clear: true })).body as { plan: { fixId: string; hash: string } };
    expect((await call("apply", { fixId: plan.fixId, expect: plan.hash })).body).toMatchObject({ result: { verified: true } });
    expect(JSON.parse(readFileSync(path.join(root, "genesis.config.json"), "utf8")).settings).toBeUndefined();
  });

  it("lists the guided setup steps", async () => {
    const { call } = host(wizardApp());
    const r = (await call("step.list")).body as { steps: Array<{ id: string; done: boolean; secrets: Array<{ name: string }> }> };
    expect(r.steps).toEqual([expect.objectContaining({ id: "github.issues", done: false, secrets: [{ name: "GITHUB_TOKEN", store: "edge" }], command: "genesis setup --step github.issues" })]);
    expect((await call("step.start", { id: "github.issues" })).status).toBe(501);
  });
});

describe("the wizard's host never lets a secret's value out", () => {
  /** A supabase stand-in that echoes what it was given on stdin and fails, the worst case. */
  const seen: Array<{ args: readonly string[]; stdin?: string }> = [];
  const echoingRun: ToolRunner = async (_tool, args, options) => {
    seen.push({ args, ...(options.stdin !== undefined ? { stdin: options.stdin } : {}) });
    options.onOutput?.(`received ${options.stdin ?? ""}\n`, "stdout");
    return { code: 1, stdout: `received ${options.stdin ?? ""}`, stderr: `error: bad value ${options.stdin ?? ""}` };
  };

  it("sends the value on stdin only, and redacts it from the answer, the events and the log", async () => {
    seen.length = 0;
    const root = wizardApp();
    const logs: string[] = [];
    const events: Array<{ event: string; data: unknown }> = [];
    const h = createWizardHost({ mode: "setup", root, deps: { doctor: async () => ({ findings: [missingKey] }), run: echoingRun }, publish: (event, data) => events.push({ event, data }) });
    const server = await startWizardServer({ api: h, token: TOKEN, port: 0, attempts: 1, log: (l) => logs.push(l) });
    servers.push(server);

    const planned = JSON.parse((await api(server.port, { v: 1, op: "plan", fixId: "secrets.set", subject: "AI_PROVIDER_KEY" })).body) as { plan: { fixId: string; hash: string; secrets: string[] } };
    expect(planned.plan.secrets).toEqual(["AI_PROVIDER_KEY"]);
    // Without the value it is refused, and nothing ran.
    expect((await api(server.port, { v: 1, op: "apply", fixId: "secrets.set", expect: planned.plan.hash })).status).toBe(400);
    // A value for a secret the plan doesn't use is refused too.
    expect((await api(server.port, { v: 1, op: "apply", fixId: "secrets.set", expect: planned.plan.hash, secrets: { AI_PROVIDER_KEY: SECRET, OTHER_KEY: SECRET } })).status).toBe(400);
    expect(seen).toEqual([]);

    const applied = await api(server.port, { v: 1, op: "apply", fixId: "secrets.set", expect: planned.plan.hash, secrets: { AI_PROVIDER_KEY: SECRET } });
    expect(applied.status).toBe(500);
    expect(applied.body).toContain("[redacted]");
    expect(applied.body).not.toContain(SECRET);
    // The tool got it on stdin, never in argv.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.stdin).toContain(SECRET);
    expect(seen[0]!.args.join(" ")).not.toContain(SECRET);
    expect(JSON.stringify(events)).not.toContain(SECRET);
    expect(events.some((e) => e.event === "log" && JSON.stringify(e.data).includes("[redacted]"))).toBe(true);
    expect(logs.join("\n")).not.toContain(SECRET);
    // And nothing after it holds it either.
    const state = await api(server.port, { v: 1, op: "state" });
    expect(state.body).not.toContain(SECRET);
    expect((await send(server.port, {})).body).not.toContain(SECRET);
  });

  it("redacts a value from a successful apply's message", async () => {
    seen.length = 0;
    const root = wizardApp();
    const ok: ToolRunner = async (_t, _a, o) => ({ code: 0, stdout: `stored ${o.stdin ?? ""}`, stderr: "" });
    const { call } = host(root, { deps: { doctor: async () => ({ findings: [missingKey] }), run: ok } });
    const { plan } = (await call("plan", { fixId: "secrets.set" })).body as { plan: { fixId: string; hash: string } };
    const r = await call("apply", { fixId: plan.fixId, expect: plan.hash, secrets: { AI_PROVIDER_KEY: SECRET } });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain(SECRET);
  });
});

describe("genesis init from the wizard", () => {
  it("plans the whole app, writes nothing, then makes it through the engine on the chosen preset", async () => {
    const root = tempDir();
    const { h, call } = host(root, { mode: "init" });
    const info = (await call("wizard.info")).body as { mode: string; switches: Record<string, boolean> };
    expect(info.mode).toBe("init");
    expect(Object.keys(info.switches).length).toBeGreaterThan(3);
    expect((await call("state")).status).toBe(501);
    expect((await call("init.plan", { app: { slug: "sample-app", folder: "../escape" } })).body).toMatchObject({ error: { code: "bad_request" } });
    expect((await call("init.plan", { app: { slug: "sample-app", preset: "huge" } })).body).toMatchObject({ error: { code: "bad_request" } });
    const planned = (await call("init.plan", { app: { slug: "sample-app", preset: "standard" } })).body as { plan: { fixId: string; hash: string; files: Array<{ path: string; created?: boolean }> } };
    expect(planned.plan.files.length).toBeGreaterThan(20);
    expect(planned.plan.files.every((f) => f.path.startsWith("sample-app/") && f.created)).toBe(true);
    expect(planned.plan.files.map((f) => f.path)).toContain("sample-app/genesis.lock.json");
    expect(existsSync(path.join(root, "sample-app"))).toBe(false);
    const applied = await call("apply", { fixId: planned.plan.fixId, expect: planned.plan.hash });
    expect(applied.body).toMatchObject({ result: { verified: true } });
    expect(JSON.parse(readFileSync(path.join(root, "sample-app", "genesis.config.json"), "utf8")).preset).toBe("standard");
    expect(h.mode()).toBe("setup");
    expect(h.root()).toBe(path.join(root, "sample-app"));
    // The new app's packages aren't installed: the wizard plans the install.
    expect((await call("wizard.info")).body).toMatchObject({ mode: "setup", needsInstall: true });
    const install = (await call("install.plan")).body as { plan: { commands: Array<{ tool: string; args: string[] }> } };
    expect(install.plan.commands).toEqual([expect.objectContaining({ tool: "pnpm", args: ["install"] })]);
  });
});

describe("the init choices", () => {
  it("are checked before anything touches the disk, and a bad one is a 400", async () => {
    // The root doesn't exist: a choice that reached the disk would fail differently.
    const { call } = host(path.join(tempDir(), "missing", "deeper"), { mode: "init" });
    for (const app of [
      { slug: "Bad Slug" },
      { slug: "a" },
      { slug: "sample-app", folder: ".git" },
      { slug: "sample-app", folder: "apps/.hidden" },
      { slug: "sample-app", folder: "apps/./x" },
      { slug: "sample-app", folder: "/abs" },
      { slug: "sample-app", bundleId: "not a bundle" },
      { slug: "sample-app", scheme: "Bad Scheme" },
      { slug: "sample-app", displayName: 'say "hi"' },
      { slug: "sample-app", without: ["../x"] },
    ]) {
      const r = await call("init.plan", { app });
      expect(r.status, JSON.stringify(app)).toBe(400);
      expect(r.body).toMatchObject({ error: { code: "bad_request" } });
    }
    expect(checkInitChoices({ slug: "sample-app", folder: "apps/sample.app", bundleId: "com.acme.app", scheme: "acme" })).toMatchObject({ folder: "apps/sample.app" });
  });

  it("a folder that isn't empty is a 400 too", async () => {
    const root = tempDir();
    mkdirSync(path.join(root, "sample-app"));
    writeFileSync(path.join(root, "sample-app", "keep.txt"), "x");
    const { call } = host(root, { mode: "init" });
    expect((await call("init.plan", { app: { slug: "sample-app" } })).status).toBe(400);
  });

  it("start from genesis init --preset and --without", async () => {
    const { call } = host(tempDir(), { mode: "init", initial: { preset: "standard", without: ["chat"] } });
    expect((await call("wizard.info")).body).toMatchObject({ initial: { preset: "standard", without: ["chat"] } });
  });
});

describe("the install's package manager", () => {
  it("is package.json's packageManager, else a lockfile in the app or its workspace root, never another parent's", () => {
    const outer = tempDir();
    // A lockfile in an unrelated folder above the app: ignored.
    writeFileSync(path.join(outer, "yarn.lock"), "");
    const app = path.join(outer, "app");
    mkdirSync(app);
    writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "app" }));
    expect(appPackageManager(app)).toBe("npm");
    writeFileSync(path.join(app, "pnpm-workspace.yaml"), "");
    expect(appPackageManager(app)).toBe("pnpm");
    writeFileSync(path.join(app, "bun.lock"), "");
    expect(appPackageManager(app)).toBe("bun");
    writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "app", packageManager: "yarn@4.1.0" }));
    expect(appPackageManager(app)).toBe("yarn");

    // A member of a workspace: the workspace root's lockfile and packageManager count.
    const ws = tempDir();
    writeFileSync(path.join(ws, "package.json"), JSON.stringify({ name: "ws", workspaces: ["apps/*"] }));
    writeFileSync(path.join(ws, "yarn.lock"), "");
    const member = path.join(ws, "apps", "one");
    mkdirSync(member, { recursive: true });
    writeFileSync(path.join(member, "package.json"), JSON.stringify({ name: "one" }));
    expect(appPackageManager(member)).toBe("yarn");
    writeFileSync(path.join(ws, "package.json"), JSON.stringify({ name: "ws", workspaces: ["apps/*"], packageManager: "pnpm@11.0.0" }));
    expect(appPackageManager(member)).toBe("pnpm");
  });
});

describe("genesis setup --yes", () => {
  it("applies the automatic fixes, sets the preset, and prints the dormant checklist", async () => {
    const root = wizardApp({ settings: { "support.bogus": true } });
    const out: string[] = [];
    const err: string[] = [];
    const code = await runSetupHeadless({ root, preset: "min", apply: true, out: (l) => out.push(l), err: (l) => err.push(l) });
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const config = JSON.parse(readFileSync(path.join(root, "genesis.config.json"), "utf8"));
    expect(config.preset).toBe("min");
    expect(config.settings).toBeUndefined();
    const text = out.join("\n");
    expect(text).toContain("✔ settings.preset");
    expect(text).toContain("✔ settings.remove-unknown");
    expect(text).toContain("genesis setup --step github.issues");
  });

  it("without --yes, prints the plans, applies nothing and exits 1; --preset doesn't imply --yes", async () => {
    const root = wizardApp({ settings: { "support.bogus": true } });
    const before = readFileSync(path.join(root, "genesis.config.json"), "utf8");
    const out: string[] = [];
    const err: string[] = [];
    expect(await runSetupHeadless({ root, preset: "min", out: (l) => out.push(l), err: (l) => err.push(l) })).toBe(1);
    expect(readFileSync(path.join(root, "genesis.config.json"), "utf8")).toBe(before);
    expect(out.join("\n")).toMatch(/settings\.preset \(not applied\)[\s\S]*settings\.remove-unknown \(not applied\)/);
    expect(out.join("\n")).toContain("genesis setup --step github.issues");
    expect(err.join("\n")).toContain("Nothing was applied: 2 plans above. Run it again with --yes");
  });

  it("without --yes and nothing to apply, exits 0", async () => {
    const root = wizardApp();
    const out: string[] = [];
    expect(await runSetupHeadless({ root, out: (l) => out.push(l), err: (l) => out.push(l) })).toBe(0);
  });

  it("refuses an unknown preset and says when a step is set up", async () => {
    const root = wizardApp({ settings: { "support.githubRepo": "acme/sample-app" } });
    const out: string[] = [];
    const err: string[] = [];
    expect(await runSetupHeadless({ root, preset: "huge", out: (l) => out.push(l), err: (l) => err.push(l) })).toBe(1);
    expect(await runSetupHeadless({ root, step: "github.issues", out: (l) => out.push(l), err: (l) => err.push(l) })).toBe(0);
    expect(out.join("\n")).toContain("github.issues is set up");
    expect(await runSetupHeadless({ root, step: "nope", out: (l) => out.push(l), err: (l) => err.push(l) })).toBe(1);
  });
});
