// @feat:init-native-template
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { appPnpmSettings, runInitNative } from "../src/blocks/init-native.js";
import { readLock, type GenesisLock } from "../src/blocks/lock.js";
import { runDoctor } from "../src/doctor/index.js";
import { blocksSwitchedOff, parseStarterFeatures, setStarterFeatures } from "../src/blocks/starter-features.js";
import { PACKAGES, snapshot, tempDir } from "./blocks-helpers.js";

/** Every file the lock names, and every migration copy it records, is on disk. */
function lockedButMissing(target: string, lock: GenesisLock): string[] {
  return [...Object.keys(lock.files), ...Object.values(lock.migrations ?? {})].filter((f) => !existsSync(path.join(target, f)));
}

async function init(extra: Partial<Parameters<typeof runInitNative>[0]> = {}) {
  const target = path.join(tempDir(), "trail-notes");
  const result = await runInitNative({ name: "trail-notes", target, bundleId: "com.acmeco.trailnotes", ...extra });
  return { target, result, files: snapshot(target) };
}

describe("genesis init --template native", () => {
  it("copies the files an app owns, and none an app doesn't", async () => {
    const { files } = await init();
    for (const f of ["package.json", "starter.config.ts", "app.config.ts", "src/app/_layout.tsx", ".gitignore", ".env.example", "supabase/config.toml", "__tests__/starter.test.ts"]) expect(files[f], f).toBeDefined();
    for (const f of Object.keys(files)) expect(f).not.toMatch(/^(node_modules|\.expo|ios|android)\/|release\.test\.ts$/);
  });

  it("renames the app everywhere the starter's values were", async () => {
    const { files } = await init({ displayName: "Trail Notes", scheme: "trailnotes" });
    expect(files["starter.config.ts"]).toContain('name: "Trail Notes"');
    expect(files["starter.config.ts"]).toContain('slug: "trail-notes"');
    expect(files["starter.config.ts"]).toContain('scheme: "trailnotes"');
    expect(files["starter.config.ts"]).toContain('bundleId: "com.acmeco.trailnotes"');
    expect(files["supabase/config.toml"]).toContain("com.acmeco.trailnotes,com.acmeco.trailnotes.dev");
    expect(files[".maestro/config.yaml"]).toContain("appId: com.acmeco.trailnotes.dev");
    expect(JSON.parse(files["package.json"]!).name).toBe("trail-notes");
    // The lock keeps the starter's values, to rename templates the same way on upgrade.
    const { "genesis.lock.json": _lock, ...rest } = files;
    expect(Object.values(rest).join("\n")).not.toMatch(/genesisstarter|genesis-rn-starter/);
  });

  it("pins every workspace: dependency to a published version and drops the monorepo's Metro and workspace list", async () => {
    const { files, result } = await init();
    const pkg = files["package.json"]!;
    expect(pkg).not.toContain("workspace:");
    expect(result.dependencies["@marktiderman/genesis-native"]).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(files["metro.config.js"]).not.toContain("monorepoRoot");
    expect(files["pnpm-workspace.yaml"]).toContain("nodeLinker: hoisted");
    expect(files["pnpm-workspace.yaml"]).not.toMatch(/^packages:/m);
    expect(files["pnpm-workspace.yaml"]).not.toMatch(/patchedDependencies|patches\//);
  });

  it("adds the templates and records owned files, blocks and renames in genesis.lock.json", async () => {
    const { target, files } = await init();
    expect(files[".github/workflows/ci.yml"]).toContain("app-ci.yml@GENESIS_SHA");
    expect(files[".github/workflows/database.yml"]).toContain("supabase-ci.yml@GENESIS_SHA");
    expect(files[".github/workflows/genesis-upgrade.yml"]).toBeDefined();
    const lock = readLock(target);
    // Every switch that carries a block ships on.
    expect(Object.keys(lock.blocks).sort()).toEqual(["account", "app-updates", "chat", "notifications", "push", "support-feedback"]);
    expect(lockedButMissing(target, lock)).toEqual([]);
    expect(lock.files[".eas/workflows/e2e.yml"]?.source).toBe("@marktiderman/genesis-cli:templates/eas/workflows/e2e.yml");
    expect(lock.files["supabase/functions/genesis-push-send/index.ts"]?.source).toBe("@marktiderman/genesis-supabase:functions/genesis-push-send/index.ts");
    // 0005's test went with the notifications migration, which supersedes it.
    expect(lock.files["supabase/tests/database/genesis_push.test.sql"]).toBeUndefined();
    expect(lock.files["supabase/tests/database/genesis_notifications.test.sql"]?.source).toBe("@marktiderman/genesis-notifications:migrations/tests/0001_genesis_notifications.test.sql");
    expect(lock.substitutions?.["com.example.genesisstarter"]).toBe("com.acmeco.trailnotes");
    // pr-preview's paths name the app's code folder: nothing is left to replace.
    expect(lock.substitutions?.REPLACE_WITH_APP_FOLDER).toBe("src");
    expect(files[".eas/workflows/pr-preview.yml"]).toContain('- "src/**"');
    expect(Object.entries(files).filter(([f, t]) => f.startsWith(".eas/") && t.includes("REPLACE_WITH_")).map(([f]) => f)).toEqual([]);
    // Migrations stay the package's bytes, so the starter's own drift tests pass in the app.
    expect(Object.keys(files).filter((f) => f.startsWith("supabase/migrations/")).every((f) => !files[f]!.startsWith("-- genesis-migration"))).toBe(true);
  });

  it("--without leaves a switched-off block out whole: the lock lists only blocks that are on, and every file it names is there", async () => {
    const { target, files, result } = await init({ without: ["chat", "support", "updates"] });
    const lock = readLock(target);
    // support-feedback's account stays: it's carried by no switch (and other blocks need it).
    expect(Object.keys(lock.blocks).sort()).toEqual(["account", "notifications", "push"]);
    expect(result.leftOut.sort()).toEqual(["app-updates", "chat", "support-feedback"]);
    expect(lockedButMissing(target, lock)).toEqual([]);
    expect(Object.keys(lock.migrations ?? {}).some((k) => /chat|support|release_policy/.test(k))).toBe(false);
    // The switches are off in the app's config.
    expect(files["starter.config.ts"]).toMatch(/\n\s*chat: false,/);
    expect(files["starter.config.ts"]).toMatch(/\n\s*support: false,/);
    expect(files["starter.config.ts"]).toMatch(/\n\s*updates: false,/);
    expect(files["starter.config.ts"]).toMatch(/\n\s*push: true,/);
    // None of their database: migrations, tests, the starter's chat_people, the schema the API served.
    const supabase = Object.keys(files).filter((f) => f.startsWith("supabase/"));
    expect(supabase.filter((f) => /chat|support|release_policy/.test(f))).toEqual([]);
    expect(supabase.filter((f) => /genesis_push\.sql$|genesis-push-send\/index\.ts$|genesis_notifications\.sql$/.test(f))).toHaveLength(3);
    expect(files["supabase/config.toml"]).toContain('schemas = ["public", "graphql_public"]');
    expect(files["supabase/config.toml"]).not.toContain("genesis_chat");
    expect(files["supabase/config.toml"]).toMatch(/\[functions\.genesis-push-send\]\s*\nverify_jwt = false/);
    expect(JSON.parse(files["genesis.config.json"]!).doctor.supabase.exposedSchemas).toEqual(["public"]);
  });

  it("leaves out a switched-off block's Edge Function and its config.toml section", async () => {
    const { target, files } = await init({ without: ["push"] });
    expect(Object.keys(readLock(target).blocks)).not.toContain("push");
    expect(Object.keys(files).filter((f) => f.includes("genesis-push-send") || f.endsWith("_genesis_push.sql"))).toEqual([]);
    expect(files["supabase/config.toml"]).not.toContain("genesis-push-send");
    expect(files["supabase/config.toml"]).toContain("[functions.genesis-apple-revoke]");
    expect(lockedButMissing(target, readLock(target))).toEqual([]);
  });

  it("a fresh app passes genesis doctor, warning only about the store ids a person has to fill in, each saying what replaces it", async () => {
    const { target, result } = await init({ without: ["chat", "support", "updates"] });
    // The packages the app installs: the starter's, as the monorepo installed them.
    symlinkSync(path.join(PACKAGES, "..", "apps", "genesis-rn-starter", "node_modules"), path.join(target, "node_modules"), "dir");
    const doctor = await runDoctor({ root: target, contracts: false });
    expect(doctor.errors).toBe(0);
    expect(doctor.ok).toBe(true);
    const warnings = doctor.findings.filter((f) => f.level !== "info");
    expect(warnings.map((f) => `${f.rule} ${f.subject}`)).toEqual([
      "eas-placeholder REPLACE_WITH_APP_STORE_CONNECT_APP_ID",
      "eas-placeholder REPLACE_WITH_APPLE_TEAM_ID",
      "eas-placeholder REPLACE_WITH_PATH_TO_GOOGLE_SERVICE_ACCOUNT_JSON",
    ]);
    expect(doctor.findings.filter((f) => f.rule === "lock-files")).toEqual([]);
    // init's summary lists the same placeholders, one step each, with what replaces it.
    for (const w of warnings) expect(result.steps.some((s) => s.includes(w.subject!))).toBe(true);
    expect(result.steps.find((s) => s.includes("REPLACE_WITH_APPLE_TEAM_ID"))).toMatch(/^eas\.json appleTeamId: replace REPLACE_WITH_APPLE_TEAM_ID with your Apple Developer Team ID/);
  });

  it("refuses a switch the starter doesn't have, and one that leaves no way to sign in", async () => {
    await expect(runInitNative({ name: "ok-app", target: path.join(tempDir(), "a"), without: ["chats"] })).rejects.toThrow(/chats isn't a feature switch/);
    await expect(runInitNative({ name: "ok-app", target: path.join(tempDir(), "b"), without: ["emailSignIn", "appleSignIn"] })).rejects.toThrow(/nobody could sign in/);
  });

  it("refuses a folder that isn't empty, and bad names", async () => {
    const target = path.join(tempDir(), "taken");
    mkdirSync(target);
    writeFileSync(path.join(target, "keep.txt"), "mine");
    await expect(runInitNative({ name: "taken", target })).rejects.toThrow(/isn't empty/);
    expect(existsSync(path.join(target, "package.json"))).toBe(false);
    await expect(runInitNative({ name: "Bad Name", target: path.join(tempDir(), "x") })).rejects.toThrow(/app slug/);
    await expect(runInitNative({ name: "ok-app", target: path.join(tempDir(), "y"), bundleId: "nodots" })).rejects.toThrow(/bundle id/);
  });

  it("reads and sets starter.config.ts switches as text, and keeps a switched-off block a block that's on requires", () => {
    const config = "defineStarter({\n  app: { name: \"A\" },\n  features: {\n    // Off: a comment.\n    chat: true,\n    support: true, // trailing\n  },\n});\n";
    expect(parseStarterFeatures(config)).toEqual({ chat: true, support: true });
    expect(parseStarterFeatures(setStarterFeatures(config, { chat: false }))).toEqual({ chat: false, support: true });
    expect(() => setStarterFeatures(config, { nope: false })).toThrow(/no features\.nope/);
    const manifests = [
      { id: "account", requires: [] },
      { id: "support-feedback", requires: ["account"] },
    ];
    const map = { accountDeletion: ["account"], support: ["support-feedback"] };
    expect([...blocksSwitchedOff({ accountDeletion: false, support: true }, map, manifests, ["account", "support-feedback"])]).toEqual([]);
    expect([...blocksSwitchedOff({ accountDeletion: false, support: false }, map, manifests, ["account", "support-feedback"])].sort()).toEqual([["account", "accountDeletion"], ["support-feedback", "support"]]);
    // A block the app doesn't have isn't reported, and doesn't keep anything.
    expect([...blocksSwitchedOff({ accountDeletion: false }, map, manifests, ["account"])]).toEqual([["account", "accountDeletion"]]);
  });

  it("keeps pnpm settings and drops the workspace list", () => {
    expect(appPnpmSettings('packages:\n  - "apps/*"\n\n# why\nnodeLinker: hoisted\n')).toBe("# pnpm settings for this app, from the Genesis monorepo it was made from.\n# why\nnodeLinker: hoisted\n");
  });

  it("drops the monorepo's patched dependencies, whose patch files an app doesn't have", () => {
    const text = "nodeLinker: hoisted\n\npatchedDependencies:\n  # why\n  tsup@8.5.1: patches/tsup@8.5.1.patch\nautoInstallPeers: true\n";
    expect(appPnpmSettings(text)).toBe("# pnpm settings for this app, from the Genesis monorepo it was made from.\nnodeLinker: hoisted\n\nautoInstallPeers: true\n");
  });
});
