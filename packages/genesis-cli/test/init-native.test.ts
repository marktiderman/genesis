// @feat:init-native-template
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { appPnpmSettings, runInitNative } from "../src/blocks/init-native.js";
import { readLock } from "../src/blocks/lock.js";
import { snapshot, tempDir } from "./blocks-helpers.js";

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
    expect(Object.keys(lock.blocks).sort()).toEqual(["account", "app-updates", "push"]);
    expect(lock.files[".eas/workflows/e2e.yml"]?.source).toBe("@marktiderman/genesis-cli:templates/eas/workflows/e2e.yml");
    expect(lock.files["supabase/functions/genesis-push-send/index.ts"]?.source).toBe("@marktiderman/genesis-supabase:functions/genesis-push-send/index.ts");
    expect(lock.files["supabase/tests/database/genesis_push.test.sql"]?.source).toBe("@marktiderman/genesis-supabase:migrations/tests/0005_genesis_push.test.sql");
    expect(lock.substitutions?.["com.example.genesisstarter"]).toBe("com.acmeco.trailnotes");
    // Migrations stay the package's bytes, so the starter's own drift tests pass in the app.
    expect(Object.keys(files).filter((f) => f.startsWith("supabase/migrations/")).every((f) => !files[f]!.startsWith("-- genesis-migration"))).toBe(true);
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

  it("keeps pnpm settings and drops the workspace list", () => {
    expect(appPnpmSettings('packages:\n  - "apps/*"\n\n# why\nnodeLinker: hoisted\n')).toBe("# pnpm settings for this app, from the Genesis monorepo it was made from.\n# why\nnodeLinker: hoisted\n");
  });

  it("drops the monorepo's patched dependencies, whose patch files an app doesn't have", () => {
    const text = "nodeLinker: hoisted\n\npatchedDependencies:\n  # why\n  tsup@8.5.1: patches/tsup@8.5.1.patch\nautoInstallPeers: true\n";
    expect(appPnpmSettings(text)).toBe("# pnpm settings for this app, from the Genesis monorepo it was made from.\nnodeLinker: hoisted\n\nautoInstallPeers: true\n");
  });
});
