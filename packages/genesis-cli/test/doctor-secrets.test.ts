// @feat:doctor-fixes
/**
 * The secret vault, the secret stores, and the `settings` check's setup and secret findings.
 * The developer's CLIs are stub binaries on PATH that record their argv and stdin: no value may
 * ever appear in argv, logs, errors or JSON.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runDoctor, toJson } from "../src/doctor/index.js";
import { applyPlan, builtinFixes, defineFix, planFix, type Fix } from "../src/fix/index.js";
import { runFixCommand } from "../src/fix/command.js";
import { runTool, type ToolRunner } from "../src/exec/run.js";
import { SecretError, SecretVault } from "../src/exec/secret-vault.js";
import { parseEasEnv, parseGhSecrets, parseSupabaseSecrets, parseVaultNames, readSecretNames, setterFor, stdinFor, storeOptions } from "../src/exec/secret-stores.js";
import { promptHidden } from "../src/exec/prompt-secret.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";
import { removeTempDir } from "./temp.js";

const VALUE = "ghp_Sup3rSecretValue_42";
const SUPPORT = "@marktiderman/genesis-support";

describe("SecretVault", () => {
  it("holds values by name, hands one over only through use, and forgets it", async () => {
    const vault = new SecretVault();
    vault.set("API_KEY", VALUE);
    expect(vault.names()).toEqual(["API_KEY"]);
    expect(await vault.use("API_KEY", (v) => v.length)).toBe(VALUE.length);
    vault.drop("API_KEY");
    await expect(vault.use("API_KEY", (v) => v)).rejects.toThrow(/isn't set/);
  });

  it.each([
    ["a lower-case name", () => new SecretVault().set("api_key", VALUE), /isn't a secret name/],
    ["an empty value", () => new SecretVault().set("API_KEY", "  "), /empty or shorter/],
    ["a short value", () => new SecretVault().set("API_KEY", "abcdefg"), /shorter than 8/],
    ["a NUL byte", () => new SecretVault().set("API_KEY", "abcd\0efgh"), /NUL/],
  ])("refuses %s", (_, set, message) => {
    expect(set).toThrow(SecretError);
    expect(set).toThrow(message);
  });

  it("redacts a value, its JSON-escaped form and each long line of a multi-line one", () => {
    const vault = new SecretVault();
    vault.set("A", VALUE);
    vault.set("PEM", 'line-one-of-key\nline-two "quoted"');
    expect(vault.redact(`x ${VALUE} y`)).toBe("x [redacted] y");
    expect(vault.redact(JSON.stringify({ v: 'line-one-of-key\nline-two "quoted"' }))).not.toMatch(/line-one|quoted/);
    expect(vault.redact("only line-one-of-key leaked")).toBe("only [redacted] leaked");
    expect(vault.redactJson({ deep: [{ v: VALUE }] })).toEqual({ deep: [{ v: "[redacted]" }] });
  });

  it("redacts string leaves only, whatever the value looks like", () => {
    const vault = new SecretVault();
    vault.set("A", "truetrue");
    vault.set("B", "nullnull");
    expect(vault.redactJson({ ok: true, n: null, x: 1, s: "a truetrue b", k: ["nullnull"] })).toEqual({ ok: true, n: null, x: 1, s: "a [redacted] b", k: ["[redacted]"] });
  });

  it("redacts the \\u-escaped form of a non-ASCII value", () => {
    const vault = new SecretVault();
    vault.set("A", "pässwörd-42");
    expect(vault.redact('{"v":"p\\u00e4ssw\\u00f6rd-42"}')).toBe('{"v":"[redacted]"}');
    expect(vault.redact("pässwörd-42")).toBe("[redacted]");
  });

  it("redacts a value split across two chunks of streamed output", () => {
    const vault = new SecretVault();
    vault.set("A", VALUE);
    const seen: string[] = [];
    const stream = vault.redactingStream((t) => seen.push(t));
    stream.write(`token ${VALUE.slice(0, 7)}`);
    stream.write(`${VALUE.slice(7)} ok\nnext`);
    stream.end();
    expect(seen.join("")).toBe("token [redacted] ok\nnext");
  });

  it("redacts a runner's output, streamed and returned, and its errors", async () => {
    const vault = new SecretVault();
    vault.set("A", VALUE);
    const streamed: string[] = [];
    const echo: ToolRunner = async (_t, _a, o) => {
      o.onOutput?.(`out ${VALUE}\n`, "stdout");
      return { code: 0, stdout: `out ${VALUE}`, stderr: VALUE };
    };
    const result = await vault.redactingRunner(echo)("gh", [], { cwd: tmpdir(), onOutput: (t) => streamed.push(t) });
    expect(JSON.stringify(result) + streamed.join("")).not.toContain(VALUE);
    const thrower: ToolRunner = async () => {
      throw new Error(`boom ${VALUE}`);
    };
    await expect(vault.redactingRunner(thrower)("gh", [], { cwd: tmpdir() })).rejects.toThrow("boom [redacted]");
  });
});

describe("secret stores", () => {
  it("set a secret through stdin only: the value is never in a command's argv", () => {
    for (const target of ["edge", "github"] as const) {
      const setter = setterFor("GITHUB_TOKEN", target, { githubEnvironment: "production" });
      expect("command" in setter).toBe(true);
      if ("command" in setter) expect(setter.command.stdinSecret).toBe("GITHUB_TOKEN");
    }
    expect(setterFor("SENTRY_AUTH_TOKEN", "github", { githubEnvironment: "production" })).toMatchObject({ command: { tool: "gh", args: ["secret", "set", "SENTRY_AUTH_TOKEN", "--env", "production"] } });
    expect(setterFor("EXPO_TOKEN", "eas")).toEqual({ manual: expect.stringContaining("eas env:create --name EXPO_TOKEN --environment production --visibility secret") });
    // Vault is never written from the CLI: SQL carrying the value would be kept in pg_stat_statements.
    expect(setterFor("WEBHOOK_SECRET", "vault")).toEqual({ manual: expect.stringContaining("Database → Vault") });
    expect(setterFor("SERVICE_KEY", "server-env")).toEqual({ manual: expect.stringContaining("server's environment") });
    expect(() => setterFor("bad name", "edge")).toThrow(SecretError);
    expect(() => setterFor("A_B", "github", { githubEnvironment: "--repo x" })).toThrow(/isn't an environment name/);
  });

  it("forms stdin for each format, refusing what a format can't carry", () => {
    expect(stdinFor("value", "A", VALUE)).toBe(VALUE);
    expect(stdinFor("dotenv", "A", "v$HOME#x")).toBe("A='v$HOME#x'\n");
    expect(() => stdinFor("dotenv", "A", "it's")).toThrow(/quote or a line break/);
  });

  it("parse names, never keeping a value", () => {
    expect([...parseSupabaseSecrets('[{"name":"A","value":"digest"},{"name":"B"}]')]).toEqual(["A", "B"]);
    expect([...parseGhSecrets('[{"name":"EXPO_TOKEN","updatedAt":"x"}]')]).toEqual(["EXPO_TOKEN"]);
    expect([...parseEasEnv("EXPO_TOKEN=plain-text\nSENTRY_AUTH_TOKEN=*****\nnot a var\n")]).toEqual(["EXPO_TOKEN", "SENTRY_AUTH_TOKEN"]);
    expect([...parseVaultNames('[{"name":"WEBHOOK"}]')]).toEqual(["WEBHOOK"]);
    expect([...parseVaultNames('{"rows":[{"name":"WEBHOOK"}]}')]).toEqual(["WEBHOOK"]);
    expect([...parseVaultNames("| name |\n| WEBHOOK |\n")]).toEqual(["WEBHOOK"]);
    expect(() => parseSupabaseSecrets("{}")).toThrow();
  });

  it("answer, not crash, when a tool is missing or signed out", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "genesis-stores-"));
    try {
      expect(await readSecretNames("edge", root)).toEqual({ ok: false, reason: expect.stringMatching(/isn't linked/) });
      const missing: ToolRunner = async () => {
        throw new Error("gh isn't installed (not on PATH outside the app)");
      };
      expect(await readSecretNames("github", root, { run: missing })).toEqual({ ok: false, reason: expect.stringMatching(/isn't installed/) });
      const signedOut: ToolRunner = async () => ({ code: 4, stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login" });
      expect(await readSecretNames("github", root, { run: signedOut })).toEqual({ ok: false, reason: expect.stringMatching(/exited 4: .*gh auth login/) });
      expect(await readSecretNames("server-env", root)).toEqual({ ok: false, reason: expect.any(String) });
      // An invalid environment name: an answer, and gh never asked (it would list the repository's secrets).
      let asked = 0;
      const counted: ToolRunner = async () => (asked++, { code: 0, stdout: "[]", stderr: "" });
      expect(await readSecretNames("github", root, { run: counted, githubEnvironment: "prod env" })).toEqual({ ok: false, reason: expect.stringMatching(/release\.environment "prod env" isn't an environment name/) });
      expect(asked).toBe(0);
    } finally {
      removeTempDir(root);
    }
  });

  it("read the release lane's GitHub and EAS environments", () => {
    const root = mkdtempSync(path.join(tmpdir(), "genesis-stores-"));
    try {
      writeFileSync(path.join(root, "genesis.config.json"), JSON.stringify({ release: { easEnvironment: "preview" } }));
      expect(storeOptions(root)).toEqual({ githubEnvironment: "production", easEnvironment: "preview" });
      writeFileSync(path.join(root, "genesis.config.json"), JSON.stringify({}));
      expect(storeOptions(root)).toEqual({});
      // An invalid name is kept, so it is reported, never replaced by the repository's secrets.
      writeFileSync(path.join(root, "genesis.config.json"), JSON.stringify({ release: { environment: "prod env" } }));
      expect(storeOptions(root)).toEqual({ githubEnvironment: "prod env" });
    } finally {
      removeTempDir(root);
    }
  });

  /** A terminal stand-in: what the prompt wrote, its raw mode, and its listeners. */
  function terminal() {
    const listeners: Record<string, Array<(arg?: unknown) => void>> = {};
    const add = (e: string, l: (arg?: unknown) => void) => (listeners[e] = [...(listeners[e] ?? []), l]);
    const remove = (e: string, l: (arg?: unknown) => void) => (listeners[e] = (listeners[e] ?? []).filter((x) => x !== l));
    const state = { raw: false, written: [] as string[], killed: [] as string[] };
    const input = { isRaw: false, setRawMode: (m: boolean) => (state.raw = m), setEncoding: () => {}, resume: () => {}, pause: () => {}, on: add, off: remove };
    const proc = { pid: 1, once: add, off: remove, kill: (_pid: number, signal: string) => state.killed.push(signal) };
    const emit = (e: string, arg?: unknown) => [...(listeners[e] ?? [])].forEach((l) => l(arg));
    const ask = () => promptHidden("KEY: ", { input: input as never, output: { write: (t: string) => state.written.push(t) }, process: proc as never, settleMs: 5 });
    return { state, emit, ask, listening: (e: string) => (listeners[e] ?? []).length };
  }

  it("asks at a terminal without echoing, and puts the terminal back", async () => {
    const t = terminal();
    const answer = t.ask();
    expect(t.state.raw).toBe(true);
    t.emit("data", `${VALUE}x\u007f`);
    t.emit("data", "\r\n");
    expect(await answer).toBe(VALUE);
    expect(t.state.written.join("")).toBe("KEY: \n");
    expect(t.state.raw).toBe(false);
    expect(t.listening("SIGTERM") + t.listening("exit") + t.listening("data")).toBe(0);
  });

  it.each([
    ["more after Enter in the same paste", (t: ReturnType<typeof terminal>) => t.emit("data", `${VALUE}\nsecond line`), /multi-line values aren't supported/],
    ["more arriving right after Enter", (t: ReturnType<typeof terminal>) => (t.emit("data", `${VALUE}\r`), t.emit("data", "second line")), /multi-line values aren't supported/],
    ["a control character", (t: ReturnType<typeof terminal>) => t.emit("data", `${VALUE}\t`), /control, invisible or direction character/],
    ["an escape sequence", (t: ReturnType<typeof terminal>) => t.emit("data", `${VALUE}\u001b[A`), /control, invisible or direction character/],
    ["Ctrl-C", (t: ReturnType<typeof terminal>) => t.emit("data", "\u0003"), /cancelled/],
    ["stdin closing", (t: ReturnType<typeof terminal>) => t.emit("end"), /stdin closed/],
    ["stdin failing", (t: ReturnType<typeof terminal>) => t.emit("error", new Error("EIO")), /stdin failed: EIO/],
  ])("refuses %s, and puts the terminal back", async (_, act, message) => {
    const t = terminal();
    const answer = t.ask();
    act(t);
    await expect(answer).rejects.toThrow(message);
    expect(t.state.raw).toBe(false);
  });

  it("puts the terminal back on exit, and on SIGTERM re-raises it", async () => {
    const t = terminal();
    const answer = t.ask();
    t.emit("exit");
    expect(t.state.raw).toBe(false);
    const t2 = terminal();
    const answer2 = t2.ask();
    t2.emit("SIGHUP");
    await expect(answer2).rejects.toThrow(/interrupted \(SIGHUP\)/);
    expect(t2.state.raw).toBe(false);
    expect(t2.state.killed).toEqual(["SIGHUP"]);
    t.emit("data", `${VALUE}\r`);
    await answer;
  });
});

/* The developer's CLIs, as stub binaries on PATH that record argv and stdin. */
let stubs: string;
let savedPath: string | undefined;
const calls = () => (existsSync(path.join(stubs, "calls.log")) ? readFileSync(path.join(stubs, "calls.log"), "utf8") : "");
const stdins = () => (existsSync(path.join(stubs, "stdin.log")) ? readFileSync(path.join(stubs, "stdin.log"), "utf8") : "");

beforeAll(() => {
  stubs = mkdtempSync(path.join(tmpdir(), "genesis-stub-clis-"));
  const script = `#!/bin/sh
D='${stubs}'
printf '%s\\n' "$(basename "$0") $*" >> "$D/calls.log"
input=$(cat)
printf '%s\\n---\\n' "$input" >> "$D/stdin.log"
case "$(basename "$0") $*" in
  "supabase secrets list"*) echo '[{"name":"GENESIS_SUPPORT_CLEANUP_SECRET","value":"0f3c"}]' ;;
  "supabase secrets set"*) echo "Finished supabase secrets set." ;;
  "supabase db query"*)
    case "$input" in
      *genesis_settings*) if [ -f "$D/db.json" ]; then cat "$D/db.json"; else echo '[]'; fi ;;
      *"from vault.secrets order"*) echo '[{"name":"SOMETHING_ELSE"}]' ;;
      *) echo '[]' ;;
    esac ;;
  "gh secret list"*) echo '[{"name":"EXPO_TOKEN"}]' ;;
  "gh secret set"*)
    if [ -f "$D/gh-fail" ]; then echo "HTTP 422: rejected value $input" >&2; exit 1; fi
    echo "Set Actions secret" ;;
  "eas env:list"*) printf 'EXPO_TOKEN=a-plain-visible-value\\n' ;;
  *) echo "unexpected" >&2; exit 2 ;;
esac
`;
  for (const tool of ["supabase", "gh", "eas"]) {
    writeFileSync(path.join(stubs, tool), script);
    chmodSync(path.join(stubs, tool), 0o755);
  }
  savedPath = process.env.PATH;
  process.env.PATH = `${stubs}${path.delimiter}${savedPath ?? ""}`;
});
afterAll(() => {
  process.env.PATH = savedPath;
  removeTempDir(stubs);
  cleanupApps();
});
beforeEach(() => {
  for (const f of ["calls.log", "stdin.log", "gh-fail", "db.json"]) rmSync(path.join(stubs, f), { force: true });
});
afterEach(() => {
  // Whatever happened, no value ever reached a tool's argv.
  expect(calls()).not.toContain(VALUE);
});

const settings = {
  namespace: "support",
  keys: {
    githubRepo: { type: "string", default: null, needs: "secret:GITHUB_TOKEN", setup: "github.issues", summary: "reports become GitHub issues" },
    aiAnswers: { type: "boolean", default: true, needs: "secret:AI_PROVIDER_KEY" },
    sourceMaps: { type: "boolean", default: true, needs: "secret:SENTRY_AUTH_TOKEN", store: "ci" },
    webhooks: { type: "boolean", default: true, needs: "secret:GENESIS_SUPPORT_WEBHOOK_SECRET", store: "vault" },
    serverKey: { type: "boolean", default: false, needs: "secret:SERVICE_ROLE", store: "server-env" },
    inbox: { type: "boolean", default: true },
    agentDesk: { type: "boolean", default: true, requires: ["support.inbox"] },
    // Planned: declared ahead of its code. On (as max turns it on), but dormant in the doctor.
    email: { type: "boolean", default: true, needs: "secret:RESEND_API_KEY", planned: true },
    webhookUrl: { type: "string", default: null, needs: "secret:PLANNED_SIGNING_SECRET", setup: "webhook.url", planned: true },
  },
};
const blocks = {
  support: {
    functions: [
      { package: "@marktiderman/genesis-supabase", dir: "functions/genesis-support-cleanup", secrets: ["GENESIS_SUPPORT_CLEANUP_SECRET"] },
      { package: "@marktiderman/genesis-supabase", dir: "functions/genesis-support-notify", secrets: ["GITHUB_TOKEN", "SUPPORT_WEBHOOK_URL"] },
      { package: "@marktiderman/genesis-supabase", dir: "functions/genesis-not-deployed", secrets: ["NEVER_ASKED"] },
    ],
  },
};

function secretsApp(config: Record<string, unknown> = {}, extra: Record<string, string> = {}): string {
  return makeApp(null, {
    "package.json": JSON.stringify({ name: "app", dependencies: { [SUPPORT]: "^0.12.0" } }),
    [`node_modules/${SUPPORT}/package.json`]: JSON.stringify({ name: SUPPORT, version: "0.12.0", genesis: { settings, blocks } }),
    "genesis.config.json": JSON.stringify({ doctor: { rules: { "genesis-behind": "off" } }, ...config }),
    "supabase/.temp/project-ref": "abcdefghijklmnopqrst\n",
    "supabase/functions/genesis-support-cleanup/index.ts": "export {};\n",
    "supabase/functions/genesis-support-notify/index.ts": "export {};\n",
    "eas.json": "{}\n",
    ...extra,
  });
}

const RULES = new Set(["invalid-setting", "setting-requires", "setup-incomplete", "secret-missing"]);
const list = (findings: Array<{ rule: string; level: string; file: string; subject?: string; message: string; fix?: { id: string } }>) =>
  findings.filter((f) => RULES.has(f.rule)).map((f) => `${f.rule} ${f.level} ${f.file}${f.subject ? ` ${f.subject}` : ""} [${f.fix?.id}]: ${f.message}`);

describe("the settings check: setup and secrets", () => {
  it("offline: the dormant setup steps only, no CLI run", async () => {
    const root = secretsApp();
    const result = await runDoctor({ root });
    expect(list(result.findings)).toEqual([
      "setup-incomplete info genesis.config.json support.githubRepo [settings.setup]: support.githubRepo isn't set up yet (reports become GitHub issues), so it stays off: set settings.support.githubRepo in genesis.config.json, and the secret GITHUB_TOKEN (its guided step, github.issues, comes with genesis setup, which isn't available yet)",
    ]);
    expect(calls()).toBe("");
  });

  it("online: reads each store's names through the CLIs and reports what's missing, by name", async () => {
    const root = secretsApp();
    const result = await runDoctor({ root, network: true, database: false });
    expect(list(result.findings).sort()).toEqual([
      "secret-missing warn eas env SENTRY_AUTH_TOKEN [secrets.set]: SENTRY_AUTH_TOKEN isn't set in eas env; settings.support.sourceMaps needs it",
      "secret-missing warn gh secret SENTRY_AUTH_TOKEN [secrets.set]: SENTRY_AUTH_TOKEN isn't set in gh secret; settings.support.sourceMaps needs it",
      "secret-missing warn supabase secrets AI_PROVIDER_KEY [secrets.set]: AI_PROVIDER_KEY isn't set in supabase secrets; settings.support.aiAnswers needs it",
      "secret-missing warn supabase secrets SUPPORT_WEBHOOK_URL [secrets.set]: SUPPORT_WEBHOOK_URL isn't set in supabase secrets; function genesis-support-notify needs it",
      "secret-missing warn supabase vault GENESIS_SUPPORT_WEBHOOK_SECRET [secrets.set]: GENESIS_SUPPORT_WEBHOOK_SECRET isn't set in supabase vault; settings.support.webhooks needs it",
      "setup-incomplete info genesis.config.json support.githubRepo [settings.setup]: support.githubRepo isn't set up yet (reports become GitHub issues), so it stays off: set settings.support.githubRepo in genesis.config.json, and the secret GITHUB_TOKEN (its guided step, github.issues, comes with genesis setup, which isn't available yet)",
    ]);
    // GITHUB_TOKEN only a dormant key and a function need: setup-incomplete covers it. NEVER_ASKED's function isn't deployed.
    expect(JSON.stringify(result.findings)).not.toMatch(/GITHUB_TOKEN isn't|NEVER_ASKED/);
    expect(calls().split("\n").filter(Boolean).sort()).toEqual([
      "eas env:list production --format short",
      "gh secret list --json name",
      "supabase db query --linked -o json -f /dev/stdin",
      "supabase secrets list -o json",
    ]);
    // eas printed a plaintext value: it is dropped with the rest of its output.
    expect(JSON.stringify(toJson(result))).not.toContain("a-plain-visible-value");
  });

  it("asks for the setup's secret once the key is set up", async () => {
    const root = secretsApp({ settings: { "support.githubRepo": "acme/app" } });
    const result = await runDoctor({ root, network: true, database: false });
    expect(list(result.findings).filter((l) => l.includes("GITHUB_TOKEN"))).toEqual([
      "secret-missing warn supabase secrets GITHUB_TOKEN [secrets.set]: GITHUB_TOKEN isn't set in supabase secrets; settings.support.githubRepo and function genesis-support-notify need it",
    ]);
    expect(list(result.findings).some((l) => l.startsWith("setup-incomplete"))).toBe(false);
  });

  it("never asks for a planned key's secret or setup, even when the key is on", async () => {
    const root = secretsApp({ settings: { "support.email": true } });
    const result = await runDoctor({ root, network: true, database: false });
    expect(JSON.stringify(result.findings)).not.toMatch(/RESEND_API_KEY|PLANNED_SIGNING_SECRET|support\.webhookUrl|support\.email/);
  });

  it("gives an info, not an error, for a store it can't check", async () => {
    const root = secretsApp({}, { "supabase/.temp/project-ref": "" });
    rmSync(path.join(root, "supabase/.temp/project-ref"));
    const signedOut: ToolRunner = async () => ({ code: 1, stdout: "", stderr: "not logged in" });
    const result = await runDoctor({ root, network: true, stores: { run: signedOut } });
    expect(list(result.findings).filter((l) => l.startsWith("secret-missing")).sort()).toEqual([
      "secret-missing info eas env [manual:secret-missing]: SENTRY_AUTH_TOKEN not checked: eas exited 1: not logged in",
      "secret-missing info gh secret [manual:secret-missing]: SENTRY_AUTH_TOKEN not checked: gh exited 1: not logged in",
      "secret-missing info supabase secrets [manual:secret-missing]: AI_PROVIDER_KEY, GENESIS_SUPPORT_CLEANUP_SECRET, SUPPORT_WEBHOOK_URL not checked: the app isn't linked to a Supabase project (supabase link)",
      "secret-missing info supabase vault [manual:secret-missing]: GENESIS_SUPPORT_WEBHOOK_SECRET not checked: the app isn't linked to a Supabase project (supabase link)",
    ]);
    expect(result.errors).toBe(0);
  });

  it("reads the database layer with --database, and reports its problems there", async () => {
    const root = secretsApp({ settings: { "support.inbox": { value: true, locked: true } } });
    writeFileSync(path.join(stubs, "db.json"), JSON.stringify([{ key: "support.inbox", value: false, locked: false }, { key: "support.nope", value: "1", locked: false }]));
    const result = await runDoctor({ root, database: true });
    expect(list(result.findings).filter((l) => l.startsWith("invalid-setting"))).toEqual([
      "invalid-setting error genesis_settings support.inbox [manual:invalid-setting]: support.inbox is locked by the file layer: the database layer can't change it (a row in the database layer; a platform admin changes it on the Settings screen)",
      "invalid-setting error genesis_settings support.nope [manual:invalid-setting]: support.nope isn't a setting any installed package declares (a row in the database layer; a platform admin changes it on the Settings screen)",
    ]);
  });
});

describe("setting-requires by layer", () => {
  it("reports a database row's gap there, and leaves it to the Settings screen", async () => {
    const root = secretsApp();
    writeFileSync(path.join(stubs, "db.json"), JSON.stringify([{ key: "support.agentDesk", value: true, locked: false }, { key: "support.inbox", value: false, locked: false }]));
    const result = await runDoctor({ root, database: true });
    expect(list(result.findings).filter((l) => l.startsWith("setting-requires"))).toEqual([
      "setting-requires warn genesis_settings support.agentDesk [manual:setting-requires]: settings.support.agentDesk is on but needs support.inbox, which is off (its value comes from the database layer)",
    ]);
  });
});

describe("the settings and secrets fixes", () => {
  const io = (answers: Record<string, string> = {}) => {
    const out: string[] = [];
    const err: string[] = [];
    const asked: string[] = [];
    return {
      out,
      err,
      asked,
      io: {
        out: (l: string) => out.push(l),
        err: (l: string) => err.push(l),
        promptSecret: async (name: string) => {
          asked.push(name);
          return answers[name] ?? VALUE;
        },
      },
    };
  };

  it("covers the new rules with guided fixes", () => {
    const fixes = builtinFixes();
    for (const rule of ["setting-requires", "setup-incomplete", "secret-missing"]) expect(fixes.some((f) => f.kind === "guided" && f.rules.includes(rule))).toBe(true);
    // settings.review stays, manual, for what remove-unknown and reset leave (an uncertain or locked key).
    expect(fixes.find((f) => f.id === "settings.review")?.kind).toBe("manual");
  });

  it("secrets.set: asks for each value hidden, sends it on stdin only, and verifies", async () => {
    const root = secretsApp();
    const t = io();
    const code = await runFixCommand({ root, target: "secrets.set", yes: true, network: true, json: true }, t.io);
    const printed = [...t.out, ...t.err].join("\n");
    expect(printed).not.toContain(VALUE);
    expect(t.asked.sort()).toEqual(["AI_PROVIDER_KEY", "SENTRY_AUTH_TOKEN", "SUPPORT_WEBHOOK_URL"]);
    const json = JSON.parse(t.out.join("\n")) as { fixes: Array<{ plan: { commands: Array<{ tool: string; args: string[]; stdinSecret?: string }>; manual?: string; secrets: string[] } }> };
    const plan = json.fixes[0]!.plan;
    expect(plan.secrets).toEqual(["AI_PROVIDER_KEY", "SENTRY_AUTH_TOKEN", "SUPPORT_WEBHOOK_URL"]);
    expect(plan.manual).toContain("eas env:create --name SENTRY_AUTH_TOKEN");
    expect(plan.manual).toContain("Add GENESIS_SUPPORT_WEBHOOK_SECRET in the Supabase dashboard: Database → Vault");
    const sets = calls().split("\n").filter((l) => / set /.test(l));
    expect(sets.sort()).toEqual([
      "gh secret set SENTRY_AUTH_TOKEN",
      "supabase secrets set --env-file /dev/stdin",
      "supabase secrets set --env-file /dev/stdin",
    ]);
    expect(stdins()).toContain(`AI_PROVIDER_KEY='${VALUE}'`);
    // Vault is only ever read, by name.
    expect(stdins()).not.toMatch(/create_secret|update_secret/);
    expect(stdins()).toMatch(new RegExp(`\\n${VALUE}\\n---`));
    // The stubs never really store anything, so the re-check still finds them missing.
    expect(code).toBe(1);
  });

  it("secrets.set: a tool echoing the value back is redacted in the error and the JSON", async () => {
    const root = secretsApp();
    writeFileSync(path.join(stubs, "gh-fail"), "");
    const t = io();
    expect(await runFixCommand({ root, target: "secrets.set", yes: true, network: true, json: true }, t.io)).toBe(1);
    const printed = [...t.out, ...t.err].join("\n");
    expect(printed).toContain("rejected value [redacted]");
    expect(printed).not.toContain(VALUE);
  });

  it("secrets.set: refuses without a terminal to ask at, writing and running nothing", async () => {
    const root = secretsApp();
    const out: string[] = [];
    const err: string[] = [];
    expect(await runFixCommand({ root, target: "secrets.set", yes: true, network: true }, { out: (l) => out.push(l), err: (l) => err.push(l) })).toBe(1);
    expect(err.join("\n")).toMatch(/needs .*SENTRY_AUTH_TOKEN.*: run genesis fix secrets.set at a terminal/);
    expect(calls()).not.toMatch(/ set /);
    expect(stdins()).not.toContain(VALUE);
  });

  it("secrets.set: a prompt that fails part-way refuses the fix, redacts what was typed, and runs nothing", async () => {
    const root = secretsApp();
    const out: string[] = [];
    const err: string[] = [];
    let n = 0;
    const promptSecret = async () => {
      if (n++ === 0) return VALUE;
      throw new Error(`terminal went away after ${VALUE}`);
    };
    expect(await runFixCommand({ root, target: "secrets.set", yes: true, network: true, json: true }, { out: (l) => out.push(l), err: (l) => err.push(l), promptSecret })).toBe(1);
    expect(err.join("\n")).toContain("terminal went away after [redacted]. Nothing was written.");
    expect([...out, ...err].join("\n")).not.toContain(VALUE);
    expect(calls()).not.toMatch(/ set /);
    expect(stdins()).not.toContain(VALUE);
  });

  it("the engine drops a plan's secrets after verifying, and redacts what a fix's own apply says", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "genesis-vault-drop-"));
    try {
      const vault = new SecretVault();
      vault.set("API_KEY", VALUE);
      const fix: Fix = defineFix({
        id: "test.secret-apply",
        kind: "guided",
        rules: ["r"],
        title: "t",
        plan: () => ({ summary: "s", commands: [{ tool: "gh", args: ["secret", "set", "API_KEY"], stdinSecret: "API_KEY", why: "w" }] }),
        apply: async (_plan, ctx) => ({ ran: ["x"], notes: [`used ${await (ctx.secrets as SecretVault).use("API_KEY", (v) => v)}`] }),
        verify: () => ({ ok: true }),
      });
      const result = await applyPlan(fix, await planFix(fix, { root, findings: [] }), { root, findings: [], secrets: vault });
      expect(result.notes).toEqual(["used [redacted]"]);
      expect(vault.has("API_KEY")).toBe(false);
    } finally {
      removeTempDir(root);
    }
  });

  it("refuses a plan that names a value where a secret's name goes", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "genesis-vault-name-"));
    try {
      const fix = defineFix({ id: "test.bad", kind: "guided", rules: ["r"], title: "t", plan: () => ({ summary: "s", commands: [{ tool: "gh", args: [], stdinSecret: "ghp_abc", why: "w" }] }) });
      await expect(planFix(fix, { root, findings: [] })).rejects.toThrow(/secret's NAME/);
    } finally {
      removeTempDir(root);
    }
  });

  it("settings.requires turns on the key a setting needs", async () => {
    const root = secretsApp({ settings: { "support.inbox": false } });
    const t = io();
    expect(await runFixCommand({ root, target: "setting-requires", yes: true, network: false }, t.io)).toBe(0);
    expect(JSON.parse(readFileSync(path.join(root, "genesis.config.json"), "utf8")).settings).toEqual({ "support.inbox": true });
    expect(t.out.join("\n")).toContain("Or turn support.agentDesk off instead");
  });

  it("settings.reset takes a value that doesn't fit out, saying what would fit", async () => {
    const root = secretsApp({ settings: { "support.inbox": "yes", "support.aiAnswers": false } });
    const t = io();
    expect(await runFixCommand({ root, target: "settings.reset", yes: true, network: false }, t.io)).toBe(0);
    expect(JSON.parse(readFileSync(path.join(root, "genesis.config.json"), "utf8")).settings).toEqual({ "support.aiAnswers": false });
    expect(t.out.join("\n")).toContain("settings.support.inbox must be true or false");
  });

  it("settings.setup prints the dormant checklist and runs nothing", async () => {
    const root = secretsApp();
    const t = io();
    expect(await runFixCommand({ root, target: "setup-incomplete", yes: true, network: false }, t.io)).toBe(0);
    expect(t.out.join("\n")).toContain("- support.githubRepo: set settings.support.githubRepo in genesis.config.json and its secret GITHUB_TOKEN");
    expect(t.out.join("\n")).not.toContain("genesis setup --step");
    expect(calls()).toBe("");
  });
});

describe("the real runner and the stubs", () => {
  it("writes stdin and never a value in argv", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "genesis-run-"));
    try {
      mkdirSync(path.join(dir, "x"));
      const result = await runTool("gh", ["secret", "set", "API_KEY"], { cwd: path.join(dir, "x"), stdin: VALUE });
      expect(result.code).toBe(0);
      expect(calls()).toBe("gh secret set API_KEY\n");
      expect(stdins()).toContain(VALUE);
    } finally {
      removeTempDir(dir);
    }
  });
});
