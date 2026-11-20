// @feat:genesis-mcp
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema, McpError, type ElicitRequest, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { createGenesisMcpServer, type GenesisMcpOptions } from "../src/mcp/server.js";
import { GENESIS_MCP_ENTRY, mcpJsonEdit, mcpJsonState, McpJsonError, writeMcpJson } from "../src/mcp/config.js";
import { boundedJson, scrub, scrubStream, secretValues, secretVault, showInvisible } from "../src/mcp/bounds.js";
import { slimFinding } from "../src/mcp/doctor.js";
import { guardArgs, guardChildStdio, safeStdio } from "../src/mcp/stdio.js";
import { removeTempDir } from "./temp.js";
import { changedLines, toMcpError } from "../src/mcp/server.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

const SECRET = "ghp_TopSecretValue_9f8e7d6c5b4a";
const SUPPORT = "@marktiderman/genesis-support";
const settings = {
  namespace: "support",
  keys: {
    inbox: { type: "boolean", default: true, summary: "The support inbox." },
    agentDesk: { type: "boolean", default: { max: true, standard: true, min: false }, requires: ["support.inbox"] },
    dumpRetentionDays: { type: "number", default: 90, min: 7, max: 365 },
    issues: { type: "boolean", default: false, needs: "secret:SUPPORT_GITHUB_TOKEN", store: "server-env" },
    triage: { type: "boolean", default: false, needs: "secret:SUPPORT_AI_KEY" },
    label: { type: "string", default: null },
  },
};

/** An app with a removed scope name (auto fix: codemod.scope-names) and the support settings. */
function app(extra: Record<string, string> = {}): string {
  return makeApp(null, {
    "package.json": JSON.stringify({ name: "app", dependencies: { [SUPPORT]: "^0.12.0" } }),
    [`node_modules/${SUPPORT}/package.json`]: JSON.stringify({ name: SUPPORT, version: "0.12.0", genesis: { settings } }),
    "genesis.config.json": `${JSON.stringify({ preset: "standard", settings: { "support.dumpRetentionDays": 30, "support.inbox": { value: true, locked: true } } }, null, 4)}\n`,
    // The secret's value sits in a source file: a plan that shows the file must not show it.
    "src/screen.tsx": `import { NativeResourceView } from "@marktiderman/genesis-ui-native";\n// token: ${SECRET}\nexport const A = () => <NativeResourceView view={v} practiceTimeZone={zone} />;\n`,
    ...extra,
  });
}

type Answer = (request: ElicitRequest) => ElicitResult;

/** A client connected in memory; with `answer`, it supports elicitation and answers with it. Every text it receives is kept. */
async function connect(root: string, options: { answer?: Answer; server?: Partial<GenesisMcpOptions> } = {}) {
  const server = createGenesisMcpServer({ root, env: { SUPPORT_GITHUB_TOKEN: SECRET, PATH: "/usr/bin" }, ...options.server });
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: options.answer ? { elicitation: { form: {} } } : {} });
  const asked: ElicitRequest[] = [];
  if (options.answer) {
    const answer = options.answer;
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      asked.push(request);
      return answer(request);
    });
  }
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const seen: string[] = [];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    try {
      const result = await client.callTool({ name, arguments: args });
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      seen.push(text);
      return JSON.parse(text) as Record<string, any>;
    } catch (err) {
      seen.push((err as Error).message);
      throw err;
    }
  };
  return { client, server, call, asked, seen };
}

const read = (root: string, file: string) => readFileSync(path.join(root, file), "utf8");

afterEach(() => cleanupApps());

describe("genesis mcp: tools", () => {
  it("lists every tool with a JSON schema, read-only ones marked", async () => {
    const { client } = await connect(app());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["catalog_search", "doctor_explain", "doctor_run", "fix_apply", "fix_plan", "settings_catalogue", "settings_get", "settings_propose", "setup_steps", "upgrades_status"]);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.annotations?.readOnlyHint).toBe(t.name !== "fix_apply");
    }
    expect(tools.find((t) => t.name === "fix_apply")?.inputSchema.required).toEqual(["fixId", "hash"]);
    expect(tools.find((t) => t.name === "fix_plan")?.annotations?.openWorldHint).toBe(true);
  });

  it("leaves fix_apply out of a read-only server", async () => {
    const { client } = await connect(app(), { server: { readOnly: true } });
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain("fix_apply");
  });

  it("doctor_run returns the findings with their fixes, filtered by rule", async () => {
    const { call } = await connect(app());
    const all = await call("doctor_run");
    expect(all.findings.some((f: { rule: string }) => f.rule === "removed-scope-name")).toBe(true);
    const only = await call("doctor_run", { rules: ["removed-scope-name"] });
    expect(only.total).toBe(1);
    expect(only.findings[0]).toMatchObject({ rule: "removed-scope-name", file: "src/screen.tsx", fix: { id: "codemod.scope-names", kind: "auto" } });
    expect(only.fixes).toEqual([{ id: "codemod.scope-names", findings: 1 }]);
  });

  it("doctor_explain says what a built-in rule checks and which fix covers it", async () => {
    const { call } = await connect(app());
    const scope = await call("doctor_explain", { rule: "removed-scope-name" });
    expect(scope).toMatchObject({ rule: "removed-scope-name", source: "builtin", level: "error" });
    expect(scope.description).toMatch(/practice/);
    expect(scope.fixes).toEqual([expect.objectContaining({ id: "codemod.scope-names", kind: "auto", command: "genesis fix codemod.scope-names" })]);
    expect((await call("doctor_explain", { rule: "raw-tag" })).fixes).toEqual([expect.objectContaining({ id: "manual:raw-tag", kind: "manual" })]);
    await expect(call("doctor_explain", { rule: "--strict" })).rejects.toThrow(/no rule "--strict"/);
  });

  it("settings_catalogue lists the declared keys, a secret by name only", async () => {
    const { call } = await connect(app());
    const all = await call("settings_catalogue");
    const issues = all.keys.find((k: { key: string }) => k.key === "support.issues");
    expect(issues).toMatchObject({ package: SUPPORT, type: "boolean", needsSecret: { name: "SUPPORT_GITHUB_TOKEN", store: "server-env" } });
    expect(all.keys.find((k: { key: string }) => k.key === "support.agentDesk").defaults).toEqual({ max: true, standard: true, min: false });
    expect((await call("settings_catalogue", { package: "support" })).keys).toHaveLength(6);
    expect((await call("settings_catalogue", { package: SUPPORT })).keys).toHaveLength(6);
    await expect(call("settings_catalogue", { package: "nope" })).rejects.toThrow(/no installed package/);
  });

  it("settings_get gives values with their sources and secrets as set, missing or unknown", async () => {
    const { call } = await connect(app());
    const got = await call("settings_get");
    const value = (key: string) => got.values.find((v: { key: string }) => v.key === key);
    expect(got.preset).toBe("standard");
    expect(value("support.dumpRetentionDays")).toMatchObject({ value: 30, source: { layer: "file" } });
    expect(value("support.inbox")).toMatchObject({ value: true, source: { layer: "file", lockedBy: "file" } });
    expect(value("support.agentDesk")).toMatchObject({ value: true, source: { layer: "preset" } });
    expect(got.secrets).toEqual([
      { name: "SUPPORT_GITHUB_TOKEN", store: "server-env", keys: ["support.issues"], status: "set" },
      { name: "SUPPORT_AI_KEY", store: "edge", keys: ["support.triage"], status: "unknown" },
    ]);
    const some = await call("settings_get", { keys: ["support.inbox", "support.nope"] });
    expect(some.values.map((v: { key: string }) => v.key)).toEqual(["support.inbox"]);
    expect(some.unknownKeys).toEqual(["support.nope"]);
  });

  it("upgrades_status compares the installed release with npm's latest", async () => {
    const root = app({
      "node_modules/@marktiderman/genesis/package.json": JSON.stringify({ name: "@marktiderman/genesis", version: "2.3.0" }),
      "node_modules/@marktiderman/genesis/dist/versions.json": JSON.stringify({ version: "2.3.0", packages: {} }),
    });
    const registry = { latest: () => "2.5.0", times: () => ({ "2.4.0": "2026-11-01T00:00:00.000Z" }), registry: null, fetch: (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch };
    const { call } = await connect(root, { server: { network: true, deps: { registry } } });
    const status = await call("upgrades_status");
    expect(status).toMatchObject({ installed: "2.3.0", latest: "2.5.0", behind: { kind: "minor", minors: 2 }, source: "network" });
    expect(status.fix).toMatch(/upgrade\.release/);
    expect(await call("upgrades_status", { offline: true })).toMatchObject({ installed: "2.3.0", source: "cache" });
  });

  it("upgrades_status says so when there's no umbrella", async () => {
    const { call } = await connect(app());
    expect(await call("upgrades_status")).toMatchObject({ installed: null });
  });

  it("catalog_search finds what Genesis has for a need", async () => {
    const { call } = await connect(app());
    const found = await call("catalog_search", { need: "a page inside the app shell" });
    expect(found.results[0]).toMatchObject({ rule: "page-layout", from: "genesis-cli" });
    expect((await call("catalog_search", { need: "zzqx" })).results).toEqual([]);
  });

  it("refuses arguments the schema doesn't allow, as MCP errors", async () => {
    const { call } = await connect(app());
    await expect(call("doctor_run", { rules: "raw-tag" })).rejects.toThrow(McpError);
    await expect(call("doctor_run", { nope: true })).rejects.toThrow(/unknown argument "nope"/);
    await expect(call("doctor_run", { base: "--output=/tmp/x" })).rejects.toThrow(/"base" must be/);
    await expect(call("fix_plan", {})).rejects.toThrow(/pass fixId or rule/);
    await expect(call("fix_apply", { fixId: "codemod.scope-names", hash: "nothex" })).rejects.toThrow(/"hash" must be/);
    await expect(call("no_such_tool")).rejects.toThrow(/no tool "no_such_tool"/);
  });
});

describe("genesis mcp: plans and approval", () => {
  it("fix_plan returns the plan and its hash, and writes nothing", async () => {
    const root = app();
    const before = read(root, "src/screen.tsx");
    const { call } = await connect(root);
    const byRule = await call("fix_plan", { rule: "removed-scope-name" });
    expect(byRule).toMatchObject({ fixId: "codemod.scope-names", kind: "auto", findings: 1, apply: { runnable: true, next: { tool: "fix_apply", arguments: { fixId: "codemod.scope-names" } } } });
    expect(byRule.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(byRule.plan.files).toEqual([expect.objectContaining({ path: "src/screen.tsx", action: "write", content: expect.stringContaining("scopeTimeZone={zone}") })]);
    // The same plan by fix id: the same hash.
    expect((await call("fix_plan", { fixId: "codemod.scope-names" })).hash).toBe(byRule.hash);
    expect(read(root, "src/screen.tsx")).toBe(before);
    expect(await call("fix_plan", { rule: "raw-tag", file: "nowhere.tsx" }).catch((e: Error) => e.message)).toMatch(/no finding of raw-tag there/);
  });

  it("fix_apply refuses without elicitation and returns the command for the person", async () => {
    const root = app();
    const before = read(root, "src/screen.tsx");
    const { call } = await connect(root);
    const { hash } = await call("fix_plan", { fixId: "codemod.scope-names" });
    const result = await call("fix_apply", { fixId: "codemod.scope-names", hash });
    expect(result).toMatchObject({ applied: false, command: `genesis fix codemod.scope-names --expect ${hash}` });
    expect(read(root, "src/screen.tsx")).toBe(before);
  });

  it("fix_apply applies after the person accepts the elicitation, which shows the plan", async () => {
    const root = app();
    const { call, asked } = await connect(root, { answer: () => ({ action: "accept", content: { approve: true } }) });
    const { hash } = await call("fix_plan", { fixId: "codemod.scope-names" });
    const result = await call("fix_apply", { fixId: "codemod.scope-names", hash });
    expect(result).toMatchObject({ applied: true, written: ["src/screen.tsx"], verify: { ok: true } });
    expect(read(root, "src/screen.tsx")).toContain("scopeTimeZone={zone}");
    expect(asked).toHaveLength(1);
    expect(asked[0]!.params.message).toContain("codemod.scope-names");
    expect(asked[0]!.params.message).toContain("write src/screen.tsx");
    expect(asked[0]!.params.message).toContain(hash.slice(0, 12));
  });

  it("writes nothing when the person declines, or accepts without approving", async () => {
    const root = app();
    const before = read(root, "src/screen.tsx");
    for (const answer of [() => ({ action: "decline" as const }), () => ({ action: "accept" as const, content: { approve: false } })]) {
      const { call } = await connect(root, { answer });
      const { hash } = await call("fix_plan", { fixId: "codemod.scope-names" });
      expect(await call("fix_apply", { fixId: "codemod.scope-names", hash })).toMatchObject({ applied: false });
    }
    expect(read(root, "src/screen.tsx")).toBe(before);
  });

  it("refuses a stale hash before asking anyone", async () => {
    const root = app();
    const { call, asked } = await connect(root, { answer: () => ({ action: "accept", content: { approve: true } }) });
    const { hash } = await call("fix_plan", { fixId: "codemod.scope-names" });
    writeFileSync(path.join(root, "src/screen.tsx"), `${read(root, "src/screen.tsx")}export const B = () => <NativeResourceView view={w} practiceTimeZone={other} />;\n`);
    const changed = read(root, "src/screen.tsx");
    await expect(call("fix_apply", { fixId: "codemod.scope-names", hash })).rejects.toThrow(/the app changed since that plan was made/);
    await expect(call("fix_apply", { fixId: "codemod.scope-names", hash: "f".repeat(64) })).rejects.toThrow(McpError);
    expect(asked).toHaveLength(0);
    expect(read(root, "src/screen.tsx")).toBe(changed);
  });

  it("refuses when the file changes while the person reads the plan", async () => {
    const root = app();
    const { call } = await connect(root, {
      answer: () => {
        writeFileSync(path.join(root, "src/screen.tsx"), `${read(root, "src/screen.tsx")}// edited meanwhile\n`);
        return { action: "accept", content: { approve: true } };
      },
    });
    const { hash } = await call("fix_plan", { fixId: "codemod.scope-names" });
    await expect(call("fix_apply", { fixId: "codemod.scope-names", hash })).rejects.toThrow(/changed since/);
    expect(read(root, "src/screen.tsx")).toContain("practiceTimeZone={zone}");
  });

  it("never runs a fix that needs a secret: it returns the wizard step for the person", async () => {
    const root = app();
    const secretFix = {
      id: "connect-secret",
      kind: "guided" as const,
      rules: ["issues-token"],
      title: "store the issues token",
      step: "github.issues",
      plan: () => ({ summary: "stores the token as a repository secret", commands: [{ tool: "gh", args: ["secret", "set", "GITHUB_TOKEN"], stdinSecret: "GITHUB_TOKEN", why: "the edge function reads it" }] }),
    };
    const finding = { rule: "issues-token", level: "warn" as const, file: "genesis.config.json", line: 0, message: "the issues token isn't set", fix: { id: "connect-secret", kind: "guided" as const, title: "store the issues token" } };
    const { call, asked } = await connect(root, {
      answer: () => ({ action: "accept", content: { approve: true } }),
      server: { deps: { doctor: async () => ({ findings: [finding] }) as never, extraFixes: [secretFix] } },
    });
    const planned = await call("fix_plan", { rule: "issues-token" });
    expect(planned.plan.secrets).toEqual(["GITHUB_TOKEN"]);
    expect(planned.apply).toMatchObject({ runnable: false, command: "genesis setup --step github.issues", step: "github.issues" });
    const applied = await call("fix_apply", { fixId: "connect-secret", hash: planned.hash });
    expect(applied).toMatchObject({ applied: false, command: "genesis setup --step github.issues" });
    expect(asked).toHaveLength(0);
  });

  it("settings_propose plans a checked change; fix_apply writes it after approval, keeping the lock and the indent", async () => {
    const root = app();
    const { call } = await connect(root, { answer: () => ({ action: "accept", content: { approve: true } }) });
    await expect(call("settings_propose", { key: "support.dumpRetentionDays", value: 400 })).rejects.toThrow(/must be at most 365/);
    await expect(call("settings_propose", { key: "support.nope", value: 1 })).rejects.toThrow(/no installed Genesis package declares support.nope/);
    const before = read(root, "genesis.config.json");
    const proposed = await call("settings_propose", { key: "support.inbox", value: false });
    expect(proposed.plan.summary).toMatch(/settings\.support\.inbox from true to false \(stays locked\)/);
    expect(read(root, "genesis.config.json")).toBe(before);
    const applied = await call("fix_apply", { fixId: "settings.propose", hash: proposed.hash });
    expect(applied).toMatchObject({ applied: true, written: ["genesis.config.json"], verify: { ok: true } });
    const after = read(root, "genesis.config.json");
    expect(JSON.parse(after).settings["support.inbox"]).toEqual({ value: false, locked: true });
    expect(after).toMatch(/^ {4}"preset"/m);
    // A hash this session never proposed isn't applied.
    await expect(call("fix_apply", { fixId: "settings.propose", hash: "a".repeat(64) })).rejects.toThrow(/no settings proposal with that hash/);
  });

  it("shows the person a proposed value in full, however long, and each file's changed lines", async () => {
    const root = app();
    const long = `${"a".repeat(300)}-THE-END`;
    const { call, asked } = await connect(root, { answer: () => ({ action: "decline" }) });
    const { hash } = await call("settings_propose", { key: "support.label", value: long });
    await call("fix_apply", { fixId: "settings.propose", hash });
    expect(asked[0]!.params.message).toContain(JSON.stringify(long));
    expect(asked[0]!.params.message).toMatch(/\+ +"support\.label": "a{300}-THE-END"/);
    const plan = await call("fix_plan", { fixId: "codemod.scope-names" });
    await call("fix_apply", { fixId: "codemod.scope-names", hash: plan.hash });
    expect(asked[1]!.params.message).toMatch(/- .*practiceTimeZone=\{zone\}/);
    expect(asked[1]!.params.message).toMatch(/\+ .*scopeTimeZone=\{zone\}/);
    expect(changedLines("a\nb\nc", "a\nB\nc")).toEqual(["- b", "+ B"]);
  });

  it("returns upgrade.release's command instead of running it (it runs the package manager on the terminal)", async () => {
    const root = app();
    const upgrade = { id: "upgrade.release", kind: "auto" as const, rules: ["genesis-behind"], title: "upgrade", plan: () => ({ summary: "upgrade", commands: [{ tool: "genesis", args: ["upgrade", "--pr"], why: "w" }] }), apply: () => { throw new Error("must not run"); } };
    const finding = { rule: "genesis-behind", level: "warn" as const, file: "package.json", line: 0, message: "behind", fix: { id: "upgrade.release", kind: "auto" as const, title: "upgrade" } };
    const { call, asked } = await connect(root, { answer: () => ({ action: "accept", content: { approve: true } }), server: { deps: { doctor: async () => ({ findings: [finding] }) as never, extraFixes: [upgrade] } } });
    // The stand-in replaces the registry's upgrade.release (a later fix with the same id wins the lookup).
    const planned = await call("fix_plan", { rule: "genesis-behind" });
    const applied = await call("fix_apply", { fixId: "upgrade.release", hash: planned.hash });
    expect(applied).toMatchObject({ applied: false, command: `genesis fix upgrade.release --expect ${planned.hash}` });
    expect(asked).toHaveLength(0);
  });

  it("settings_propose without elicitation says what to set by hand", async () => {
    const root = app();
    const { call } = await connect(root);
    const { hash } = await call("settings_propose", { key: "support.dumpRetentionDays", value: 60 });
    expect(await call("fix_apply", { fixId: "settings.propose", hash })).toMatchObject({ applied: false, manual: expect.stringContaining('"settings.support.dumpRetentionDays" to 60') });
  });
});

describe("genesis mcp: secrets", () => {
  it("no tool output carries a secret's value", async () => {
    const root = app();
    const { call, seen } = await connect(root, { answer: () => ({ action: "accept", content: { approve: true } }) });
    await call("doctor_run");
    await call("settings_catalogue");
    await call("settings_get");
    await call("doctor_explain", { rule: "removed-scope-name" });
    const plan = await call("fix_plan", { fixId: "codemod.scope-names" });
    // The file holds the token: the plan's content shows it redacted (the hash covers the real text).
    expect(plan.plan.files[0].content).toContain("[redacted]");
    await call("settings_propose", { key: "support.label", value: `label ${SECRET}` });
    await call("settings_propose", { key: "support.label", value: "x" }).catch(() => {});
    await call("fix_plan", { rule: "no-such-rule" }).catch(() => {});
    await call("fix_apply", { fixId: "codemod.scope-names", hash: plan.hash });
    expect(seen.length).toBeGreaterThan(5);
    for (const text of seen) expect(text).not.toContain(SECRET);
  });

  const PEM = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\nBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE KEY-----";
  const QUOTED = 'pa"ss\\word-Zx81Qp';

  it.each([
    ["a PEM", PEM],
    ["a value with a quote and a backslash", QUOTED],
  ])("never shows %s, escaped or not, through fix_plan and settings_propose", async (_name, secret) => {
    const root = app({ "src/key.tsx": `export const k = ${JSON.stringify(secret)};\n` });
    // Also as a literal in the file the plan rewrites.
    writeFileSync(path.join(root, "src/screen.tsx"), `${read(root, "src/screen.tsx")}export const pem = ${JSON.stringify(secret)};\n`);
    const { call, seen } = await connect(root, { server: { env: { SUPPORT_GITHUB_TOKEN: secret, MY_PASS: secret } } });
    await call("fix_plan", { fixId: "codemod.scope-names" });
    await call("settings_propose", { key: "support.label", value: `x ${secret} y` });
    await call("settings_propose", { key: "support.label", value: secret });
    const escaped = JSON.stringify(secret).slice(1, -1);
    for (const text of seen) {
      expect(text).not.toContain(secret);
      expect(text).not.toContain(escaped);
      expect(text).not.toContain("MIIEvQIBADANBgkqhkiG9w0BAQEFAASC");
    }
  });

  it("redacts secret-shaped literals in a file's content whatever holds them", async () => {
    const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
    const root = app();
    writeFileSync(path.join(root, "genesis.config.json"), `${JSON.stringify({ settings: { "support.label": token } }, null, 2)}\n`);
    const { call } = await connect(root);
    const proposed = await call("settings_propose", { key: "support.dumpRetentionDays", value: 60 });
    expect(proposed.plan.files[0].content).toContain("[redacted]");
    expect(JSON.stringify(proposed)).not.toContain(token);
    expect(boundedJson({ k: PEM }, secretVault([]))).not.toContain("MIIEvQ");
  });

  it("scrubs secret-looking environment values and URL passwords", () => {
    const values = secretValues({ DATABASE_URL: "postgres://app:hunter2hunter2@db:5432/x", HOME: "/Users/someone", SHORT_TOKEN: "abc" }, []);
    expect(values).toEqual(["postgres://app:hunter2hunter2@db:5432/x"]);
    expect(scrub("failed: postgres://app:hunter2hunter2@db:5432/x", secretVault(values))).toBe("failed: [redacted]");
    expect(scrub("connect https://user:pa55word@host/x", secretVault([]))).toBe("connect https://user:[redacted]@host/x");
    expect(secretValues({ DB_PASS: "longpassword1", GITHUB_PAT: "patpatpatpat", STRIPE_SK: "sksksksksk", PATH: "/usr/bin:/bin" })).toEqual(["longpassword1", "patpatpatpat", "sksksksksk"]);
  });
});

describe("genesis mcp: errors and stdio", () => {
  it("strips repeated MCP error prefixes", () => {
    const inner = new McpError(-32602, new McpError(-32602, "bad thing").message);
    expect(toMcpError(inner, "t", secretVault([])).message).toBe("MCP error -32602: bad thing");
  });

  it("gives every child process a stdio that can't touch the protocol's fds", async () => {
    expect(safeStdio({ stdio: "inherit" as const })).toEqual({ stdio: ["ignore", 2, "inherit"] });
    expect(safeStdio({ stdio: ["inherit", "pipe", "pipe"] })).toEqual({ stdio: ["ignore", "pipe", "pipe"] });
    expect(safeStdio({ stdio: [0, 1, 2], cwd: "/x" })).toEqual({ stdio: ["ignore", 2, 2], cwd: "/x" });
    expect(safeStdio({ cwd: "/x" })).toEqual({ cwd: "/x" });
    const restore = guardChildStdio();
    try {
      // The ESM import sees the guard: an inheriting child's stdout lands on stderr, not fd 1.
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync(process.execPath, ["-e", "process.stdout.write('to-stdout')"], { stdio: ["inherit", "inherit", "pipe"] });
      expect(result.status).toBe(0);
    } finally {
      restore();
    }
  });
});

describe("genesis agents --mcp (.mcp.json)", () => {
  it("adds the entry, keeps every other server, and is idempotent", () => {
    const root = makeApp(null, { ".mcp.json": `${JSON.stringify({ mcpServers: { other: { command: "other-mcp" } } }, null, 4)}\n` });
    expect(mcpJsonState(root)).toBe("stale");
    expect(writeMcpJson(root)).toEqual([".mcp.json"]);
    const json = JSON.parse(read(root, ".mcp.json"));
    expect(json.mcpServers.other).toEqual({ command: "other-mcp" });
    expect(json.mcpServers.genesis).toEqual({ type: "stdio", command: "npx", args: ["--no", "genesis", "mcp"] });
    expect(read(root, ".mcp.json")).toMatch(/^ {4}"mcpServers"/m);
    expect(writeMcpJson(root)).toEqual([]);
    expect(mcpJsonState(root)).toBe("ok");
  });

  it("creates the file, updates an older entry keeping its env, and never clobbers a file it can't read", () => {
    const fresh = makeApp(null, {});
    expect(mcpJsonState(fresh)).toBe("missing");
    writeMcpJson(fresh);
    expect(JSON.parse(read(fresh, ".mcp.json")).mcpServers.genesis.args).toEqual([...GENESIS_MCP_ENTRY.args]);

    const old = makeApp(null, { ".mcp.json": JSON.stringify({ mcpServers: { genesis: { command: "genesis", args: ["mcp"], env: { DEBUG: "1" } } } }) });
    writeMcpJson(old);
    expect(JSON.parse(read(old, ".mcp.json")).mcpServers.genesis).toEqual({ command: "npx", args: ["--no", "genesis", "mcp"], env: { DEBUG: "1" }, type: "stdio" });

    const outside = makeApp(null, { "elsewhere.json": "{}" });
    const linked = makeApp(null, {});
    symlinkSync(path.join(outside, "elsewhere.json"), path.join(linked, ".mcp.json"));
    expect(() => writeMcpJson(linked)).toThrow(/symbolic link/);
    expect(read(outside, "elsewhere.json")).toBe("{}");
    expect(mcpJsonState(linked)).toBe("invalid");

    const broken = makeApp(null, { ".mcp.json": "{ not json" });
    expect(mcpJsonState(broken)).toBe("invalid");
    expect(() => mcpJsonEdit(broken)).toThrow(McpJsonError);
    expect(read(broken, ".mcp.json")).toBe("{ not json");
  });
});

/** The second review's adversarial cases (approval honesty, clipping, the stdio guard), as regression tests. */
describe("genesis mcp: adversarial review", () => {
  const decline = () => ({ action: "decline" as const });
  const accept = () => ({ action: "accept" as const, content: { approve: true } });

  it("an unterminated key header ends at its line: it never hides the rest of a text", () => {
    expect(scrub("-----BEGIN PRIVATE KEY----- x\nthe rest stays", secretVault([]))).toBe("[redacted]\nthe rest stays");
    expect(scrub("a\n-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----\nb", secretVault([]))).toBe("a\n[redacted]\nb");
  });

  it.each([
    ["an unterminated key header", "-----BEGIN PRIVATE KEY----- harmless? actually anything", /shaped like a secret/],
    ["a token-shaped value", "sk-AAAAAAAAAAAAAAAAAAAAAAAAAA", /shaped like a secret/],
    ["the value of an environment secret", SECRET, /value of a secret/],
  ])("refuses to ask approval for %s rather than hide it from the person", async (_name, value, reason) => {
    const root = app();
    const before = read(root, "genesis.config.json");
    const { call, asked } = await connect(root, { answer: accept });
    const { hash } = await call("settings_propose", { key: "support.label", value });
    const result = await call("fix_apply", { fixId: "settings.propose", hash });
    expect(result).toMatchObject({ applied: false });
    expect(result.reason).toMatch(reason);
    expect(asked).toHaveLength(0);
    expect(read(root, "genesis.config.json")).toBe(before);
  });

  it("shows invisible and direction-changing characters as their codes", async () => {
    const root = app();
    const { call, asked } = await connect(root, { answer: decline });
    const { hash } = await call("settings_propose", { key: "support.label", value: "safe\u202Etxt.exe\u2028\u200Bx" });
    await call("fix_apply", { fixId: "settings.propose", hash });
    const message = asked[0]!.params.message;
    expect(message).not.toMatch(/[\u202E\u2028\u200B]/);
    expect(message).toContain("\\u{202E}");
    expect(showInvisible("a\u2066b\tc\nd")).toBe("a\\u{2066}b\tc\nd");
  });

  it("refuses approval when the changed lines are over the bound, instead of hiding them", async () => {
    const root = app();
    const big = { id: "big.write", kind: "auto" as const, rules: ["big"], title: "write a big file", plan: () => ({ summary: "writes big.txt", files: [{ path: "big.txt", beforeHash: null, content: `${"line of text\n".repeat(1_500)}`, why: "w" }] }) };
    const finding = { rule: "big", level: "warn" as const, file: "big.txt", line: 0, message: "m", fix: { id: "big.write", kind: "auto" as const, title: "t" } };
    const { call, asked } = await connect(root, { answer: accept, server: { deps: { doctor: async () => ({ findings: [finding] }) as never, extraFixes: [big] } } });
    const { hash } = await call("fix_plan", { fixId: "big.write" });
    const result = await call("fix_apply", { fixId: "big.write", hash });
    expect(result).toMatchObject({ applied: false, reason: expect.stringMatching(/more lines than an approval can show whole/) });
    expect(asked).toHaveLength(0);
  });

  it("refuses approval when a planned file changed since the plan, instead of showing a diff the plan doesn't write", async () => {
    const root = app({ "notes.txt": "changed by someone else\n" });
    // A plan read against "original" (its beforeHash), while the file on disk now says something else.
    const stale = { id: "stale.write", kind: "auto" as const, rules: ["stale"], title: "rewrite notes", plan: () => ({ summary: "rewrites notes.txt", files: [{ path: "notes.txt", beforeHash: createHash("sha256").update("original\n").digest("hex"), content: "rewritten\n", why: "w" }] }) };
    const finding = { rule: "stale", level: "warn" as const, file: "notes.txt", line: 0, message: "m", fix: { id: "stale.write", kind: "auto" as const, title: "t" } };
    const { call, asked } = await connect(root, { answer: accept, server: { deps: { doctor: async () => ({ findings: [finding] }) as never, extraFixes: [stale] } } });
    const { hash } = await call("fix_plan", { fixId: "stale.write" });
    const result = await call("fix_apply", { fixId: "stale.write", hash });
    expect(result).toMatchObject({ applied: false, reason: expect.stringMatching(/notes\.txt changed since the plan was made/) });
    expect(asked).toHaveLength(0);
    expect(read(root, "notes.txt")).toBe("changed by someone else\n");
  });

  it("keeps a result valid JSON when the second redaction pass cuts an escape", () => {
    // The value `abcdefgh\` shows only in the escaped text (`"abcdefgh\""`): redacting it there would leave `"[redacted]""`.
    // (At least 8 characters: the vault refuses a shorter value.)
    const values = ["abcdefgh\\"];
    const text = boundedJson({ k: 'abcdefgh"' }, secretVault(values));
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).not.toContain("abcdefgh\\\\");
    expect(JSON.parse(text)).toMatchObject({ redacted: true });
  });

  it("an answer that isn't approve: true applies nothing", async () => {
    const root = app();
    const before = read(root, "genesis.config.json");
    const { call } = await connect(root, { answer: () => ({ action: "accept", content: { approve: "true" as never } }) });
    const { hash } = await call("settings_propose", { key: "support.label", value: "hello-world" });
    const outcome = await call("fix_apply", { fixId: "settings.propose", hash }).catch((e: Error) => ({ applied: false, error: e.message }));
    expect(outcome).toMatchObject({ applied: false });
    expect(read(root, "genesis.config.json")).toBe(before);
  });

  it("scrubs before clipping: a secret cut by the clip leaves nothing of it", async () => {
    const message = `${"x".repeat(580)} token ${SECRET} tail`;
    expect(message.indexOf(SECRET)).toBe(587);
    const values = secretVault(secretValues({ SUPPORT_GITHUB_TOKEN: SECRET }));
    expect(boundedJson(slimFinding({ rule: "r", level: "warn", file: "f", line: 1, message }, (t) => scrub(t, values)), values)).not.toContain("ghp_");
    const root = app();
    const finding = { rule: "r", level: "warn" as const, file: "f", line: 1, message };
    const { call, seen } = await connect(root, { server: { deps: { doctor: async () => ({ ok: true, genesis: { uiPackage: "u", uiVersion: "1" }, errors: 0, warnings: 1, infos: 0, findings: [finding] }) as never } } });
    await call("doctor_run");
    expect(seen.join("\n")).not.toContain("ghp_TopSecret");
  });

  it("shows no file hashes to the agent", async () => {
    const { call } = await connect(app());
    const { plan } = await call("fix_plan", { fixId: "codemod.scope-names" });
    expect(Object.keys(plan.files[0])).not.toContain("contentSha256");
    expect(Object.keys(plan.files[0])).not.toContain("beforeHash");
  });

  it("treats *PASSPHRASE*, *_PWD and *SALT* as secret names, but not the shell's PWD", () => {
    expect(secretValues({ GPG_PASSPHRASE: "correct-horse-battery", MYSQL_PWD: "hunter2hunter2", SIGNING_SALT: "saltysaltysalty", PWD: "/Users/someone/app", OLDPWD: "/Users/someone" })).toEqual(
      expect.arrayContaining(["correct-horse-battery", "hunter2hunter2", "saltysaltysalty"]),
    );
    expect(secretValues({ PWD: "/Users/someone/app", OLDPWD: "/Users/someone" })).toEqual([]);
  });

  it("starts with a large service-account key in the environment, and redacts it", async () => {
    const big = `{"private_key":"${"k".repeat(70_000)}"}`;
    const { call, seen } = await connect(app(), { server: { env: { SERVICE_ACCOUNT_JSON_SECRET: big } } });
    expect(await call("settings_get")).toBeTypeOf("object");
    expect(boundedJson({ leaked: big }, secretVault([big]))).not.toContain("kkkkkkkk");
    expect(seen.join("\n")).not.toContain("kkkkkkkk");
    expect(() => secretValues({ API_TOKEN: "x".repeat(4 * 1024 * 1024 + 1) })).toThrow(/^API_TOKEN is longer than 4194304 characters/);
    expect(secretValues({ API_TOKEN: "  abc12  ", DB_PASS: "longpassword1" })).toEqual(["longpassword1"]);
  });

  it("costs the text, not the held secrets: 2,000 small leaves with a 1 MiB secret held", () => {
    const findings = Array.from({ length: 2_000 }, (_, i) => `finding ${i}`);
    const timed = (vault: ReturnType<typeof secretVault>) => {
      const started = performance.now();
      const text = boundedJson({ findings }, vault);
      return { ms: performance.now() - started, text };
    };
    timed(secretVault([])); // warm up
    // Against the same work with nothing held, so a slow machine slows both.
    const baseline = Math.max(timed(secretVault([])).ms, 5);
    const held = timed(secretVault([`${"s".repeat(1024 * 1024 - 8)}-secret!`]));
    expect(held.ms).toBeLessThan(baseline * 10);
    expect(JSON.parse(held.text).findings).toHaveLength(2_000);
  });

  it("while the settings catalogue doesn't load, only the doctor's tools answer, redacted by every readable secret name", async () => {
    const OTHER = "@marktiderman/genesis-other";
    const OTHER_SECRET = "other-secret-value-1234";
    const other = { namespace: "support", keys: { relay: { type: "boolean", default: false, needs: "secret:OTHER_RELAY" } } };
    const root = app({
      "package.json": JSON.stringify({ name: "app", dependencies: { [SUPPORT]: "^0.12.0", [OTHER]: "^0.1.0" } }),
      [`node_modules/${OTHER}/package.json`]: JSON.stringify({ name: OTHER, version: "0.1.0", genesis: { settings: other } }),
    });
    const env = { SUPPORT_GITHUB_TOKEN: SECRET, OTHER_RELAY: OTHER_SECRET, PATH: "/usr/bin" };
    const { call } = await connect(root, { server: { env } });
    // Every other tool fails closed, naming the problem.
    await expect(call("settings_get")).rejects.toThrow(/settings catalogue doesn't load.*declared twice/);
    // The doctor still answers, and reports the catalogue as a finding; doctor_explain answers too.
    expect(JSON.stringify(await call("doctor_run"))).toMatch(/invalid-setting.*declared twice|declared twice.*invalid-setting/);
    await expect(call("doctor_explain", { rule: "invalid-setting" })).resolves.toBeTypeOf("object");
    // What the doctor says is redacted by every secret name a readable declaration names (OTHER_RELAY isn't secret-looking).
    const leaky = { rule: "r", level: "warn" as const, file: "f", line: 1, message: `relay ${OTHER_SECRET} and ${SECRET}` };
    const stubbed = await connect(root, { server: { env, deps: { doctor: async () => ({ ok: false, genesis: { uiPackage: "u", uiVersion: "1" }, errors: 0, warnings: 1, infos: 0, findings: [leaky] }) as never } } });
    expect(JSON.stringify(await stubbed.call("doctor_run"))).toContain("relay [redacted] and [redacted]");
    expect(stubbed.seen.join("\n")).not.toContain(OTHER_SECRET);
  });

  it("a package whose declaration doesn't parse: tools fail closed, and the doctor still redacts the secrets it names", async () => {
    const BAD = "@marktiderman/genesis-bad";
    const BAD_SECRET = "bad-relay-value-5678";
    const bad = { namespace: "bad", keys: { relay: { type: "boolean", default: false, needs: "secret:BAD_RELAY" }, odd: { type: "nonsense", default: 1 } } };
    const root = app({
      "package.json": JSON.stringify({ name: "app", dependencies: { [SUPPORT]: "^0.12.0", [BAD]: "^0.1.0" } }),
      [`node_modules/${BAD}/package.json`]: JSON.stringify({ name: BAD, version: "0.1.0", genesis: { settings: bad } }),
    });
    const env = { SUPPORT_GITHUB_TOKEN: SECRET, BAD_RELAY: BAD_SECRET, PATH: "/usr/bin" };
    const { call } = await connect(root, { server: { env } });
    await expect(call("settings_get")).rejects.toThrow(/settings catalogue doesn't load.*genesis-bad/);
    const leaky = { rule: "r", level: "warn" as const, file: "f", line: 1, message: `relay ${BAD_SECRET}` };
    const stubbed = await connect(root, { server: { env, deps: { doctor: async () => ({ ok: false, genesis: { uiPackage: "u", uiVersion: "1" }, errors: 0, warnings: 1, infos: 0, findings: [leaky] }) as never } } });
    expect(JSON.stringify(await stubbed.call("doctor_run"))).toContain("relay [redacted]");
    expect(stubbed.seen.join("\n")).not.toContain(BAD_SECRET);
  });

  it("scrubs what is written to stderr", () => {
    const written: unknown[] = [];
    const stream = { write: (chunk: unknown) => (written.push(chunk), true) } as unknown as NodeJS.WriteStream;
    const restore = scrubStream(stream, secretVault([SECRET]));
    stream.write(`log ${SECRET}\n`);
    stream.write(Buffer.from(`buf ${SECRET}\n`));
    restore();
    expect(written).toEqual(["log [redacted]\n", "buf [redacted]\n"]);
  });

  it("guards fork without stdio and spawn with null args, keeping fork's ipc", () => {
    expect(guardArgs("spawn", ["sh", null, { stdio: "inherit" }])).toEqual(["sh", null, { stdio: ["ignore", 2, "inherit"] }]);
    expect(guardArgs("fork", ["m.js"])).toEqual(["m.js", { stdio: ["ignore", 2, "inherit", "ipc"] }]);
    expect(guardArgs("fork", ["m.js", ["a"], { stdio: "inherit" }])).toEqual(["m.js", ["a"], { stdio: ["ignore", 2, "inherit", "ipc"] }]);
    expect(guardArgs("fork", ["m.js", { silent: true }])).toEqual(["m.js", { silent: true }]);
    expect(guardArgs("exec", ["ls", { stdio: "inherit" }])).toEqual(["ls", { stdio: ["ignore", 2, "inherit"] }]);
  });

  it("no child writes to fd 1 while guarded: execFileSync, spawnSync, spawn(cmd, null), fork with and without stdio", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "genesis-mcp-stdio-"));
    try {
      const stdio = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "mcp", "stdio.ts");
      writeFileSync(path.join(dir, "child.cjs"), "process.stdout.write('FORK_LEAK\\n'); if (process.send) process.disconnect();\n");
      writeFileSync(path.join(dir, "child.sh"), "#!/bin/sh\necho SPAWN_NULL_ARGS_LEAK\n", { mode: 0o755 });
      writeFileSync(
        path.join(dir, "harness.mts"),
        `import { guardChildStdio } from ${JSON.stringify(stdio)};
import { execFileSync, fork, spawn, spawnSync } from "node:child_process";
guardChildStdio();
execFileSync("/bin/echo", ["EXECFILE_INHERIT"], { stdio: "inherit" });
spawnSync("/bin/echo", ["SPAWNSYNC_INHERIT"], { stdio: "inherit" });
const s = spawn(${JSON.stringify(path.join(dir, "child.sh"))}, null, { stdio: "inherit" });
await new Promise((r) => s.on("close", r));
for (const options of [undefined, { stdio: "inherit" }]) {
  const f = options ? fork(${JSON.stringify(path.join(dir, "child.cjs"))}, [], options) : fork(${JSON.stringify(path.join(dir, "child.cjs"))});
  await new Promise((r) => f.on("exit", r));
}
process.stderr.write("HARNESS_DONE\\n");
`,
      );
      const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(dir, "harness.mts")], { encoding: "utf8" });
      expect(r.stderr).toContain("HARNESS_DONE");
      expect(r.stdout).toBe("");
      for (const marker of ["EXECFILE_INHERIT", "SPAWNSYNC_INHERIT", "SPAWN_NULL_ARGS_LEAK", "FORK_LEAK"]) expect(r.stderr).toContain(marker);
      expect(r.stderr.match(/FORK_LEAK/g)).toHaveLength(2);
    } finally {
      removeTempDir(dir);
    }
  });

  it("keeps .mcp.json's mode when it rewrites it", () => {
    const root = makeApp(null, { ".mcp.json": JSON.stringify({ mcpServers: {} }) });
    chmodSync(path.join(root, ".mcp.json"), 0o600);
    expect(writeMcpJson(root)).toEqual([".mcp.json"]);
    expect(statSync(path.join(root, ".mcp.json")).mode & 0o777).toBe(0o600);
  });
});
