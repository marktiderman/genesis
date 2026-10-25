// @feat:cli-upgrade
import { rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/blocks/files.js";
import { readLock, writeLock } from "../src/blocks/lock.js";
import { mergeThreeWay } from "../src/blocks/owned.js";
import { bumpPackageJson, compareVersions } from "../src/upgrade/bump-core.mjs";
import { codemodsFor, uncoveredBreaks, type Codemod } from "../src/upgrade/codemods.js";
import { runUpgrade, type ReleaseLookup } from "../src/upgrade/index.js";
import { fakePackage, makeApp, read, snapshot } from "./blocks-helpers.js";

const lookup = (packages: Record<string, string>, latest: Record<string, string> = {}): ReleaseLookup => ({
  release: () => ({ version: "2.0.0", packages }),
  latest: (name) => latest[name] ?? null,
});

const TEMPLATE_V1 = "name: e2e\nsteps:\n  - one\n  - two\n";
const TEMPLATE_V2 = "name: e2e\nsteps:\n  - one\n  - two\n  - three\n";

/** An app on genesis-fixture 1.0.0, owning one file whose source the "installed" package ships. */
function app(owned: string, packageText: string) {
  const root = makeApp({
    "package.json": JSON.stringify({ name: "fixture-app", dependencies: { "@marktiderman/genesis-fixture": "^1.0.0", "@marktiderman/genesis-ui": "workspace:^", react: "19.3.0" } }, null, 2) + "\n",
    "supabase/functions/fixture-send/index.ts": owned,
  });
  fakePackage(root, "@marktiderman/genesis-fixture", {}, { "functions/fixture-send/index.ts": packageText });
  writeLock(root, { version: 1, blocks: {}, files: { "supabase/functions/fixture-send/index.ts": { source: "@marktiderman/genesis-fixture:functions/fixture-send/index.ts", sha256: sha256(TEMPLATE_V1) } } });
  return root;
}

const upgrade = (root: string, extra: Partial<Parameters<typeof runUpgrade>[0]> = {}) =>
  runUpgrade({ root, lookup: lookup({ "@marktiderman/genesis-fixture": "1.2.0" }), install: false, doctor: false, ...extra });

describe("the bump (shared with the genesis-upgrade workflow)", () => {
  it("moves plain versions up, keeps the prefix, leaves workspace: and downgrades alone", () => {
    const text = JSON.stringify({ dependencies: { "@marktiderman/genesis-ui": "^2.0.0", "@marktiderman/genesis-core": "workspace:^", "@marktiderman/genesis-forms": "3.0.0", "left-pad": "1.0.0" } }, null, 2);
    const result = bumpPackageJson("package.json", text, (n) => ({ "@marktiderman/genesis-ui": "2.1.0", "@marktiderman/genesis-forms": "2.9.0" })[n] ?? null);
    expect(result.changes).toEqual([{ file: "package.json", name: "@marktiderman/genesis-ui", from: "^2.0.0", to: "^2.1.0" }]);
    expect(result.skipped.map((s) => s.why)).toEqual(["not a plain version", "newer than 2.9.0"]);
    expect(JSON.parse(result.text!).dependencies["left-pad"]).toBe("1.0.0");
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
  });
});

describe("genesis upgrade", () => {
  it("--dry-run reports the bump and writes nothing", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V2);
    const before = snapshot(root);
    const report = await upgrade(root, { dryRun: true });
    expect(report.changes).toEqual([{ file: "package.json", name: "@marktiderman/genesis-fixture", from: "^1.0.0", to: "^1.2.0" }]);
    expect(report.refreshed[0]).toMatchObject({ outcome: "updated" });
    expect(snapshot(root)).toEqual(before);
  });

  it("bumps every Genesis package and takes a new owned file the app didn't change", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V2);
    const report = await upgrade(root);
    expect(JSON.parse(read(root, "package.json")).dependencies["@marktiderman/genesis-fixture"]).toBe("^1.2.0");
    expect(read(root, "supabase/functions/fixture-send/index.ts")).toBe(TEMPLATE_V2);
    expect(readLock(root).files["supabase/functions/fixture-send/index.ts"]!.sha256).toBe(sha256(TEMPLATE_V2));
    expect(report.summary).toContain("@marktiderman/genesis@2.0.0");
  });

  it("merges the app's edits with the new version three ways, or keeps the app's file with --keep-mine", async () => {
    const mine = "name: my e2e\nsteps:\n  - one\n  - two\n";
    const merged3 = "name: my e2e\nsteps:\n  - one\n  - two\n  - three\n";
    expect(mergeThreeWay(mine, TEMPLATE_V1, TEMPLATE_V2)).toEqual({ text: merged3, clean: true });
    // Installed before the upgrade: V1 (the base). The install brings V2.
    const install = (root: string) => void fakePackage(root, "@marktiderman/genesis-fixture", { version: "1.2.0" }, { "functions/fixture-send/index.ts": TEMPLATE_V2 });
    const root = app(mine, TEMPLATE_V1);
    const report = await upgrade(root, { install });
    expect(report.refreshed[0]).toMatchObject({ outcome: "merged" });
    expect(read(root, "supabase/functions/fixture-send/index.ts")).toBe(merged3);

    const conflicted = app("name: e2e\nsteps:\n  - one\n  - mine\n", TEMPLATE_V1);
    const conflict = await upgrade(conflicted, { install: (r) => void fakePackage(r, "@marktiderman/genesis-fixture", {}, { "functions/fixture-send/index.ts": "name: e2e\nsteps:\n  - one\n  - theirs\n" }) });
    expect(conflict.refreshed[0]).toMatchObject({ outcome: "conflict" });
    expect(read(conflicted, "supabase/functions/fixture-send/index.ts")).toBe("name: e2e\nsteps:\n  - one\n  - mine\n");
    expect(read(conflicted, "supabase/functions/fixture-send/index.ts.genesis-next")).toContain("<<<<<<< yours");

    const keep = app(mine, TEMPLATE_V1);
    const kept = await upgrade(keep, { install, keepMine: true });
    expect(read(keep, "supabase/functions/fixture-send/index.ts")).toBe(mine);
    expect(read(keep, "supabase/functions/fixture-send/index.ts.genesis-next")).toBe(TEMPLATE_V2);
    expect(kept.refreshed[0]).toMatchObject({ outcome: "kept-mine" });
  });

  it("waits while .genesis-next is there, then takes the app's resolution once it's gone", async () => {
    const mine = "name: my e2e\nsteps:\n  - one\n  - two\n";
    const install = (r: string) => void fakePackage(r, "@marktiderman/genesis-fixture", { version: "1.2.0" }, { "functions/fixture-send/index.ts": TEMPLATE_V2 });
    const root = app(mine, TEMPLATE_V1);
    expect((await upgrade(root, { install, keepMine: true })).refreshed[0]).toMatchObject({ outcome: "kept-mine" });
    expect(readLock(root).files["supabase/functions/fixture-send/index.ts"]!.pending).toBe(sha256(TEMPLATE_V2));
    // Run again before resolving: nothing rewritten, still waiting.
    expect((await upgrade(root, { install: false })).refreshed[0]).toMatchObject({ outcome: "kept-mine", detail: expect.stringContaining("waiting for you") });
    // Resolve: keep a merged file, delete .genesis-next.
    writeFileSync(path.join(root, "supabase/functions/fixture-send/index.ts"), `${mine}  - three\n`);
    rmSync(path.join(root, "supabase/functions/fixture-send/index.ts.genesis-next"));
    expect((await upgrade(root, { install: false })).refreshed[0]).toMatchObject({ outcome: "resolved" });
    const entry = readLock(root).files["supabase/functions/fixture-send/index.ts"]!;
    expect(entry.sha256).toBe(sha256(TEMPLATE_V2));
    expect(entry.pending).toBeUndefined();
    expect((await upgrade(root, { install: false })).refreshed[0]).toMatchObject({ outcome: "unchanged" });
  });

  it("never brings back an owned file the app deleted", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V2);
    rmSync(path.join(root, "supabase/functions/fixture-send/index.ts"));
    const report = await upgrade(root);
    expect(report.refreshed[0]).toMatchObject({ outcome: "kept-deleted" });
  });

  it("runs a codemod only when its package crosses its version, and names major moves without one", async () => {
    const ran: string[] = [];
    const mod: Codemod = { id: "fixture-rename", package: "@marktiderman/genesis-fixture", version: "1.1.0", description: "Renames a prop.", run: () => (ran.push("ran"), []) };
    expect(codemodsFor([{ file: "p", name: mod.package, from: "^1.0.0", to: "^1.2.0" }], [mod])).toEqual([mod]);
    expect(codemodsFor([{ file: "p", name: mod.package, from: "^1.1.0", to: "^1.2.0" }], [mod])).toEqual([]);
    expect(uncoveredBreaks([{ file: "p", name: "@marktiderman/genesis-ui", from: "^0.1.0", to: "^0.2.0" }], [mod])).toHaveLength(1);
    await upgrade(app(TEMPLATE_V1, TEMPLATE_V1), { codemods: [mod] });
    expect(ran).toEqual(["ran"]);
  });
});
