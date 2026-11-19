// @feat:genesis-mcp
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema, McpError, type ElicitRequest, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { createGenesisMcpServer, type GenesisMcpOptions } from "../src/mcp/server.js";
import { GENESIS_MCP_ENTRY, mcpJsonEdit, mcpJsonState, McpJsonError, writeMcpJson } from "../src/mcp/config.js";
import { scrub, secretValues } from "../src/mcp/bounds.js";
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
    expect(tools.map((t) => t.name).sort()).toEqual(["catalog_search", "doctor_explain", "doctor_run", "fix_apply", "fix_plan", "settings_catalogue", "settings_get", "settings_propose", "upgrades_status"]);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.annotations?.readOnlyHint).toBe(t.name !== "fix_apply");
    }
    expect(tools.find((t) => t.name === "fix_apply")?.inputSchema.required).toEqual(["fixId", "hash"]);
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
    expect(planned.apply).toMatchObject({ runnable: false, command: "genesis setup --step github.issues" });
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

  it("scrubs secret-looking environment values and URL passwords", () => {
    const values = secretValues({ DATABASE_URL: "postgres://app:hunter2hunter2@db:5432/x", HOME: "/Users/someone", SHORT_TOKEN: "abc" }, []);
    expect(values).toEqual(["postgres://app:hunter2hunter2@db:5432/x"]);
    expect(scrub("failed: postgres://app:hunter2hunter2@db:5432/x", values)).toBe("failed: [redacted]");
    expect(scrub("connect https://user:pa55word@host/x", [])).toBe("connect https://user:[redacted]@host/x");
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

    const broken = makeApp(null, { ".mcp.json": "{ not json" });
    expect(mcpJsonState(broken)).toBe("invalid");
    expect(() => mcpJsonEdit(broken)).toThrow(McpJsonError);
    expect(read(broken, ".mcp.json")).toBe("{ not json");
  });
});
