// @feat:settings-core
import { describe, expect, it } from "vitest";
import { appIdOf, buildManifest, manifestSql, ManifestError, syncManifest } from "../src/settings-manifest.js";
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
    const row = buildManifest(app({ preset: "standard", settings: { "support.inbox": { value: false, locked: true } } }));
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
    const row = buildManifest(app({ settings: { "support.inbox": true } }), { appId: "sample-app" });
    const sql = manifestSql({ ...row, name: "O'Brien's app" });
    expect(sql).toContain("insert into public.genesis_app_manifest");
    expect(sql).toContain("'O''Brien''s app'");
    expect(sql).toContain("on conflict (one) do update set app_id = excluded.app_id");
    expect(sql).toContain(`'${JSON.stringify(row.catalogue)}'::jsonb`);
  });

  it("runs the SQL through the linked project, and says when supabase fails", async () => {
    const root = app({});
    const row = buildManifest(root);
    const calls: Array<{ args: readonly string[]; stdin?: string }> = [];
    const ok: ToolRunner = async (_tool, args, options) => (calls.push({ args, stdin: options.stdin }), { code: 0, stdout: "", stderr: "" });
    await syncManifest(root, row, ok);
    expect(calls[0]?.args).toEqual(["db", "query", "--linked", "-f", "/dev/stdin"]);
    expect(calls[0]?.stdin).toBe(manifestSql(row));
    const fails: ToolRunner = async () => ({ code: 1, stdout: "", stderr: "Cannot find project ref\nmore" });
    await expect(syncManifest(root, row, fails)).rejects.toThrow("supabase exited 1: Cannot find project ref");
  });
});
