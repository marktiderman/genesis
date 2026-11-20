// @feat:settings-core
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { appIdOf, manifestSql, ManifestError, runSettingsSync, syncManifest, toManifestRow } from "../src/settings-manifest.js";
import type { ToolRunner } from "../src/exec/run.js";
import { makeApp } from "./doctor-helpers.js";

const SUPPORT = "@marktiderman/genesis-support";
const declared = {
  namespace: "support",
  keys: {
    inbox: { type: "boolean", default: true },
    dumpRetentionDays: { type: "number", default: 90, min: 7, max: 365, integer: true },
  },
};

function app(config: unknown, name = "@acme/field-app"): string {
  return makeApp(null, {
    "package.json": JSON.stringify({ name, dependencies: { [SUPPORT]: "^0.12.0" } }),
    [`node_modules/${SUPPORT}/package.json`]: JSON.stringify({ name: SUPPORT, version: "0.12.0", genesis: { settings: declared } }),
    "genesis.config.json": JSON.stringify(config),
  });
}

describe("genesis settings sync", () => {
  it("builds the manifest row from the app's files", () => {
    const row = toManifestRow(app({ preset: "standard", settings: { "support.inbox": { value: false, locked: true } } }));
    expect(row).toMatchObject({
      app_id: "field-app",
      name: "@acme/field-app",
      packages: { [SUPPORT]: "0.12.0" },
      preset: "standard",
      file_settings: { "support.inbox": { value: false, locked: true } },
      catalogue: { "support.inbox": { type: "boolean" }, "support.dumpRetentionDays": { type: "number", min: 7, max: 365, integer: true } },
    });
    expect(row.config_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("takes --app-id, and refuses one the table wouldn't", () => {
    const root = app({}, "Not An Id!");
    expect(() => appIdOf(root)).toThrow(ManifestError);
    expect(appIdOf(root, "sample-app")).toBe("sample-app");
    expect(() => appIdOf(root, "Sample App")).toThrow(/isn't an app id/);
  });

  it("writes one row, quoting every value", () => {
    const row = toManifestRow(app({ settings: { "support.inbox": true } }), { appId: "sample-app" });
    const sql = manifestSql({ ...row, name: "O'Brien's app" });
    expect(sql).toContain("insert into public.genesis_app_manifest");
    expect(sql).toContain("'O''Brien''s app'");
    expect(sql).toContain("on conflict (one) do update set app_id = excluded.app_id");
    expect(sql).toContain(`'${JSON.stringify(row.catalogue)}'::jsonb`);
  });

  it("runs the SQL through the linked project, and says when supabase fails", async () => {
    const root = app({});
    const row = toManifestRow(root);
    const calls: Array<{ args: readonly string[]; stdin?: string }> = [];
    const ok: ToolRunner = async (_tool, args, options) => (calls.push({ args, stdin: options.stdin }), { code: 0, stdout: "", stderr: "" });
    await syncManifest(root, row, ok);
    expect(calls[0]?.args).toEqual(["db", "query", "--linked", "--yes", "-f", "/dev/stdin"]);
    expect(calls[0]?.stdin).toBe(manifestSql(row));
    const fails: ToolRunner = async () => ({ code: 1, stdout: "", stderr: "Cannot find project ref\nmore" });
    await expect(syncManifest(root, row, fails)).rejects.toThrow("supabase exited 1: Cannot find project ref");
  });

  it("refuses a preset that isn't one of the presets instead of writing max", () => {
    expect(() => toManifestRow(app({ preset: "maximum" }))).toThrow(/"preset" is "maximum", not one of max, standard, min/);
  });

  it("on Windows, sends the SQL through a temp file, removed after", async () => {
    const root = app({});
    const row = toManifestRow(root);
    let file = "";
    let sent = "";
    const run: ToolRunner = async (_tool, args, options) => {
      file = args[args.indexOf("-f") + 1]!;
      sent = readFileSync(file, "utf8");
      expect(options.stdin).toBeUndefined();
      return { code: 0, stdout: "", stderr: "" };
    };
    await syncManifest(root, row, run, { platform: "win32", projectRef: "abcdefghijklmnopqrst" });
    expect(file).not.toBe("/dev/stdin");
    expect(sent).toBe(manifestSql(row));
    expect(existsSync(file)).toBe(false);
  });
});

describe("genesis settings sync (the command)", () => {
  const REF = "abcdefghijklmnopqrst";
  const linkedApp = () => {
    const root = app({});
    return makeApp(null, {
      "package.json": readFileSync(`${root}/package.json`, "utf8"),
      [`node_modules/${SUPPORT}/package.json`]: readFileSync(`${root}/node_modules/${SUPPORT}/package.json`, "utf8"),
      "genesis.config.json": "{}",
      "supabase/.temp/project-ref": `${REF}\n`,
    });
  };
  function io(over: Partial<Parameters<typeof runSettingsSync>[1]> = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const calls: Array<readonly string[]> = [];
    const run: ToolRunner = async (_tool, args) => (calls.push(args), { code: 0, stdout: "", stderr: "" });
    return { out, err, calls, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l), isTTY: true, run, platform: "linux" as const, ...over } };
  }

  it("names the linked project and asks before writing", async () => {
    const root = linkedApp();
    const asked: string[] = [];
    const t = io({ confirm: async (q) => (asked.push(q), true) });
    expect(await runSettingsSync({ dir: root }, t.io)).toBe(0);
    expect(t.out[0]).toContain(`goes to Supabase project ${REF} (linked)`);
    expect(asked).toEqual([`Write it to ${REF}?`]);
    expect(t.calls).toEqual([["db", "query", "--linked", "--yes", "-f", "/dev/stdin"]]);
  });

  it("writes nothing when the answer is no", async () => {
    const t = io({ confirm: async () => false });
    expect(await runSettingsSync({ dir: linkedApp() }, t.io)).toBe(1);
    expect(t.calls).toEqual([]);
    expect(t.out).toContain("Nothing written.");
  });

  it("refuses without a terminal unless --yes, and --yes skips the question", async () => {
    const root = linkedApp();
    const noTty = io({ isTTY: false, confirm: async () => true });
    expect(await runSettingsSync({ dir: root }, noTty.io)).toBe(1);
    expect(noTty.err.join("\n")).toMatch(/pass --yes/);
    expect(noTty.calls).toEqual([]);
    const yes = io({ isTTY: false });
    expect(await runSettingsSync({ dir: root, yes: true }, yes.io)).toBe(0);
    expect(yes.calls).toHaveLength(1);
  });

  it("takes --project-ref, and refuses one that isn't a ref or no project at all", async () => {
    const t = io();
    expect(await runSettingsSync({ dir: app({}), yes: true, projectRef: "zyxwvutsrqponmlkjihg" }, t.io)).toBe(0);
    expect(t.calls).toEqual([["db", "query", "--linked", "--project-ref", "zyxwvutsrqponmlkjihg", "--yes", "-f", "/dev/stdin"]]);
    const bad = io();
    expect(await runSettingsSync({ dir: app({}), yes: true, projectRef: "x; rm" }, bad.io)).toBe(1);
    expect(bad.err.join("\n")).toMatch(/isn't a Supabase project ref/);
    const none = io();
    expect(await runSettingsSync({ dir: app({}), yes: true }, none.io)).toBe(1);
    expect(none.err.join("\n")).toMatch(/No Supabase project is linked/);
    expect(none.calls).toEqual([]);
  });

  it("refuses an invalid preset", async () => {
    const t = io();
    expect(await runSettingsSync({ dir: app({ preset: "maximum" }), yes: true, projectRef: REF }, t.io)).toBe(1);
    expect(t.calls).toEqual([]);
  });

  it("--print prints the SQL and runs nothing", async () => {
    const t = io();
    expect(await runSettingsSync({ dir: app({}), print: true }, t.io)).toBe(0);
    expect(t.out[0]).toContain("insert into public.genesis_app_manifest");
    expect(t.calls).toEqual([]);
  });
});
